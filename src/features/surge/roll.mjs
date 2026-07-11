import {
  MODULE_ID,
  SEVERITY_BANDS,
  SPELL_SURGE_PER_LEVEL,
  SPHERE_SURGE_PER_CL,
  DICE_MODES,
  FLAG_DICE_MODE,
} from "../../constants.mjs";
import { isSurgeEnabled } from "../../settings.mjs";
import { getSurgeModifiers } from "./changes.mjs";
import { isItemSurgeDisabled } from "./action-surge.mjs";

/**
 * @param {number} spellLevel
 * @param {Actor} [actor]
 * @returns {number}
 */
export function chanceFromSpellLevel(spellLevel, actor = null) {
  const level = Math.max(0, Math.floor(Number(spellLevel) || 0));
  const mods = getSurgeModifiers(actor);
  const perLevel = SPELL_SURGE_PER_LEVEL + mods.perLevel;
  return Math.clamp(Math.floor(level * perLevel + mods.base), 0, 100);
}

/**
 * @param {number} casterLevel
 * @param {Actor} [actor]
 * @returns {number}
 */
export function chanceFromSphereCL(casterLevel, actor = null) {
  const cl = Math.max(0, Math.floor(Number(casterLevel) || 0));
  const mods = getSurgeModifiers(actor);
  const perCL = SPHERE_SURGE_PER_CL + mods.perCL;
  return Math.clamp(Math.floor(cl * perCL + mods.base), 0, 100);
}

/**
 * @param {number} chancePercent
 */
export function avoidSurgeDC(chancePercent) {
  const chance = Math.clamp(Math.floor(Number(chancePercent) || 0), 0, 100);
  if (chance <= 0) return 1;
  if (chance >= 100) return 101;
  return chance + 1;
}

/**
 * @param {number} total
 */
export function severityFromRoll(total) {
  const n = Math.clamp(Math.floor(Number(total) || 0), 0, 100);
  const band = SEVERITY_BANDS.find((b) => n >= b.min && n <= b.max) ?? SEVERITY_BANDS[0];
  return {
    id: band.id,
    min: band.min,
    max: band.max,
    label: game.i18n.localize(band.labelKey),
  };
}

/**
 * @param {Actor} actor
 * @returns {"normal"|"kh"|"kl"}
 */
export function getActorDiceMode(actor) {
  const mode = actor?.getFlag?.(MODULE_ID, FLAG_DICE_MODE) || "normal";
  return mode in DICE_MODES ? mode : "normal";
}

/**
 * @param {object} options
 * @param {Actor} options.actor
 * @param {number} options.chance
 * @param {string} options.sourceLabel
 * @param {Item} [options.item]
 * @param {string} [options.mode]
 */
