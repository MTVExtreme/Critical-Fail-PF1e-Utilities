import { registerMananiteAmmo, registerMananiteHooks } from "./hooks.mjs";
import { migrateMananite } from "./migrate.mjs";
import { scaledMananiteFormula } from "./damage.mjs";

export function init() {
  registerMananiteAmmo();
}

export function pf1PostInit() {
  registerMananiteAmmo();
  registerMananiteHooks();
}

export function setup() {}

export function ready() {
  migrateMananite().catch((error) => console.error("critical-fail-pf1e-utilities | Mananite migration", error));
}

export const api = {
  scaledMananiteFormula,
};
