import { MODULE_ID } from "./constants.mjs";

export function registerSettings() {
  game.settings.register(MODULE_ID, "enableSurgeChance", {
    name: "CFUTIL.Settings.enableSurgeChance",
    hint: "CFUTIL.Settings.enableSurgeChanceHint",
    scope: "world",
    config: true,
    type: new foundry.data.fields.BooleanField({ initial: true }),
  });

  game.settings.register(MODULE_ID, "autoSurgeOnCast", {
    name: "CFUTIL.Settings.autoSurgeOnCast",
    hint: "CFUTIL.Settings.autoSurgeOnCastHint",
    scope: "world",
    config: true,
    type: new foundry.data.fields.BooleanField({ initial: true }),
  });

  game.settings.register(MODULE_ID, "skipLifeAndHealingSurges", {
    name: "CFUTIL.Settings.skipLifeAndHealingSurges",
    hint: "CFUTIL.Settings.skipLifeAndHealingSurgesHint",
    scope: "world",
    config: true,
    type: new foundry.data.fields.BooleanField({ initial: true }),
  });
}

export function isSurgeEnabled() {
  return game.settings.get(MODULE_ID, "enableSurgeChance") === true;
}

export function isAutoSurgeOnCast() {
  return isSurgeEnabled() && game.settings.get(MODULE_ID, "autoSurgeOnCast") === true;
}

export function skipLifeAndHealingSurges() {
  return game.settings.get(MODULE_ID, "skipLifeAndHealingSurges") === true;
}
