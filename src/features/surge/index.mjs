import { registerSurgeChanges, getSurgeModifiers } from "./changes.mjs";
import { registerSurgeHooks } from "./hooks.mjs";
import { registerSurgeSheetUI } from "./sheet.mjs";
import {
  rollSurgeChance,
  rollManualSpellSurge,
  rollManualSphereSurge,
  chanceFromSpellLevel,
  chanceFromSphereCL,
} from "./roll.mjs";

export function init() {}

export function pf1PostInit() {
  registerSurgeChanges();
  registerSurgeHooks();
  registerSurgeSheetUI();
}

export function setup() {}

export function ready() {}

export const api = {
  rollSurgeChance,
  rollManualSpellSurge,
  rollManualSphereSurge,
  chanceFromSpellLevel,
  chanceFromSphereCL,
  getSurgeModifiers,
};
