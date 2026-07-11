export const MODULE_ID = "critical-fail-pf1e-utilities";

/** Percent chance per traditional spell level (before modifiers). */
export const SPELL_SURGE_PER_LEVEL = 8;

/** Percent chance per Sphere of Power caster level (before modifiers). */
export const SPHERE_SURGE_PER_CL = 4;

/** Change target keys registered on CONFIG.PF1.buffTargets */
export const CHANGE_TARGETS = {
  base: "cfSurgeBase",
  perLevel: "cfSurgePerLevel",
  perCL: "cfSurgePerCL",
};

/** Actor flag: normal | kh | kl */
export const FLAG_DICE_MODE = "surgeDiceMode";

/** Item flag: skip auto/manual surge for this item */
export const FLAG_DISABLE_SURGE = "disableSurge";

/** Item flag: per-action surge disable `{ [actionId]: true }` */
export const FLAG_ACTION_DISABLE_SURGE = "actionSurgeDisable";

/** Life sphere key in pf1spheres */
export const LIFE_SPHERE_KEY = "life";

export const DICE_MODES = {
  normal: { formula: "1d100", labelKey: "CFUTIL.Surge.DiceNormal" },
  kh: { formula: "2d100kh", labelKey: "CFUTIL.Surge.DiceKeepHigher" },
  kl: { formula: "2d100kl", labelKey: "CFUTIL.Surge.DiceKeepLower" },
};

/**
 * Severity bands for the second d100 (inclusive).
 * Natural d100 is 1–100; 0 is included for completeness.
 */
export const SEVERITY_BANDS = [
  { id: "mild", min: 0, max: 30, labelKey: "CFUTIL.Surge.Mild" },
  { id: "moderate", min: 31, max: 50, labelKey: "CFUTIL.Surge.Moderate" },
  { id: "severe", min: 51, max: 70, labelKey: "CFUTIL.Surge.Severe" },
  { id: "extreme", min: 71, max: 90, labelKey: "CFUTIL.Surge.Extreme" },
  { id: "crazy", min: 91, max: 100, labelKey: "CFUTIL.Surge.Crazy" },
];