export async function rollSurgeChance({ actor, chance, sourceLabel, item = null, mode = "manual" }) {
  if (!isSurgeEnabled()) {
    ui.notifications.warn(game.i18n.localize("CFUTIL.Surge.Disabled"));
    return null;
  }

  if (item && isItemSurgeDisabled(item)) {
    ui.notifications.warn(game.i18n.localize("CFUTIL.Surge.ItemDisabled"));
    return null;
  }

  if (!actor) {
    ui.notifications.warn("No actor for Surge Chance roll.");
    return null;
  }

  const chancePercent = Math.clamp(Math.floor(Number(chance) || 0), 0, 100);
  const dc = avoidSurgeDC(chancePercent);
  const diceMode = getActorDiceMode(actor);

  const chanceRoll = await createSurgeRoll({
    actor,
    flavor: game.i18n.localize("CFUTIL.Surge.ChanceRoll"),
    target: dc <= 100 ? dc : null,
    diceMode,
  });
  const surged = chanceRoll.total <= chancePercent;

  let severity = null;
  let severityRoll = null;
  if (surged) {
    // Severity always uses a flat 1d100
    severityRoll = await createSurgeRoll({
      actor,
      flavor: game.i18n.localize("CFUTIL.Surge.SeverityRoll"),
      diceMode: "normal",
    });
    severity = severityFromRoll(severityRoll.total);
  }

  const speaker = ChatMessage.getSpeaker({ actor });
  const name = item?.name ?? actor.name;
  const flavor = game.i18n.format("CFUTIL.Surge.ChatFlavor", {
    name,
    source: sourceLabel,
  });

  const resultLabel = surged
    ? game.i18n.localize("CFUTIL.Surge.Surged")
    : game.i18n.localize("CFUTIL.Surge.Safe");
  const resultClass = surged ? "surged" : "safe";
  const dcDisplay = dc > 100 ? "—" : String(dc);
  const esc = foundry.utils.escapeHTML.bind(foundry.utils);
  const diceLabel = game.i18n.localize(DICE_MODES[diceMode].labelKey);
  const chanceDiceDetail = formatDiceResults(chanceRoll);

  let content = `
    <div class="critical-fail-pf1e-utilities cf-surge-card" data-mode="${mode}">
      <div class="cf-surge-source"><em>${esc(sourceLabel)}</em></div>
      <div><strong>${game.i18n.localize("CFUTIL.Surge.AvoidDC")}:</strong> ${dcDisplay}
        <span class="notes">(${chancePercent}% · ${game.i18n.format("CFUTIL.Surge.SurgeOnRange", { chance: chancePercent })} · ${esc(diceLabel)})</span>
      </div>
      <div><strong>${game.i18n.localize("CFUTIL.Surge.ChanceRoll")}:</strong> ${chanceRoll.total}${chanceDiceDetail}
        → <span class="cf-surge-result ${resultClass}">${resultLabel}</span>
      </div>`;

  if (surged && severity && severityRoll) {
    content += `
      <div><strong>${game.i18n.localize("CFUTIL.Surge.SeverityRoll")}:</strong> ${severityRoll.total}
        → <span class="cf-surge-severity">${esc(severity.label)}</span>
        <span class="notes">(${severity.min}–${severity.max})</span>
      </div>`;
  }

  content += `</div>`;

  const rolls = [chanceRoll];
  if (severityRoll) rolls.push(severityRoll);

  await ChatMessage.create({
    speaker,
    flavor,
    content,
    rolls,
    flags: {
      [MODULE_ID]: {
        surge: true,
        surged,
        chance: chancePercent,
        avoidDC: dc,
        chanceTotal: chanceRoll.total,
        severity: severity?.id ?? null,
        severityTotal: severityRoll?.total ?? null,
        diceMode,
        mode,
        itemUuid: item?.uuid ?? null,
      },
    },
  });

  return { chanceRoll, severityRoll, surged, severity, dc, chancePercent, diceMode };
}

/**
 * @param {{ actor: Actor, flavor: string, target?: number|null, diceMode?: string }} opts
 */
async function createSurgeRoll({ actor, flavor, target = null, diceMode = "normal" }) {
  const mode = diceMode in DICE_MODES ? diceMode : "normal";
  const formula = DICE_MODES[mode].formula;
  const roll = new Roll(formula);
  roll.options.flavor = flavor;
  if (Number.isFinite(target)) {
    roll.options.target = target;
    roll.options.defense = target;
  }
  return roll.evaluate();
}

/**
 * Show every individual die face when multiple dice were rolled (e.g. 2d100kh).
 * Kept results are plain; discarded/inactive faces are struck through.
 * @param {Roll} roll
 * @returns {string} HTML snippet (empty for a single die)
 */
function formatDiceResults(roll) {
  const faces = [];
  for (const term of roll.dice ?? []) {
    for (const r of term.results ?? []) {
      const value = r.result ?? r.value;
      const kept = r.active !== false && !r.discarded;
      faces.push({ value, kept });
    }
  }

  if (faces.length <= 1) return "";

  const parts = faces.map((f) => {
    if (f.kept) return `<span class="cf-surge-die kept">${f.value}</span>`;
    return `<span class="cf-surge-die discarded" title="${game.i18n.localize("CFUTIL.Surge.DieDiscarded")}">${f.value}</span>`;
  });

  return ` <span class="notes cf-surge-dice-detail">[${parts.join(", ")}]</span>`;
}

/**
 * @param {Actor} actor
 */
export async function rollManualSpellSurge(actor) {
  if (!isSurgeEnabled()) {
    ui.notifications.warn(game.i18n.localize("CFUTIL.Surge.Disabled"));
    return null;
  }

  const level = await promptSpellLevel();
  if (level == null) return null;

  const chance = chanceFromSpellLevel(level, actor);
  const sourceLabel = game.i18n.format("CFUTIL.Surge.SourceManualSpell", { level, chance });
  return rollSurgeChance({ actor, chance, sourceLabel, mode: "manual-spell" });
}

/**
 * @param {Actor} actor
 */
export async function rollManualSphereSurge(actor) {
  if (!isSurgeEnabled()) {
    ui.notifications.warn(game.i18n.localize("CFUTIL.Surge.Disabled"));
    return null;
  }

  const selection = await promptSphereSelection(actor);
  if (!selection) return null;

  const { sphereKey, sphereLabel, cl } = selection;
  const chance = chanceFromSphereCL(cl, actor);
  const sourceLabel = game.i18n.format("CFUTIL.Surge.SourceManualSphere", {
    sphere: sphereLabel,
    cl,
    chance,
  });
  return rollSurgeChance({
    actor,
    chance,
    sourceLabel,
    mode: "manual-sphere",
  });
}

