import { DICE_MODES, FLAG_DICE_MODE, FLAG_DISABLE_SURGE, MODULE_ID } from "../../constants.mjs";
import { isSurgeEnabled } from "../../settings.mjs";
import {
  isActionSurgeDisabled,
  setActionSurgeDisabled,
} from "./action-surge.mjs";
import {
  chanceFromSphereCL,
  getActorDiceMode,
  getSphereCasterLevel,
  rollManualSpellSurge,
  rollManualSphereSurge,
} from "./roll.mjs";

export function registerSurgeSheetUI() {
  Hooks.on("renderActorSheetPF", injectActorSheetUI);
  Hooks.on("renderActorSheet", (app, html) => {
    if (!isPf1ActorSheet(app)) return;
    injectActorSheetUI(app, html);
  });

  Hooks.on("renderItemSheetPF", injectItemSheetUI);
  Hooks.on("renderItemSheet", (app, html) => {
    if (!isPf1ItemSheet(app)) return;
    injectItemSheetUI(app, html);
  });

  Hooks.on("renderItemActionSheet", injectActionSheetUI);
}

function isPf1ActorSheet(app) {
  return Boolean(
    app?.actor &&
      (app.options?.classes?.includes?.("pf1") ||
        app.constructor?.name?.startsWith?.("ActorSheetPF") ||
        app.template?.includes?.("systems/pf1")),
  );
}

function isPf1ItemSheet(app) {
  return Boolean(
    app?.item &&
      (app.options?.classes?.includes?.("pf1") ||
        app.constructor?.name?.includes?.("ItemSheetPF") ||
        app.template?.includes?.("systems/pf1")),
  );
}

/**
 * @param {ActorSheet} app
 * @param {JQuery|HTMLElement} html
 */
function injectActorSheetUI(app, html) {
  const root = toElement(html);
  if (!root) return;

  // Settings controls remain visible so GMs can configure even when roller is off
  injectActorSettings(app, root);

  if (!isSurgeEnabled()) return;
  injectSpellbookButtons(app, root);
  injectSpheresButton(app, root);
}

/**
 * @param {ItemSheet} app
 * @param {JQuery|HTMLElement} html
 */
function injectItemSheetUI(app, html) {
  const root = toElement(html);
  if (!root) return;
  injectItemDisableToggle(app, root);
}

/**
 * Dice mode on the actor Settings tab.
 * @param {ActorSheet} app
 * @param {HTMLElement} root
 */
function injectActorSettings(app, root) {
  const settingsTab = root.querySelector(".tab.settings");
  if (!settingsTab || settingsTab.querySelector(".cf-surge-actor-settings")) return;

  const mode = getActorDiceMode(app.actor);
  const options = Object.entries(DICE_MODES)
    .map(([key, cfg]) => {
      const label = foundry.utils.escapeHTML(game.i18n.localize(cfg.labelKey));
      const selected = key === mode ? "selected" : "";
      return `<option value="${key}" ${selected}>${label}</option>`;
    })
    .join("");

  const section = document.createElement("div");
  section.className = "cf-surge-actor-settings critical-fail-pf1e-utilities misc-settings";
  section.innerHTML = `
    <h2>${game.i18n.localize("CFUTIL.Surge.ActorSettingsHeader")}</h2>
    <div class="form-group">
      <label>${game.i18n.localize("CFUTIL.Surge.ActorDiceMode")}</label>
      <div class="form-fields">
        <select name="flags.${MODULE_ID}.${FLAG_DICE_MODE}">
          ${options}
        </select>
      </div>
      <p class="hint">${game.i18n.localize("CFUTIL.Surge.ActorDiceModeHint")}</p>
    </div>
  `;

  const misc = settingsTab.querySelector(".misc-settings");
  if (misc) misc.after(section);
  else settingsTab.append(section);
}

/**
 * @param {ActorSheet} app
 * @param {HTMLElement} root
 */
function injectSpellbookButtons(app, root) {
  const summaries = root.querySelectorAll(".spellbook-configuration .summary");
  for (const summary of summaries) {
    if (summary.querySelector(".cf-surge-chance")) continue;

    const clBox = summary.querySelector(".spellcasting-cl");
    const button = document.createElement("div");
    button.className = "info-box cf-surge-chance rollable critical-fail-pf1e-utilities";
    button.dataset.tooltip = game.i18n.localize("CFUTIL.Surge.ThresholdHint");
    button.innerHTML = `
      <h5><a class="rollable">${game.i18n.localize("CFUTIL.Surge.Button")}</a></h5>
      <span class="value cf-surge-chance-value"><i class="fa-solid fa-dice-d20" inert></i></span>
    `;

    if (clBox) clBox.after(button);
    else summary.append(button);

    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      rollManualSpellSurge(app.actor);
    });
  }
}

