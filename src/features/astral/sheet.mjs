import { MODULE_ID } from "../../constants.mjs";
import { isAstralEnabled } from "../../settings.mjs";
import { getBurn, setBurnPoints, setBurnShown } from "./burn.mjs";
import { setShieldPoints, setShieldShown, setShieldTempFirst } from "./state.mjs";
import { markDirectPool } from "./token-health.mjs";
import { formatRegen, parseRegen, setShieldRegen } from "./regen.mjs";

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

/** Same relative entry as PF1 health boxes: `-20` subtracts, `+25` adds, `480` sets. `500 -20` is also applied. */
function adjustPool(current, raw) {
  const command = String(raw ?? "").trim();
  const expression = command.match(/^(\d+)\s*([+-])\s*(\d+)$/);
  let next;
  if (expression) {
    const left = Number(expression[1]);
    const right = Number(expression[3]);
    next = expression[2] === "+" ? left + right : left - right;
  } else {
    const adjust = globalThis.pf1?.utils?.internal?.adjustNumberByStringCommand;
    next = adjust ? adjust(Number(current) || 0, command) : Number(command);
  }
  if (!Number.isFinite(next)) next = Number(current) || 0;
  return Math.max(0, Math.floor(next));
}

export function registerShieldSheet() {
  const paint = (app, html) => {
    try {
      if (!isAstralEnabled() || !isPf1ActorSheet(app) || app.actor?.limited) return;
      const root = toElement(html);
      injectShieldSettings(app, root);
      injectShield(app, root);
      injectShieldRegen(app, root);
      injectBurn(app, root);
      watchDirectSubtraction(app, root);
    } catch (error) {
      console.error(`${MODULE_ID} | Shield sheet`, error);
    }
  };
  Hooks.on("renderActorSheetPF", paint);
  Hooks.on("renderActorSheet", paint);
}

