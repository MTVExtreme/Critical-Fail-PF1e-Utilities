import { MODULE_ID, ROLL_STATS_SETTING } from "../../constants.mjs";

/** Delay before pending records are written to the world setting. */
const FLUSH_DELAY_MS = 1500;
/** Oldest records are dropped beyond these per-actor limits. */
const MAX_D20_PER_ACTOR = 25000;
const MAX_DMG_PER_ACTOR = 10000;

/** @type {RollRecord[]} */
const pending = [];
let flushTimer = null;
let flushing = null;

/**
 * @typedef {object} RollRecord
 * @property {string} actorId
 * @property {string} name
 * @property {number} ts
 * @property {number[]} d20 Natural d20 results
 * @property {Array<{ amount: number, heal: boolean }>} dmg Damage / healing rolled
 */

/**
 * @returns {{ v: number, actors: Record<string, { name: string, d20: number[][], dmg: number[][] }> }}
 */
export function emptyStore() {
  return { v: 1, actors: {} };
}

/**
 * Validate and copy raw setting data into the store shape.
 * @param {unknown} raw
 */
export function normalizeStore(raw) {
  const data = emptyStore();
  const actors = raw && typeof raw === "object" ? raw.actors : null;
  if (!actors || typeof actors !== "object") return data;
  for (const [actorId, entry] of Object.entries(actors)) {
    if (!entry || typeof entry !== "object") continue;
    data.actors[actorId] = {
      name: typeof entry.name === "string" ? entry.name : "",
      d20: Array.isArray(entry.d20)
        ? entry.d20.filter((r) => Array.isArray(r) && Number.isFinite(r[0]) && Number.isFinite(r[1])).map((r) => [r[0], r[1]])
        : [],
      dmg: Array.isArray(entry.dmg)
        ? entry.dmg.filter((r) => Array.isArray(r) && Number.isFinite(r[0]) && Number.isFinite(r[1])).map((r) => [r[0], r[1], r[2] ? 1 : 0])
        : [],
    };
  }
  return data;
}

/** Current persisted data (normalized copy). */
export function getStoreData() {
  return normalizeStore(game.settings.get(MODULE_ID, ROLL_STATS_SETTING));
}

/**
 * Apply a record to store data in place.
 * @param {ReturnType<typeof emptyStore>} data
 * @param {RollRecord} record
 */
export function applyRecord(data, record) {
  const entry = (data.actors[record.actorId] ??= { name: "", d20: [], dmg: [] });
  if (record.name) entry.name = record.name;
  for (const face of record.d20 ?? []) entry.d20.push([record.ts, face]);
  for (const hit of record.dmg ?? []) entry.dmg.push([record.ts, hit.amount, hit.heal ? 1 : 0]);
  if (entry.d20.length > MAX_D20_PER_ACTOR) entry.d20.splice(0, entry.d20.length - MAX_D20_PER_ACTOR);
  if (entry.dmg.length > MAX_DMG_PER_ACTOR) entry.dmg.splice(0, entry.dmg.length - MAX_DMG_PER_ACTOR);
}

/**
 * Queue records for a debounced write. Only the active GM writes world settings.
 * @param {RollRecord[]} records
 */
export function queueRecords(records) {
  if (!records?.length) return;
  pending.push(...records);
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    flushPending();
  }, FLUSH_DELAY_MS);
}

/** Write queued records to the world setting. */
export async function flushPending() {
  if (flushing) return flushing;
  flushing = (async () => {
    try {
      if (!pending.length) return;
      if (!game.user?.isActiveGM) {
        pending.length = 0;
        return;
      }
      const data = getStoreData();
      for (const record of pending.splice(0, pending.length)) applyRecord(data, record);
      await game.settings.set(MODULE_ID, ROLL_STATS_SETTING, data);
      Hooks.callAll("cfRollStatsUpdated", data);
    } catch (err) {
      console.error(`${MODULE_ID} | Failed to save roll stats`, err);
    } finally {
      flushing = null;
    }
  })();
  return flushing;
}

/** Remove all recorded data. */
export async function clearStore() {
  pending.length = 0;
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  await game.settings.set(MODULE_ID, ROLL_STATS_SETTING, emptyStore());
  Hooks.callAll("cfRollStatsUpdated", emptyStore());
}

/** Number of records waiting to be written (for diagnostics). */
export function pendingCount() {
  return pending.length;
}
