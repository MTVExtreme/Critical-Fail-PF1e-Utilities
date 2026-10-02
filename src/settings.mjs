import { MODULE_ID, ROLL_STATS_SETTING } from "./constants.mjs";

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

  game.settings.register(MODULE_ID, "enableGuileTab", {
    name: "CFUTIL.Settings.enableGuileTab",
    hint: "CFUTIL.Settings.enableGuileTabHint",
    scope: "world",
    config: true,
    type: new foundry.data.fields.BooleanField({ initial: true }),
  });

  game.settings.register(MODULE_ID, "enableMananiteAmmo", {
    name: "CFUTIL.Settings.enableMananiteAmmo",
    hint: "CFUTIL.Settings.enableMananiteAmmoHint",
    scope: "world",
    config: true,
    type: new foundry.data.fields.BooleanField({ initial: true }),
  });

  game.settings.register(MODULE_ID, "enableRollTracking", {
    name: "CFUTIL.Settings.enableRollTracking",
    hint: "CFUTIL.Settings.enableRollTrackingHint",
    scope: "world",
    config: true,
    type: new foundry.data.fields.BooleanField({ initial: true }),
  });

  // Recorded d20 / damage data. Lives in the world settings database, independent of the chat log.
  game.settings.register(MODULE_ID, ROLL_STATS_SETTING, {
    scope: "world",
    config: false,
    type: new foundry.data.fields.ObjectField(),
    default: { v: 1, actors: {} },
  });
}

export function isGuileTabEnabled() {
  return game.settings.get(MODULE_ID, "enableGuileTab") === true;
}

export function isMananiteEnabled() {
  return game.settings.get(MODULE_ID, "enableMananiteAmmo") !== false;
}

export function isRollTrackingEnabled() {
  return game.settings.get(MODULE_ID, "enableRollTracking") === true;
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
