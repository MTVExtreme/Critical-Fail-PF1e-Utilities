import { registerSurgeChanges, getSurgeModifiers } from "./changes.mjs";
import { registerSurgeHooks } from "./hooks.mjs";
import { registerSurgeSheetUI } from "./sheet.mjs";
import { MODULE_ID } from "../../constants.mjs";
import { getSurgeConfig, registerSurgeConfigSetting, severityRanges } from "./config.mjs";
import { SurgeConfigApp } from "./settings-app.mjs";
import {
  rollSurgeChance,
  rollManualSpellSurge,
  rollManualSphereSurge,
  chanceFromSpellLevel,
  chanceFromSphereCL,
} from "./roll.mjs";

export function init() {
  registerSurgeConfigSetting();
  game.settings.registerMenu(MODULE_ID, "surgeConfigMenu", {
    name: "CFUTIL.SurgeConfig.MenuName",
    label: "CFUTIL.SurgeConfig.MenuLabel",
    hint: "CFUTIL.SurgeConfig.MenuHint",
    icon: "fa-solid fa-bolt",
    type: SurgeConfigApp,
    restricted: true,
  });
}

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
  getConfig: getSurgeConfig,
  getSeverityRanges: () => severityRanges(),
  openConfig: () => new SurgeConfigApp().render({ force: true }),
};
