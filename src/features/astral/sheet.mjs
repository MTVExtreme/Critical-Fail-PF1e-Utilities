import { MODULE_ID } from "../../constants.mjs";
import { isAstralEnabled } from "../../settings.mjs";
import { getBurn, setBurnPoints, setBurnShown } from "./burn.mjs";
import { setShieldPoints, setShieldShown, setShieldTempFirst } from "./state.mjs";

function toElement(html) {
  if (!html) return null;
  if (html instanceof HTMLElement) return html;
  return html[0] || null;
}

function isPf1ActorSheet(app) {
  return Boolean(
    app?.actor &&
      (app.options?.classes?.includes?.("pf1") ||
        app.constructor?.name?.startsWith?.("ActorSheetPF") ||
        app.template?.includes?.("systems/pf1")),
  );
}

function shieldOf(actor) {
  return actor.getFlag?.(MODULE_ID, "energyShield") || { value: 0, max: 0 };
}

export function registerShieldSheet() {
  const paint = (app, html) => {
    try {
      if (!isAstralEnabled() || !isPf1ActorSheet(app) || app.actor?.limited) return;
      const root = toElement(html);
      injectShieldSettings(app, root);
      injectShield(app, root);
      injectBurn(app, root);
    } catch (error) {
      console.error(`${MODULE_ID} | Shield sheet`, error);
    }
  };
  Hooks.on("renderActorSheetPF", paint);
  Hooks.on("renderActorSheet", paint);
}

function injectShieldSettings(app, root) {
  const settingsTab = root?.querySelector(".tab.settings");
  if (!settingsTab || settingsTab.querySelector(".cf-shield-actor-settings")) return;

  const stored = app.actor.getFlag(MODULE_ID, "energyShield") || {};
  const burn = getBurn(app.actor);
  const shown = Boolean(stored.showOnSheet);
  const tempFirst = Boolean(stored.tempFirst);
  const editable = app.actor.isOwner ? "" : "disabled";
  const section = document.createElement("div");
  section.className = "cf-shield-actor-settings critical-fail-pf1e-utilities misc-settings";
  section.innerHTML = `
    <h2>${game.i18n.localize("CFUTIL.Shield.SettingsHeader")}</h2>
    <div class="cf-shield-toggles">
      <div class="form-group">
        <label>${game.i18n.localize("CFUTIL.Shield.ShowOnSheet")}</label>
        <div class="form-fields">
          <input class="cf-shield-show" type="checkbox" ${shown ? "checked" : ""} ${editable}>
        </div>
        <p class="hint">${game.i18n.localize("CFUTIL.Shield.ShowOnSheetHint")}</p>
      </div>
      <div class="form-group">
        <label>${game.i18n.localize("CFUTIL.Shield.TempFirst")}</label>
        <div class="form-fields">
          <input class="cf-shield-temp-first" type="checkbox" ${tempFirst ? "checked" : ""} ${editable}>
        </div>
        <p class="hint">${game.i18n.localize("CFUTIL.Shield.TempFirstHint")}</p>
      </div>
      <div class="form-group">
        <label>${game.i18n.localize("CFUTIL.Burn.Show")}</label>
        <div class="form-fields">
          <input class="cf-burn-show" type="checkbox" ${burn.shown ? "checked" : ""} ${editable}>
        </div>
        <p class="hint">${game.i18n.localize("CFUTIL.Burn.ShowHint")}</p>
      </div>
    </div>
  `;
  section.querySelector(".cf-shield-show")?.addEventListener("change", (event) => {
    setShieldShown(app.actor, event.currentTarget.checked).catch((error) => console.error(`${MODULE_ID} | Shield sheet`, error));
  });
  section.querySelector(".cf-shield-temp-first")?.addEventListener("change", (event) => {
    setShieldTempFirst(app.actor, event.currentTarget.checked).catch((error) => console.error(`${MODULE_ID} | Shield sheet`, error));
  });
  section.querySelector(".cf-burn-show")?.addEventListener("change", (event) => {
    setBurnShown(app.actor, event.currentTarget.checked).catch((error) => console.error(`${MODULE_ID} | Burn`, error));
  });
  const misc = settingsTab.querySelector(".misc-settings");
  if (misc) misc.after(section);
  else settingsTab.append(section);
}

