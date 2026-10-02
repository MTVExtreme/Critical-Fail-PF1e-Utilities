/**
 * Tinker and Occultism are not in pf1spheres' built-in dictionaries.
 * Register them so talent counts, the sphere dropdown, and (for Tinker) sphere BAB changes work.
 * Icons live in Critical Fail Shared.
 */

const TINKER_ICON = "modules/critical-fail-shared/img/spheres/tinker.png";
const OCCULTISM_ICON = "modules/critical-fail-shared/img/spheres/occultism.jpg";

export function registerExtraSpheres() {
  // Fires during pf1spheres init, before it builds per-sphere BAB change targets.
  Hooks.once("pf1spheresConfig", (config) => addSpheres(config, true));
  // If this module initialized after pf1spheres, the config hook already ran.
  Hooks.once("pf1spheresPostInit", () => addSpheres(globalThis.pf1s?.config, false));
}

/**
 * @param {object|undefined} config
 * @param {boolean} beforeChanges `true` when called from pf1spheresConfig, before change targets are built.
 */
function addSpheres(config, beforeChanges) {
  if (!config?.combatSpheres || !config?.skillSpheres) return;
  if (!config.combatSpheres.tinker) {
    config.combatSpheres.tinker = { label: "Tinker", icon: TINKER_ICON };
    if (!beforeChanges && CONFIG.PF1?.buffTargets && !CONFIG.PF1.buffTargets.spherebabTinker) {
      CONFIG.PF1.buffTargets.spherebabTinker = {
        label: "Tinker BAB",
        category: "sphereBAB",
        sort: 99950,
      };
    }
  } else if (!config.combatSpheres.tinker.icon) {
    config.combatSpheres.tinker.icon = TINKER_ICON;
  }

  if (!config.skillSpheres.occultism) {
    config.skillSpheres.occultism = { label: "Occultism", icon: OCCULTISM_ICON };
  } else if (!config.skillSpheres.occultism.icon) {
    config.skillSpheres.occultism.icon = OCCULTISM_ICON;
  }
}
