import { MODULE_ID } from "../../constants.mjs";

const FLAG = "energyShield";

/** Shield objects waiting to ride along with the hit-point update from the same swing. */
const pending = new WeakMap();

export function blankShield(overrides = {}) {
  return {
    enabled: false,
    max: 0,
    value: 0,
    regen: 0,
    bodyRegen: 0,
    dr: 0,
    suppressedUntil: null,
    hasteRounds: 0,
    regenSuppressed: false,
    coreRemoved: false,
    form: null,
    showOnSheet: false,
    tempFirst: false,
    ...overrides,
  };
}

/** Sphinx rules (reflection, EMP, regeneration, condition immunity). A plain pool is just hit points. */
export function isAstralShield(shield) {
  if (!shield) return false;
  return Boolean(shield.form || shield.coreRemoved || Number(shield.bodyRegen) || Number(shield.regen) || Number(shield.dr));
}

export function getShield(actor) {
  if (!actor) return null;
  const waiting = pending.get(actor);
  if (waiting) return foundry.utils.deepClone(waiting);
  const stored = actor.getFlag?.(MODULE_ID, FLAG);
  if (!stored?.enabled) return null;
  return blankShield(stored);
}

export function stageShield(actor, shield) {
  pending.set(actor, shield);
}

export function takeStagedShield(actor) {
  const shield = pending.get(actor);
  if (!shield) return null;
  pending.delete(actor);
  return shield;
}

export function shieldFlagUpdate(shield) {
  return { [`flags.${MODULE_ID}.energyShield`]: shield };
}

/** Current and maximum edited from the character sheet. Sphinx extras on the flag are left in place. */
export async function setShieldPoints(actor, { value, max }) {
  const current = actor.getFlag?.(MODULE_ID, FLAG) || {};
  const nextMax = Math.max(0, Math.floor(Number(max) || 0));
  const nextValue = Math.min(nextMax, Math.max(0, Math.floor(Number(value) || 0)));
  const next = {
    ...blankShield(),
    ...current,
    enabled: nextMax > 0,
    max: nextMax,
    value: nextValue,
  };
  if (!isAstralShield(current)) {
    next.regen = 0;
    next.bodyRegen = 0;
    next.dr = 0;
    next.form = null;
    next.coreRemoved = false;
  }
  await actor.update(shieldFlagUpdate(next));
  return next;
}

/** Settings-tab switch. Off until turned on; does not erase a pool that is already stored. */
export async function setShieldShown(actor, shown) {
  const current = actor.getFlag?.(MODULE_ID, FLAG) || {};
  const next = { ...blankShield(), ...current, showOnSheet: Boolean(shown) };
  await actor.update(shieldFlagUpdate(next));
  return next;
}

/** When true, temporary hit points are lost before the shield. Off keeps the shield in front. */
export async function setShieldTempFirst(actor, tempFirst) {
  const current = actor.getFlag?.(MODULE_ID, FLAG) || {};
  const next = { ...blankShield(), ...current, tempFirst: Boolean(tempFirst) };
  await actor.update(shieldFlagUpdate(next));
  return next;
}

export function isSuppressed(shield, combat = game.combat) {
  const until = shield?.suppressedUntil;
  if (!until) return false;
  if (!combat) return true;
  if (combat.round > until.round) return false;
  if (combat.round === until.round && combat.turn >= until.turn) return false;
  return true;
}

export function shieldAbsorbing(shield, combat = game.combat) {
  if (!shield?.enabled || shield.coreRemoved) return false;
  if (shield.value <= 0) return false;
  return !isSuppressed(shield, combat);
}

export function suppressionExpiry(combat = game.combat) {
  if (!combat) return { round: 1, turn: 0 };
  return { round: combat.round + 1, turn: combat.turn };
}

export function isPrimaryGM() {
  return game.user.isGM && game.users.activeGM === game.user;
}