/**
 * @param {Actor} actor
 * @param {string|null} [sphereKey]
 * @returns {number|null}
 */
export function getSphereCasterLevel(actor, sphereKey = null) {
  const spheres = actor?.system?.spheres;
  if (!spheres?.cl) return null;
  if (sphereKey && spheres.cl[sphereKey]?.total != null) {
    return Number(spheres.cl[sphereKey].total) || 0;
  }
  if (spheres.cl.total != null) return Number(spheres.cl.total) || 0;
  return null;
}

/**
 * Magic sphere options for the actor (overall + per-sphere).
 * @param {Actor} actor
 * @returns {{ key: string|null, label: string, cl: number }[]}
 */
export function getMagicSphereOptions(actor) {
  const options = [];
  const overall = getSphereCasterLevel(actor, null);
  if (overall != null) {
    options.push({
      key: null,
      label: game.i18n.localize("CFUTIL.Surge.OverallCL"),
      cl: overall,
    });
  }

  const magic = globalThis.pf1s?.config?.magicSpheres ?? CONFIG.PF1SPHERES?.magicSpheres ?? {};
  const clData = actor?.system?.spheres?.cl ?? {};
  for (const [key, cfg] of Object.entries(magic)) {
    const cl = Number(clData[key]?.total);
    if (!Number.isFinite(cl)) continue;
    const label = game.i18n.localize(cfg.label) !== cfg.label ? game.i18n.localize(cfg.label) : cfg.label;
    options.push({ key, label: String(label || key), cl });
  }

  return options;
}

/**
 * @returns {Promise<number|null>}
 */
async function promptSpellLevel() {
  const DialogV2 = foundry.applications.api.DialogV2;
  try {
    const result = await DialogV2.prompt({
      window: { title: game.i18n.localize("CFUTIL.Surge.PromptTitle") },
      content: `
        <div class="form-group">
          <label>${game.i18n.localize("CFUTIL.Surge.PromptLabel")}</label>
          <input type="number" name="level" value="1" min="1" max="9" step="1" autofocus />
        </div>`,
      ok: {
        label: game.i18n.localize("CFUTIL.Surge.Button"),
        callback: (_event, button) => {
          const input = button.form.elements.level;
          return Math.clamp(Math.floor(Number(input?.value) || 1), 1, 9);
        },
      },
      rejectClose: false,
    });
    return typeof result === "number" ? result : null;
  } catch {
    return null;
  }
}

/**
 * @param {Actor} actor
 * @returns {Promise<{ sphereKey: string|null, sphereLabel: string, cl: number }|null>}
 */
async function promptSphereSelection(actor) {
  const options = getMagicSphereOptions(actor);
  if (!options.length) {
    ui.notifications.warn(game.i18n.localize("CFUTIL.Surge.NoSphereData"));
    return null;
  }

  // Only one option — skip dialog
  if (options.length === 1) {
    const only = options[0];
    return { sphereKey: only.key, sphereLabel: only.label, cl: only.cl };
  }

  const optionHtml = options
    .map((o, i) => {
      const value = o.key ?? "";
      const text = foundry.utils.escapeHTML(`${o.label} (CL ${o.cl})`);
      return `<option value="${foundry.utils.escapeHTML(value)}" ${i === 0 ? "selected" : ""}>${text}</option>`;
    })
    .join("");

  const DialogV2 = foundry.applications.api.DialogV2;
  try {
    const selectedKey = await DialogV2.prompt({
      window: { title: game.i18n.localize("CFUTIL.Surge.SpherePromptTitle") },
      content: `
        <div class="form-group">
          <label>${game.i18n.localize("CFUTIL.Surge.SpherePromptLabel")}</label>
          <select name="sphere">${optionHtml}</select>
        </div>`,
      ok: {
        label: game.i18n.localize("CFUTIL.Surge.Button"),
        callback: (_event, button) => button.form.elements.sphere?.value ?? "",
      },
      rejectClose: false,
    });

    if (selectedKey == null) return null;
    const key = selectedKey === "" ? null : selectedKey;
    const match = options.find((o) => o.key === key) ?? options[0];
    return { sphereKey: match.key, sphereLabel: match.label, cl: match.cl };
  } catch {
    return null;
  }
}
