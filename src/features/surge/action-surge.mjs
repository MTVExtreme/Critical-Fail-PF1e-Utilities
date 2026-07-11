import {
  FLAG_ACTION_DISABLE_SURGE,
  FLAG_DISABLE_SURGE,
  LIFE_SPHERE_KEY,
  MODULE_ID,
} from "../../constants.mjs";
import { skipLifeAndHealingSurges } from "../../settings.mjs";

/**
 * @param {Item} item
 */
export function isItemSurgeDisabled(item) {
  return item?.getFlag?.(MODULE_ID, FLAG_DISABLE_SURGE) === true;
}

/**
 * Whether this action should trigger a surge roll.
 * Defaults to YES for every action unless the item or this action has Disable Surge set.
 *
 * @param {Item} item
 * @param {object} action
 * @returns {boolean}
 */
export function doesActionCauseSurge(item, action) {
  if (!item) return false;
  if (isItemSurgeDisabled(item)) return false;
  if (action && isActionSurgeDisabled(item, action)) return false;
  return true;
}

/**
 * @param {Item} item
 * @param {object} action
 * @returns {boolean}
 */
export function isActionSurgeDisabled(item, action) {
  const actionId = action?.id ?? action?._id;
  if (!actionId) return false;
  const disabled = item.getFlag?.(MODULE_ID, FLAG_ACTION_DISABLE_SURGE) ?? {};
  return disabled[actionId] === true;
}

/**
 * Persist per-action surge disable on the parent item.
 * @param {Item} item
 * @param {string} actionId
 * @param {boolean} disabled
 */
export async function setActionSurgeDisabled(item, actionId, disabled) {
  if (!item || !actionId) return;
  const current = foundry.utils.deepClone(item.getFlag(MODULE_ID, FLAG_ACTION_DISABLE_SURGE) ?? {});
  if (disabled) current[actionId] = true;
  else delete current[actionId];

  if (Object.keys(current).length === 0) {
    await item.unsetFlag(MODULE_ID, FLAG_ACTION_DISABLE_SURGE);
  } else {
    await item.setFlag(MODULE_ID, FLAG_ACTION_DISABLE_SURGE, current);
  }
}

/**
 * Life sphere talents / Conjuration (healing) spells when the module setting is on.
 * @param {Item} item
 */
export function isExemptFromSurgeBySetting(item) {
  if (!skipLifeAndHealingSurges()) return false;
  if (!item) return false;

  if (isLifeSphereItem(item)) return true;
  if (isConjurationHealingSpell(item)) return true;
  return false;
}

/**
 * @param {Item} item
 */
export function isLifeSphereItem(item) {
  return item?.flags?.pf1spheres?.sphere === LIFE_SPHERE_KEY;
}

/**
 * @param {Item} item
 */
export function isConjurationHealingSpell(item) {
  if (item?.type !== "spell") return false;
  if (item.system?.school !== "con") return false;
  return hasSubschool(item, "healing");
}

/**
 * @param {Item} item
 * @param {string} key
 */
function hasSubschool(item, key) {
  const sub = item.system?.subschool;
  if (!sub) return false;

  if (sub.total instanceof Set) return sub.total.has(key);
  if (Array.isArray(sub.total)) return sub.total.includes(key);
  if (Array.isArray(sub)) return sub.includes(key);
  if (sub.selected) {
    if (Array.isArray(sub.selected)) return sub.selected.includes(key);
    if (typeof sub.selected === "object") return Boolean(sub.selected[key]);
  }
  if (Array.isArray(sub.value)) return sub.value.includes(key);
  if (typeof sub.value === "string") return sub.value === key;
  return false;
}
