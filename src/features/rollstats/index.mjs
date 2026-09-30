import { openRollStats } from "./app.mjs";
import { injectExistingDirectoryButton, registerDirectoryButton } from "./directory.mjs";
import { extractFromMessage, recordFromMessage, registerRollRecorder } from "./recorder.mjs";
import { clearStore, flushPending, getStoreData } from "./store.mjs";
import { computeD20Stats, computeDamageStats, rangeFromFilter } from "./stats.mjs";

export function init() {}

export function pf1PostInit() {}

export function setup() {
  // The sidebar renders before `ready`, so the directory hook must exist by then.
  registerDirectoryButton();
  registerRollRecorder();
}

export function ready() {
  injectExistingDirectoryButton();
}

export const api = {
  open: openRollStats,
  getData: getStoreData,
  flush: flushPending,
  clear: clearStore,
  recordFromMessage,
  extractFromMessage,
  computeD20Stats,
  computeDamageStats,
  rangeFromFilter,
};