/**
 * @param {ActorSheet} app
 * @param {HTMLElement} root
 */
function injectSpheresButton(app, root) {
  const spheresTab = root.querySelector(".tab.spheres");
  if (!spheresTab || spheresTab.querySelector(".cf-surge-cl-column")) return;

  const clAttr = spheresTab.querySelector(".attribute-grid .attribute.cl");
  if (!clAttr) return;

  const cl = getSphereCasterLevel(app.actor);
  const chanceNum = cl == null ? null : chanceFromSphereCL(cl, app.actor);
  const chanceLabel = chanceNum == null ? "—" : `${chanceNum}%`;

  const wrap = document.createElement("div");
  wrap.className = "cf-surge-cl-column critical-fail-pf1e-utilities";

  const button = document.createElement("div");
  button.className = "cf-surge-chance-spheres rollable";
  button.dataset.tooltip = game.i18n.localize("CFUTIL.Surge.SpherePromptTitle");
  button.innerHTML = `
    <span class="cf-surge-label">${game.i18n.localize("CFUTIL.Surge.Button")}</span>
    <span class="cf-surge-chance-value">${chanceLabel}</span>
  `;

  clAttr.replaceWith(wrap);
  wrap.append(clAttr, button);

  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    rollManualSphereSurge(app.actor);
  });
}

/**
 * Disable-surge checkbox at the bottom of Details for spells & feats.
 * @param {ItemSheet} app
 * @param {HTMLElement} root
 */
function injectItemDisableToggle(app, root) {
  const item = app.item;
  if (!item) return;
  if (!["spell", "feat"].includes(item.type)) return;
  if (root.querySelector(".cf-surge-item-disable")) return;

  const details = root.querySelector(".tab.details");
  if (!details) return;

  const checked = item.getFlag(MODULE_ID, FLAG_DISABLE_SURGE) === true ? "checked" : "";
  const block = document.createElement("div");
  block.className = "cf-surge-item-disable critical-fail-pf1e-utilities";
  block.innerHTML = `
    <h3 class="form-header">${game.i18n.localize("CFUTIL.Surge.ActorSettingsHeader")}</h3>
    <div class="form-group stacked">
      <label class="checkbox">
        <input type="checkbox" name="flags.${MODULE_ID}.${FLAG_DISABLE_SURGE}" ${checked}>
        ${game.i18n.localize("CFUTIL.Surge.ItemDisable")}
      </label>
      <p class="hint">${game.i18n.localize("CFUTIL.Surge.ItemDisableHint")}</p>
    </div>
  `;
  details.append(block);
}

/**
 * Surge checkbox on Item Action Usage tab (next to Concentration / Dismissable).
 * @param {FormApplication} app
 * @param {JQuery|HTMLElement} html
 */
function injectActionSheetUI(app, html) {
  if (!isSurgeEnabled()) return;
  const root = toElement(html);
  if (!root || root.querySelector(".cf-surge-action-toggle")) return;

  const action = app.action ?? app.object;
  const item = app.item ?? action?.item;
  if (!item || !action) return;

  const actionId = action.id ?? action._id;
  if (!actionId) return;

  const checked = isActionSurgeDisabled(item, action);
  const dismissLabel = root.querySelector("label.duration-dismissable");
  const fields = dismissLabel?.closest(".form-fields") ?? dismissLabel?.parentElement;
  if (!fields) return;

  const label = document.createElement("label");
  label.className = "checkbox cf-surge-action-toggle critical-fail-pf1e-utilities";
  label.dataset.tooltip = game.i18n.localize("CFUTIL.Surge.ActionDisableHint");
  label.innerHTML = `
    <input type="checkbox" ${checked ? "checked" : ""}>
    ${game.i18n.localize("CFUTIL.Surge.ActionDisable")}
  `;

  const input = label.querySelector("input");
  input.addEventListener("change", async (event) => {
    event.preventDefault();
    event.stopPropagation();
    await setActionSurgeDisabled(item, actionId, input.checked);
  });

  fields.append(label);
}

/**
 * @param {JQuery|HTMLElement|HTMLElement[]} html
 * @returns {HTMLElement|null}
 */
function toElement(html) {
  if (!html) return null;
  if (html instanceof HTMLElement) return html;
  if (Array.isArray(html)) return html[0] ?? null;
  if (html[0] instanceof HTMLElement) return html[0];
  if (typeof html.get === "function") return html.get(0) ?? null;
  return null;
}