function injectShieldSettings(app, root) {
  const settingsTab = root?.querySelector(".tab.settings");
  if (!settingsTab) return;

  const stored = app.actor.getFlag(MODULE_ID, "energyShield") || {};
  const shown = Boolean(stored.showOnSheet);
  const tempFirst = Boolean(stored.tempFirst);
  const editable = app.actor.isOwner ? "" : "disabled";
  if (!settingsTab.querySelector(".cf-shield-actor-settings")) {
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
      </div>
    `;
    section.querySelector(".cf-shield-show")?.addEventListener("change", (event) => {
      setShieldShown(app.actor, event.currentTarget.checked).catch((error) => console.error(`${MODULE_ID} | Shield sheet`, error));
    });
    section.querySelector(".cf-shield-temp-first")?.addEventListener("change", (event) => {
      setShieldTempFirst(app.actor, event.currentTarget.checked).catch((error) => console.error(`${MODULE_ID} | Shield sheet`, error));
    });
    const misc = settingsTab.querySelector(".misc-settings");
    if (misc) misc.after(section);
    else settingsTab.append(section);
  }

  if (!settingsTab.querySelector(".cf-burn-actor-settings")) {
    const burn = getBurn(app.actor);
    const section = document.createElement("div");
    section.className = "cf-burn-actor-settings critical-fail-pf1e-utilities misc-settings";
    section.innerHTML = `
      <h2>${game.i18n.localize("CFUTIL.Burn.SettingsHeader")}</h2>
      <div class="form-group">
        <label>${game.i18n.localize("CFUTIL.Burn.Show")}</label>
        <div class="form-fields">
          <input class="cf-burn-show" type="checkbox" ${burn.shown ? "checked" : ""} ${editable}>
        </div>
        <p class="hint">${game.i18n.localize("CFUTIL.Burn.ShowHint")}</p>
      </div>
    `;
    section.querySelector(".cf-burn-show")?.addEventListener("change", (event) => {
      setBurnShown(app.actor, event.currentTarget.checked).catch((error) => console.error(`${MODULE_ID} | Burn`, error));
    });
    const shield = settingsTab.querySelector(".cf-shield-actor-settings");
    const misc = settingsTab.querySelector(".misc-settings");
    const anchor = shield || misc;
    if (anchor) anchor.after(section);
    else settingsTab.append(section);
  }
}

function watchDirectSubtraction(app, root) {
  if (!root || root.dataset.cfDirectShift) return;
  root.dataset.cfDirectShift = "1";
  root.addEventListener("change", (event) => {
    if (!event.shiftKey && !game.keyboard?.isModifierActive?.("SHIFT")) return;
    const name = event.target?.getAttribute?.("name");
    if (name === "system.attributes.hp.value") markDirectPool(app.actor, "hp");
    else if (name === "system.attributes.hp.temp") markDirectPool(app.actor, "temp");
  }, true);
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
        <div class="value"><input class="cf-shield-value" type="text" inputmode="numeric" value="${Number(shield.value) || 0}" ${editable ? "" : "disabled"}></div>
      </div>
      <div class="info-box maximum">
        <h5>${game.i18n.localize("PF1.Maximum")}</h5>
        <div class="value"><input class="cf-shield-max" type="text" inputmode="numeric" value="${Number(shield.max) || 0}" ${editable ? "" : "disabled"}></div>
      </div>
    </div>
  `;

  const commit = (event) => {
    const stored = shieldOf(app.actor);
    const valueInput = box.querySelector(".cf-shield-value");
    const maxInput = box.querySelector(".cf-shield-max");
    const max = event?.target === maxInput ? adjustPool(stored.max, maxInput?.value) : Math.max(0, Math.floor(Number(stored.max) || 0));
    const value = event?.target === valueInput ? adjustPool(stored.value, valueInput?.value) : Math.max(0, Math.floor(Number(stored.value) || 0));
    if (valueInput) valueInput.value = String(Math.min(max, value));
    if (maxInput) maxInput.value = String(max);
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

/** Shield Regeneration and Shield Fast Healing rows, placed after PF1's own Fast Healing field. */
function injectShieldRegen(app, root) {
  if (!root || root.querySelector(".cf-shield-regen-row")) return;
  const prepared = app.actor.getFlag(MODULE_ID, "energyShield");
  if (!prepared?.showOnSheet) return;
  const saved = app.actor._source?.flags?.[MODULE_ID]?.energyShield || {};
  const editable = app.actor.isOwner;
  const none = game.i18n.localize("PF1.None");

  const rows = [
    {
      key: "regeneration",
      label: "CFUTIL.Shield.Regeneration",
      hint: "CFUTIL.Shield.RegenerationHint",
      text: formatRegen(saved.regeneration, saved.regenBypass),
      saved: Number(saved.regeneration) || 0,
      total: Number(prepared.regeneration) || 0,
      stopped: Boolean(prepared.regenStopped) && Number(prepared.regeneration) > 0,
    },
    {
      key: "fastHealing",
      label: "CFUTIL.Shield.FastHealing",
      hint: "CFUTIL.Shield.FastHealingHint",
      text: Number(saved.fastHealing) > 0 ? String(Math.floor(Number(saved.fastHealing))) : "",
      saved: Number(saved.fastHealing) || 0,
      total: Number(prepared.fastHealing) || 0,
      stopped: false,
    },
  ];

  const pf1Input = root.querySelector('input[name="system.traits.fastHealing"]')
    || root.querySelector('input[name="system.traits.regen"]');
  const pf1Row = pf1Input?.closest(".fast-healing, .regeneration, .form-group, li");

  const build = (row) => {
    let element;
    if (pf1Row) {
      element = pf1Row.cloneNode(true);
      element.classList.remove("fast-healing", "regeneration", "inactive");
      element.removeAttribute("data-tooltip-extended");
      element.querySelectorAll("[data-tooltip-extended]").forEach((node) => node.removeAttribute("data-tooltip-extended"));
    } else {
      element = document.createElement("div");
      element.className = "form-group";
      element.innerHTML = `<label></label><div class="form-fields"><input type="text"></div>`;
    }
    element.classList.add("cf-shield-regen-row", `cf-shield-${row.key}`);
    if (!row.text && !row.total) element.classList.add("inactive");
    const label = element.querySelector("label");
    if (label) label.textContent = game.i18n.localize(row.label);
    const input = element.querySelector("input");
    if (!input) return null;
    input.removeAttribute("name");
    input.removeAttribute("id");
    input.type = "text";
    input.value = row.text;
    input.placeholder = none;
    input.disabled = !editable;

    const tip = [game.i18n.localize(row.hint)];
    if (row.total !== row.saved) tip.push(game.i18n.format("CFUTIL.Shield.FromChanges", { total: row.total }));
    if (row.stopped) tip.push(game.i18n.localize("CFUTIL.Shield.RegenStopped"));
    element.dataset.tooltip = tip.join(" ");

    if (row.total !== row.saved) {
      const total = document.createElement("span");
      total.className = "cf-shield-regen-total";
      total.textContent = `(${row.total})`;
      input.after(total);
    }
    if (row.stopped) {
      const icon = document.createElement("i");
      icon.className = "fa-solid fa-ban cf-shield-regen-stopped";
      input.after(icon);
    }

    input.addEventListener("focus", () => input.select());
    input.addEventListener("change", (event) => {
      event.stopPropagation();
      const parsed = parseRegen(input.value);
      if (!parsed || (row.key === "fastHealing" && parsed.bypass)) {
        ui.notifications.warn(game.i18n.localize("CFUTIL.Shield.RegenInvalid"));
        input.value = row.text;
        return;
      }
      const patch = row.key === "regeneration"
        ? { regeneration: parsed.amount, regenBypass: parsed.bypass }
        : { fastHealing: parsed.amount };
      setShieldRegen(app.actor, patch).catch((error) => console.error(`${MODULE_ID} | Shield regeneration`, error));
    });
    return element;
  };

  const elements = rows.map(build).filter(Boolean);
  if (!elements.length) return;
  if (pf1Row) {
    pf1Row.after(...elements);
    return;
  }
  const settings = root.querySelector(".cf-shield-actor-settings .cf-shield-toggles");
  if (settings) settings.append(...elements);
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
    <div class="value"><input class="cf-burn-value" type="text" inputmode="numeric" value="${Number(burn.value) || 0}" ${editable ? "" : "disabled"}></div>
  `;
  const input = box.querySelector("input");
  input?.addEventListener("change", () => {
    const next = adjustPool(getBurn(app.actor).value, input.value);
    input.value = String(next);
    setBurnPoints(app.actor, next).catch((error) => console.error(`${MODULE_ID} | Burn`, error));
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
