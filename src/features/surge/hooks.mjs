import { isAutoSurgeOnCast } from "../../settings.mjs";
import {
  doesActionCauseSurge,
  isExemptFromSurgeBySetting,
  isItemSurgeDisabled,
} from "./action-surge.mjs";
import {
  chanceFromSpellLevel,
  chanceFromSphereCL,
  getSphereCasterLevel,
  rollSurgeChance,
} from "./roll.mjs";

/** Dedupe ActionUse + DisplayCard for the same item within a short window. */
const recentSurgeKeys = new Map();

export function registerSurgeHooks() {
  Hooks.on("pf1PostActionUse", onPostActionUse);
  Hooks.on("pf1DisplayCard", onDisplayCard);
}

/**
 * @param {object} actionUse
 * @param {ChatMessage|null} message
 */
async function onPostActionUse(actionUse, message) {
  if (!isAutoSurgeOnCast()) return;
  if (!message) return;

  const item = actionUse?.item;
  const actor = actionUse?.actor ?? item?.actor;
  const action = actionUse?.action;
  if (!item || !actor) return;
  if (isItemSurgeDisabled(item)) return;
  if (isExemptFromSurgeBySetting(item)) return;
  if (action && !doesActionCauseSurge(item, action)) return;

  const ctx = resolveSurgeContext(item, actor, actionUse.shared?.rollData);
  if (!ctx) return;

  if (!claimSurgeSlot(actor, item, "action")) return;

  await rollSurgeChance({
    actor,
    item,
    chance: ctx.chance,
    sourceLabel: ctx.sourceLabel,
    mode: ctx.mode,
  });
}

/**
 * @param {Item} item
 */
function onDisplayCard(item) {
  if (!isAutoSurgeOnCast()) return;
  if (!item || item.type !== "spell") return;
  if (isItemSurgeDisabled(item)) return;
  if (isExemptFromSurgeBySetting(item)) return;

  const actor = item.actor;
  if (!actor) return;

  // Use first available action only to honor per-action Disable Surge
  const action = getPrimaryAction(item);
  if (action && !doesActionCauseSurge(item, action)) return;

  const ctx = resolveSurgeContext(item, actor, null);
  if (!ctx) return;

  setTimeout(async () => {
    if (!claimSurgeSlot(actor, item, "card")) return;
    await rollSurgeChance({
      actor,
      item,
      chance: ctx.chance,
      sourceLabel: ctx.sourceLabel,
      mode: "spell-card",
    });
  }, 300);
}

/**
 * @param {Item} item
 * @returns {object|null}
 */
function getPrimaryAction(item) {
  if (!item) return null;
  if (typeof item.actions?.get === "function") {
    const first = item.actions.contents?.[0] ?? [...item.actions][0];
    if (first) return first;
  }
  const list = item.system?.actions;
  if (Array.isArray(list) && list.length) return list[0];
  return null;
}

/**
 * @param {Actor} actor
 * @param {Item} item
 * @param {string} source
 */
function claimSurgeSlot(actor, item, source) {
  const key = `${actor.uuid}:${item.id ?? item.uuid}`;
  const now = Date.now();
  const prev = recentSurgeKeys.get(key);
  if (prev && now - prev.ts < 1500) {
    if (source === "card" && prev.source === "action") return false;
    if (source === "action" && prev.source === "card") return false;
    if (source === prev.source) return false;
  }
  recentSurgeKeys.set(key, { ts: now, source });
  return true;
}

/**
 * @param {Item} item
 * @param {Actor} actor
 * @param {object|null} rollData
 */
export function resolveSurgeContext(item, actor, rollData = null) {
  if (isExemptFromSurgeBySetting(item)) return null;

  if (item.type === "spell") {
    const level = Number(rollData?.sl ?? item.system?.level ?? 0);
    if (level < 1) return null;
    const chance = chanceFromSpellLevel(level, actor);
    return {
      chance,
      mode: "spell",
      sourceLabel: game.i18n.format("CFUTIL.Surge.SourceSpell", { level, chance }),
    };
  }

  if (isSphereMagicItem(item)) {
    const sphereKey = item.flags?.pf1spheres?.sphere ?? null;
    const cl = getSphereCasterLevel(actor, sphereKey);
    if (cl == null) return null;
    const chance = chanceFromSphereCL(cl, actor);
    const sphereLabel = getSphereLabel(sphereKey) ?? game.i18n.localize("CFUTIL.Surge.OverallCL");
    return {
      chance,
      mode: "sphere",
      sourceLabel: game.i18n.format("CFUTIL.Surge.SourceSphere", {
        sphere: sphereLabel,
        cl,
        chance,
      }),
    };
  }

  return null;
}

/**
 * @param {string|null} sphereKey
 */
function getSphereLabel(sphereKey) {
  if (!sphereKey) return null;
  const magic = globalThis.pf1s?.config?.magicSpheres ?? CONFIG.PF1SPHERES?.magicSpheres;
  const label = magic?.[sphereKey]?.label;
  if (!label) return sphereKey;
  const localized = game.i18n.localize(label);
  return localized !== label ? localized : label;
}

/**
 * @param {Item} item
 */
export function isSphereMagicItem(item) {
  if (!item || item.type !== "feat") return false;
  if (item.system?.subType === "magicTalent") return true;

  const sphere = item.flags?.pf1spheres?.sphere;
  if (!sphere) return false;

  const magic = globalThis.pf1s?.config?.magicSpheres ?? CONFIG.PF1SPHERES?.magicSpheres;
  if (magic) return Object.prototype.hasOwnProperty.call(magic, sphere);

  const combat = globalThis.pf1s?.config?.combatSpheres ?? CONFIG.PF1SPHERES?.combatSpheres;
  if (combat && Object.prototype.hasOwnProperty.call(combat, sphere)) return false;
  return true;
}
