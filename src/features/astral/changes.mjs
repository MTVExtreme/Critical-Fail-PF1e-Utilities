import { CHANGE_TARGETS, MODULE_ID } from "../../constants.mjs";

const SHIELD_MAX = `flags.${MODULE_ID}.energyShield.max`;
const BURN_VALUE = `flags.${MODULE_ID}.burn.value`;
const SHIELD_REGEN = `flags.${MODULE_ID}.energyShield.regeneration`;
const SHIELD_FAST_HEALING = `flags.${MODULE_ID}.energyShield.fastHealing`;

/** Max Shield and Burn in the Health change list. Add and Set are the change's own operator. */
export function registerPoolChanges() {
  foundry.utils.mergeObject(CONFIG.PF1.buffTargets, {
    [CHANGE_TARGETS.shieldMax]: {
      label: game.i18n.localize("CFUTIL.Changes.ShieldMax"),
      category: "health",
      sort: 182000,
    },
    [CHANGE_TARGETS.shieldRegen]: {
      label: game.i18n.localize("CFUTIL.Changes.ShieldRegen"),
      category: "health",
      sort: 182100,
    },
    [CHANGE_TARGETS.shieldFastHealing]: {
      label: game.i18n.localize("CFUTIL.Changes.ShieldFastHealing"),
      category: "health",
      sort: 182200,
    },
    [CHANGE_TARGETS.burn]: {
      label: game.i18n.localize("CFUTIL.Changes.Burn"),
      category: "health",
      sort: 183000,
    },
  });

  Hooks.on("pf1GetChangeFlat", (result, target) => {
    if (target === CHANGE_TARGETS.shieldMax) result.push(SHIELD_MAX);
    else if (target === CHANGE_TARGETS.burn) result.push(BURN_VALUE);
    else if (target === CHANGE_TARGETS.shieldRegen) result.push(SHIELD_REGEN);
    else if (target === CHANGE_TARGETS.shieldFastHealing) result.push(SHIELD_FAST_HEALING);
  });
  Hooks.on("pf1PrepareBaseActorData", startPoolChanges);
  Hooks.on("pf1PrepareDerivedActorData", finishPoolChanges);
}

/** Changes need a number to add to. */
function startPoolChanges(actor) {
  const shield = actor.flags?.[MODULE_ID]?.energyShield;
  if (!shield || typeof shield !== "object") return;
  shield.fastHealing = Math.max(0, Math.floor(Number(shield.fastHealing) || 0));
  shield.regeneration = Math.max(0, Math.floor(Number(shield.regeneration) || 0));
}

function finishPoolChanges(actor) {
  const shield = actor.flags?.[MODULE_ID]?.energyShield;
  if (shield && shield.max != null && shield.max !== "") {
    const max = Math.max(0, Math.floor(Number(shield.max) || 0));
    const sourceMax = Math.max(0, Math.floor(Number(actor._source?.flags?.[MODULE_ID]?.energyShield?.max) || 0));
    shield.max = max;
    shield.value = Math.min(Math.max(0, Math.floor(Number(shield.value) || 0)), max);
    if (max > 0) shield.enabled = true;
    if (max !== sourceMax && max > 0) shield.showOnSheet = true;
  }
  if (shield && typeof shield === "object") {
    shield.fastHealing = Math.max(0, Math.floor(Number(shield.fastHealing) || 0));
    shield.regeneration = Math.max(0, Math.floor(Number(shield.regeneration) || 0));
  }

  const burn = actor.flags?.[MODULE_ID]?.burn;
  if (burn && burn.value != null && burn.value !== "") {
    const value = Math.max(0, Math.floor(Number(burn.value) || 0));
    const source = Math.max(0, Math.floor(Number(actor._source?.flags?.[MODULE_ID]?.burn?.value) || 0));
    burn.value = value;
    if (value !== source && value > 0) burn.shown = true;
  }
}