function injectShield(app, root) {
  if (!root || root.querySelector(".cf-energy-shield")) return;
  if (!app.actor.getFlag(MODULE_ID, "energyShield")?.showOnSheet) return;
  const anchor = root.querySelector(".attributes > .info-box-header.health-details")
    || root.querySelector(".health.base-health")
    || root.querySelector(".health.wounds-vigor");
  if (!anchor) return;

  const shield = shieldOf(app.actor);
  const editable = app.actor.isOwner;
  const box = document.createElement("div");
  box.className = "info-box-header health-details cf-energy-shield";
  box.innerHTML = `
    <h3>${game.i18n.localize("CFUTIL.Shield.Label")}</h3>
    <div class="info-box-joined">
      <div class="info-box current">
        <h5>${game.i18n.localize("PF1.Current")}</h5>
        <div class="value"><input class="cf-shield-value" type="number" min="0" step="1" value="${Number(shield.value) || 0}" ${editable ? "" : "disabled"}></div>
      </div>
      <div class="info-box maximum">
        <h5>${game.i18n.localize("PF1.Maximum")}</h5>
        <div class="value"><input class="cf-shield-max" type="number" min="0" step="1" value="${Number(shield.max) || 0}" ${editable ? "" : "disabled"}></div>
      </div>
    </div>
  `;

  const commit = () => {
    const value = box.querySelector(".cf-shield-value")?.value;
    const max = box.querySelector(".cf-shield-max")?.value;
    setShieldPoints(app.actor, { value, max }).catch((error) => console.error(`${MODULE_ID} | Shield sheet`, error));
  };
  for (const input of box.querySelectorAll("input")) {
    input.addEventListener("change", commit);
    input.addEventListener("focus", () => input.select());
  }
  box.addEventListener("pointerenter", () => {
    showShieldTooltip(app.actor, box).catch((error) => console.error(`${MODULE_ID} | Shield tooltip`, error));
  });
  box.addEventListener("pointerleave", () => game.tooltip.deactivate());
  anchor.after(box);
}

function injectBurn(app, root) {
  if (!root || root.querySelector(".cf-burn") || !getBurn(app.actor).shown) return;
  const nonlethal = root.querySelector(".info-box.nonlethal");
  if (!nonlethal) return;
  const burn = getBurn(app.actor);
  const editable = app.actor.isOwner;
  const box = document.createElement("div");
  box.className = "info-box burn cf-burn";
  box.innerHTML = `
    <h5>${game.i18n.localize("CFUTIL.Burn.Label")}</h5>
    <div class="value"><input class="cf-burn-value" type="number" min="0" step="1" value="${Number(burn.value) || 0}" ${editable ? "" : "disabled"}></div>
  `;
  const input = box.querySelector("input");
  input?.addEventListener("change", () => {
    setBurnPoints(app.actor, input.value).catch((error) => console.error(`${MODULE_ID} | Burn`, error));
  });
  input?.addEventListener("focus", () => input.select());
  box.addEventListener("pointerenter", () => {
    showBurnTooltip(app.actor, box).catch((error) => console.error(`${MODULE_ID} | Burn tooltip`, error));
  });
  box.addEventListener("pointerleave", () => game.tooltip.deactivate());
  nonlethal.after(box);
}

async function showShieldTooltip(actor, element) {
  const shield = actor.getFlag(MODULE_ID, "energyShield") || { value: 0, max: 0 };
  const base = `flags.${MODULE_ID}.energyShield`;
  await activateExtendedTooltip(element, {
    header: game.i18n.localize("CFUTIL.Shield.Hint"),
    paths: [
      { path: `@${base}.value`, value: Number(shield.value) || 0 },
      { path: `@${base}.max`, value: Number(shield.max) || 0 },
    ],
    sources: [{
      untyped: true,
      sources: [{ name: game.i18n.localize("CFUTIL.Shield.Label"), value: Number(shield.max) || 0 }],
    }],
  });
}

async function showBurnTooltip(actor, element) {
  const burn = getBurn(actor);
  await activateExtendedTooltip(element, {
    header: game.i18n.localize("CFUTIL.Burn.Hint"),
    paths: [
      { path: `@flags.${MODULE_ID}.burn.value`, value: Number(burn.value) || 0 },
      { path: "@attributes.hp.nonlethal", value: Number(actor.system?.attributes?.hp?.nonlethal) || 0 },
      { path: "@attributes.hp.value", value: Number(actor.system?.attributes?.hp?.value) || 0 },
    ],
  });
}

async function activateExtendedTooltip(element, context) {
  const render = foundry.applications?.handlebars?.renderTemplate;
  if (!render) return;
  const html = await render("systems/pf1/templates/extended-tooltip.hbs", context);
  const template = document.createElement("template");
  template.innerHTML = html;
  game.tooltip.activate(element, { content: template.content, cssClass: "pf1 extended" });
}
