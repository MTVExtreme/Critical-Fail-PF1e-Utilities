import { MODULE_ID } from "../../constants.mjs";
import { isAstralEnabled } from "../../settings.mjs";
import { getShield, shieldAbsorbing } from "./state.mjs";

function readChange(update, path) {
  if (Object.prototype.hasOwnProperty.call(update, path)) return update[path];
  return foundry.utils.getProperty(update, path);
}

function writeChange(update, path, value) {
  delete update[path];
  foundry.utils.setProperty(update, path, value);
}

const pendingDirect = new WeakMap();

/** Shift-committed sheet edit that must stay on the box that was changed. */
export function markDirectPool(actor, pool) {
  if (!actor || !pool) return;
  pendingDirect.set(actor, { pool, at: Date.now() });
}

function isDirectSheetEdit(actor, update) {
  const mark = pendingDirect.get(actor);
  if (!mark) return false;
  if (Date.now() - mark.at > 2000) {
    pendingDirect.delete(actor);
    return false;
  }
  const value = readChange(update, "system.attributes.hp.value");
  const offset = readChange(update, "system.attributes.hp.offset");
  const temp = readChange(update, "system.attributes.hp.temp");
  const hpTouched = value != null || offset != null;
  const tempTouched = temp != null;
  const match = (mark.pool === "hp" && hpTouched && !tempTouched)
    || (mark.pool === "temp" && tempTouched && !hpTouched);
  if (match) pendingDirect.delete(actor);
  return match;
}

/**
 * Sheet edits and other direct hit-point updates.
 * PF1 turns `hp.value` into `hp.offset` before this hook runs, so both shapes count.
 * The token bar update already carries the shield and is not spent twice.
 */
export function absorbDirectHealth(actor, update, shield, { staged = false, options } = {}) {
  if (options?.cfutilDirectHp || isDirectSheetEdit(actor, update)) return shield;
  if (staged || !shieldAbsorbing(shield)) return shield;
  if (readChange(update, `flags.${MODULE_ID}.energyShield`)) return shield;
  const hp = actor.system?.attributes?.hp;
  if (!hp) return shield;

  const valuePath = "system.attributes.hp.value";
  const offsetPath = "system.attributes.hp.offset";
  const tempPath = "system.attributes.hp.temp";
  const newValue = readChange(update, valuePath);
  const newOffset = readChange(update, offsetPath);
  const newTemp = readChange(update, tempPath);
  if (newValue == null && newOffset == null && newTemp == null) return shield;

  const max = Number(hp.max) || 0;
  const current = Number(hp.value) || 0;
  const value = newValue != null ? Number(newValue) : newOffset != null ? max + Number(newOffset) : current;
  const temp = newTemp == null ? (hp.temp || 0) : Number(newTemp);
  const delta = (value - current) + (temp - (hp.temp || 0));
  if (!Number.isFinite(delta) || delta >= 0) return shield;

  const next = spendShield(shield, hp, -delta);
  clearChange(update, valuePath);
  writeChange(update, offsetPath, next.hp - max);
  writeChange(update, tempPath, next.temp);
  writeChange(update, `flags.${MODULE_ID}.energyShield`, next.shield);
  syncHealthDeltas(options, hp, next);
  return next.shield;
}

function clearChange(update, path) {
  delete update[path];
  const parts = path.split(".");
  let parent = update;
  for (let i = 0; i < parts.length - 1; i++) {
    parent = parent?.[parts[i]];
    if (!parent) return;
  }
  delete parent[parts.at(-1)];
}

function syncHealthDeltas(options, hp, next) {
  const bucket = options?.pf1?.deltas?.hp;
  if (!bucket) return;
  const hpDelta = next.hp - (Number(hp.value) || 0);
  const tempDelta = next.temp - (Number(hp.temp) || 0);
  if (hpDelta) bucket.offset = hpDelta;
  else delete bucket.offset;
  if (tempDelta) bucket.temp = tempDelta;
  else delete bucket.temp;
  if (!Object.keys(bucket).length) delete options.pf1.deltas.hp;
}

export function spendShield(shield, hp, damage) {
  let left = Math.max(0, damage);
  let tempLeft = hp.temp || 0;
  let shieldLeft = shield.value;
  if (shield.tempFirst) {
    const used = Math.min(tempLeft, left);
    tempLeft -= used;
    left -= used;
  }
  const taken = Math.min(shieldLeft, left);
  shieldLeft -= taken;
  left -= taken;
  if (!shield.tempFirst) {
    const used = Math.min(tempLeft, left);
    tempLeft -= used;
    left -= used;
  }
  return {
    hp: (hp.value || 0) - left,
    temp: tempLeft,
    shield: { ...shield, value: shieldLeft },
  };
}

function wrapPrototype(prototype) {
  if (!prototype || prototype.modifyTokenAttribute?.cfShield) return;
  if (!Object.prototype.hasOwnProperty.call(prototype, "modifyTokenAttribute")) return;
  const original = prototype.modifyTokenAttribute;
  function modifyTokenAttribute(attribute, value, isDelta = false, isBar = true) {
    if (attribute !== "attributes.hp" || !isAstralEnabled()) return original.call(this, attribute, value, isDelta, isBar);
    const shield = getShield(this);
    const hp = this.system?.attributes?.hp;
    if (!hp) return original.call(this, attribute, value, isDelta, isBar);
    let delta = Number(value) || 0;
    if (!isDelta) delta = delta - ((hp.temp || 0) + (hp.value || 0));
    if (delta < 0 && game.keyboard?.isModifierActive?.("SHIFT")) {
      const max = Number(hp.max) || 0;
      return this.update({
        "system.attributes.hp.offset": (hp.value || 0) + delta - max,
      }, { cfutilDirectHp: true });
    }
    if (!shieldAbsorbing(shield)) return original.call(this, attribute, value, isDelta, isBar);
    if (delta >= 0) return original.call(this, attribute, value, isDelta, isBar);
    const next = spendShield(shield, hp, -delta);
    const max = Number(hp.max) || 0;
    return this.update({
      "system.attributes.hp.offset": next.hp - max,
      "system.attributes.hp.temp": next.temp,
      [`flags.${MODULE_ID}.energyShield`]: next.shield,
    });
  }
  modifyTokenAttribute.cfShield = true;
  prototype.modifyTokenAttribute = modifyTokenAttribute;
}

export function registerTokenHealth() {
  const classes = new Set(Object.values(CONFIG.Actor?.documentClasses || {}));
  const fallback = CONFIG.Actor?.documentClass;
  if (typeof fallback === "function") classes.add(fallback);
  for (const documentClass of classes) {
    let prototype = documentClass?.prototype;
    while (prototype && prototype !== Object.prototype) {
      if (Object.prototype.hasOwnProperty.call(prototype, "modifyTokenAttribute")) {
        wrapPrototype(prototype);
        break;
      }
      prototype = Object.getPrototypeOf(prototype);
    }
  }
}
