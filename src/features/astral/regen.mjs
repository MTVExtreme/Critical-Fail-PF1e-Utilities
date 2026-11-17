import { MODULE_ID } from "../../constants.mjs";
import { isSuppressed } from "./state.mjs";

/**
 * Shield Fast Healing and Shield Regeneration.
 *
 * Both restore shield points at the start of the creature's turn in combat, like Fast Healing and
 * Regeneration do for hit points. Regeneration can name damage types (for example `5/acid, fire`);
 * taking damage of a listed type stops shield regeneration on the creature's next turn.
 * Values live on the shield flag: `fastHealing`, `regeneration`, `regenBypass`, `regenStopped`.
 */

const FLAG = "energyShield";
const ALIASES = { electricity: "electric", electrical: "electric", lightning: "electric", "acidic": "acid" };

function int(value) {
  return Math.max(0, Math.floor(Number(value) || 0));
}

export function normalizeType(type) {
  const key = String(type ?? "").trim().toLowerCase();
  return ALIASES[key] ?? key;
}

/**
 * Parse the sheet text: `5`, `5/acid, fire`, `5 (acid or fire)`. Blank clears it.
 * @returns {{ amount: number, bypass: string } | null} null when the text is not understood
 */
export function parseRegen(text) {
  const raw = String(text ?? "").trim();
  if (!raw) return { amount: 0, bypass: "" };
  const match = raw.match(/^(\d+)\s*(?:[/(]\s*([^)]*?)\s*\)?)?\s*$/);
  if (!match) return null;
  const types = (match[2] || "")
    .split(/\s*(?:,|;|\/|\bor\b|\band\b)\s*/i)
    .map((type) => type.trim())
    .filter(Boolean);
  return { amount: Number(match[1]), bypass: types.join(", ") };
}

export function formatRegen(amount, bypass) {
  const value = int(amount);
  if (!value) return "";
  return bypass ? `${value}/${bypass}` : String(value);
}

export function bypassList(shield) {
  return String(shield?.regenBypass ?? "")
    .split(",")
    .map(normalizeType)
    .filter(Boolean);
}

/** Shield points restored this turn: fast healing always, regeneration unless it was stopped. */
export function shieldRegenAmount(shield) {
  if (!shield) return 0;
  return int(shield.fastHealing) + (shield.regenStopped ? 0 : int(shield.regeneration));
}

function entries(value) {
  if (!value) return [];
  const source = value.names ?? value.standard ?? value;
  if (typeof source?.has === "function" && typeof source?.[Symbol.iterator] === "function") return [...source];
  if (Array.isArray(source)) return source;
  return [];
}

/** Damage types (ids and display names) in a pf1ApplyDamage call, plus the item's descriptors. */
function incomingTypes(options) {
  const out = new Set();
  const add = (value) => {
    const key = normalizeType(value?.id ?? value?.name ?? value);
    if (key) out.add(key);
  };
  for (const inst of options?.instances || []) {
    const raw = inst?.types || inst?.typeIds || [];
    for (const type of raw instanceof Set ? [...raw] : Array.isArray(raw) ? raw : []) {
      add(type);
      const name = globalThis.pf1?.registry?.damageTypes?.get?.(type)?.name;
      if (name) add(name);
    }
  }
  for (const descriptor of entries(options?.item?.system?.descriptors)) add(descriptor);
  return out;
}

/** True when this damage includes a type that stops the shield's regeneration. */
export function stopsShieldRegen(shield, options) {
  if (!int(shield?.regeneration)) return false;
  if (!(Number(options?.value) > 0)) return false; // healing never stops it
  const bypass = bypassList(shield);
  if (!bypass.length) return false;
  const types = incomingTypes(options);
  return bypass.some((type) => types.has(type));
}

/**
 * Start-of-turn restore for a plain (non-Sphinx) shield. Only the current value and the
 * stopped flag are written, so bonuses from Changes are never saved into the actor.
 */
export async function tickShieldRegen(actor, shield) {
  if (!actor || !shield?.enabled || shield.coreRemoved) return;
  const update = {};
  if (!isSuppressed(shield)) {
    const max = int(shield.max);
    const value = int(shield.value);
    const next = Math.min(max, value + shieldRegenAmount(shield));
    if (next !== value) update[`flags.${MODULE_ID}.${FLAG}.value`] = next;
  }
  if (shield.regenStopped) update[`flags.${MODULE_ID}.${FLAG}.regenStopped`] = false;
  if (Object.keys(update).length) await actor.update(update);
}

/** Saved (not Change-boosted) values from the sheet. */
export async function setShieldRegen(actor, patch) {
  const update = {};
  for (const [key, value] of Object.entries(patch)) update[`flags.${MODULE_ID}.${FLAG}.${key}`] = value;
  await actor.update(update, { cfShieldRegenEdit: true });
}

/**
 * Whole-shield writes copy the flag as prepared, which includes Shield Fast Healing and Shield
 * Regeneration added by Changes. Put the saved values back so a buff is not made permanent.
 */
export function keepSavedRegen(actor, update, options) {
  if (options?.cfShieldRegenEdit) return;
  const incoming = update?.flags?.[MODULE_ID]?.[FLAG];
  if (!incoming || typeof incoming !== "object") return;
  const prepared = actor.flags?.[MODULE_ID]?.[FLAG] || {};
  const saved = actor._source?.flags?.[MODULE_ID]?.[FLAG] || {};
  for (const key of ["fastHealing", "regeneration"]) {
    if (!(key in incoming)) continue;
    if (Number(incoming[key]) === Number(prepared[key]) && Number(prepared[key] || 0) !== Number(saved[key] || 0)) {
      incoming[key] = saved[key] ?? 0;
    }
  }
}
