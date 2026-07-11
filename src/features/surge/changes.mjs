import { CHANGE_TARGETS } from "../../constants.mjs";

/**
 * Register surge change targets under the Spells category (after Spell DC, before dynamic book targets).
 */
export function registerSurgeChanges() {
  const targets = {
    [CHANGE_TARGETS.base]: {
      label: game.i18n.localize("CFUTIL.Changes.SurgeBase"),
      category: "spell",
      sort: 240500,
    },
    [CHANGE_TARGETS.perLevel]: {
      label: game.i18n.localize("CFUTIL.Changes.SurgePerLevel"),
      category: "spell",
      sort: 240600,
    },
    [CHANGE_TARGETS.perCL]: {
      label: game.i18n.localize("CFUTIL.Changes.SurgePerCL"),
      category: "spell",
      sort: 240700,
    },
  };

  foundry.utils.mergeObject(CONFIG.PF1.buffTargets, targets);

  Hooks.on("pf1PrepareBaseActorData", prepareSurgeActorData);
  Hooks.on("pf1GetChangeFlat", onGetChangeFlat);
}

/**
 * @param {Actor} actor
 */
function prepareSurgeActorData(actor) {
  actor.system.cfSurge ??= {};
  actor.system.cfSurge.base ??= { value: 0, total: 0 };
  actor.system.cfSurge.perLevel ??= { value: 0, total: 0 };
  actor.system.cfSurge.perCL ??= { value: 0, total: 0 };

  // Ensure totals exist even before changes apply
  for (const key of ["base", "perLevel", "perCL"]) {
    const block = actor.system.cfSurge[key];
    if (block.total == null) block.total = Number(block.value) || 0;
  }
}

/**
 * @param {string[]} result
 * @param {string} target
 */
function onGetChangeFlat(result, target) {
  switch (target) {
    case CHANGE_TARGETS.base:
      result.push("system.cfSurge.base.total");
      break;
    case CHANGE_TARGETS.perLevel:
      result.push("system.cfSurge.perLevel.total");
      break;
    case CHANGE_TARGETS.perCL:
      result.push("system.cfSurge.perCL.total");
      break;
  }
}

/**
 * @param {Actor} actor
 * @returns {{ base: number, perLevel: number, perCL: number }}
 */
export function getSurgeModifiers(actor) {
  const data = actor?.system?.cfSurge ?? {};
  return {
    base: Number(data.base?.total) || 0,
    perLevel: Number(data.perLevel?.total) || 0,
    perCL: Number(data.perCL?.total) || 0,
  };
}
