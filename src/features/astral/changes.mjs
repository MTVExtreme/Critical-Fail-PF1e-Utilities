import { CHANGE_TARGETS, MODULE_ID } from "../../constants.mjs";

const SHIELD_MAX = `flags.${MODULE_ID}.energyShield.max`;
const BURN_VALUE = `flags.${MODULE_ID}.burn.value`;

/** Max Shield and Burn in the Health change list. Add and Set are the change's own operator. */
export function registerPoolChanges() {
  foundry.utils.mergeObject(CONFIG.PF1.buffTargets, {
    [CHANGE_TARGETS.shieldMax]: {
      label: game.i18n.localize("CFUTIL.Changes.ShieldMax"),
      category: "health",
      sort: 182000,
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
  });
  Hooks.on("pf1PrepareDerivedActorData", finishPoolChanges);
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

  const burn = actor.flags?.[MODULE_ID]?.burn;
  if (burn && burn.value != null && burn.value !== "") {
    const value = Math.max(0, Math.floor(Number(burn.value) || 0));
    const source = Math.max(0, Math.floor(Number(actor._source?.flags?.[MODULE_ID]?.burn?.value) || 0));
    burn.value = value;
    if (value !== source && value > 0) burn.shown = true;
  }
}
