/**
 * Pure statistics helpers for the Roll Stats tool. No Foundry globals are used here.
 *
 * Store entry shapes:
 *   d20 record: [timestampMs, face]
 *   dmg record: [timestampMs, amount, isHealing(0|1)]
 */

export const D20_FACES = 20;
export const FEAT_WINDOW = 10;

/**
 * @param {number} ts
 * @param {{ from: number|null, to: number|null }|null} range
 * @returns {boolean}
 */
export function inRange(ts, range) {
  if (!range) return true;
  if (range.from != null && ts < range.from) return false;
  if (range.to != null && ts > range.to) return false;
  return true;
}

/**
 * Parse a `YYYY-MM-DD` input value into a local-time day start.
 * @param {string} value
 * @returns {Date|null}
 */
export function parseDateInput(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value ?? "").trim());
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * @param {Date} date
 * @returns {number} Local start-of-day timestamp
 */
export function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/**
 * @param {Date} date
 * @returns {number} Local end-of-day timestamp (inclusive)
 */
export function endOfDay(date) {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d.getTime();
}

/**
 * Format a Date as `YYYY-MM-DD` in local time.
 * @param {Date} date
 * @returns {string}
 */
export function toDateInput(date) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * Convert the popup's filter state into a timestamp range.
 * @param {{ preset: string, from?: string, to?: string, date?: string }} filter
 * @param {Date} [now]
 * @returns {{ from: number|null, to: number|null, preset: string }}
 */
export function rangeFromFilter(filter, now = new Date()) {
  const preset = filter?.preset ?? "all";
  const dayMs = 24 * 60 * 60 * 1000;
  switch (preset) {
    case "today":
      return { preset, from: startOfDay(now), to: endOfDay(now) };
    case "yesterday": {
      const yesterday = new Date(now.getTime() - dayMs);
      return { preset, from: startOfDay(yesterday), to: endOfDay(yesterday) };
    }
    case "7d":
      return { preset, from: startOfDay(new Date(now.getTime() - 6 * dayMs)), to: null };
    case "30d":
      return { preset, from: startOfDay(new Date(now.getTime() - 29 * dayMs)), to: null };
    case "date": {
      const day = parseDateInput(filter.date);
      if (!day) return { preset: "all", from: null, to: null };
      return { preset, from: startOfDay(day), to: endOfDay(day) };
    }
    case "custom": {
      const from = parseDateInput(filter.from);
      const to = parseDateInput(filter.to);
      return { preset, from: from ? startOfDay(from) : null, to: to ? endOfDay(to) : null };
    }
    default:
      return { preset: "all", from: null, to: null };
  }
}

/**
 * Largest number of `target` results inside any window of `size` consecutive rolls.
 * @param {number[]} faces
 * @param {number} target
 * @param {number} [size]
 * @returns {number}
 */
export function maxInWindow(faces, target, size = FEAT_WINDOW) {
  let count = 0;
  let best = 0;
  for (let i = 0; i < faces.length; i++) {
    if (i >= size && faces[i - size] === target) count -= 1;
    if (faces[i] === target) count += 1;
    if (count > best) best = count;
  }
  return best;
}

/**
 * Longest run of consecutive `target` results.
 * @param {number[]} faces
 * @param {number} target
 * @returns {number}
 */
export function longestStreak(faces, target) {
  let run = 0;
  let best = 0;
  for (const face of faces) {
    run = face === target ? run + 1 : 0;
    if (run > best) best = run;
  }
  return best;
}

/**
 * @param {number[]} faces Natural d20 results in chronological order
 */
export function computeD20Stats(faces) {
  const counts = new Array(D20_FACES + 1).fill(0);
  let sum = 0;
  for (const face of faces) {
    if (face >= 1 && face <= D20_FACES) counts[face] += 1;
    sum += face;
  }
  const total = faces.length;
  const nat1 = counts[1];
  const nat20 = counts[20];
  return {
    total,
    nat1,
    nat20,
    pct1: total ? (nat1 / total) * 100 : 0,
    pct20: total ? (nat20 / total) * 100 : 0,
    average: total ? sum / total : 0,
    streak20: longestStreak(faces, 20),
    streak1: longestStreak(faces, 1),
    max20In10: maxInWindow(faces, 20),
    max1In10: maxInWindow(faces, 1),
    counts: counts.slice(1),
    expectedPerFace: total / D20_FACES,
  };
}

/**
 * @param {number[]} amounts
 */
function summarizeAmounts(amounts) {
  const count = amounts.length;
  const total = amounts.reduce((sum, n) => sum + n, 0);
  return {
    count,
    total,
    max: count ? Math.max(...amounts) : 0,
    average: count ? total / count : 0,
  };
}

/**
 * @param {Array<[number, number, number]>} records dmg records `[ts, amount, isHealing]`
 */
export function computeDamageStats(records) {
  const damage = [];
  const healing = [];
  for (const record of records) {
    const amount = Number(record?.[1]) || 0;
    if (amount <= 0) continue;
    (record[2] ? healing : damage).push(amount);
  }
  return { damage: summarizeAmounts(damage), healing: summarizeAmounts(healing) };
}

/**
 * Sum several face-count arrays (index 0 = face 1).
 * @param {number[][]} countArrays
 * @returns {number[]}
 */
export function sumCounts(countArrays) {
  const counts = new Array(D20_FACES).fill(0);
  for (const array of countArrays) {
    for (let i = 0; i < D20_FACES; i++) counts[i] += Number(array?.[i]) || 0;
  }
  return counts;
}

/**
 * Names holding the highest positive value of `pick(row)`.
 * @template T
 * @param {T[]} rows
 * @param {(row: T) => number} pick
 * @returns {{ value: number, rows: T[] }}
 */
export function leaders(rows, pick) {
  let value = 0;
  let best = [];
  for (const row of rows) {
    const n = pick(row);
    if (n > value) {
      value = n;
      best = [row];
    } else if (n === value && n > 0) {
      best.push(row);
    }
  }
  return { value, rows: best };
}
