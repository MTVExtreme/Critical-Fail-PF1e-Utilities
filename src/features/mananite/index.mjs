import { registerMananiteAmmo, registerMananiteHooks } from "./hooks.mjs";
import { scaledMananiteFormula } from "./damage.mjs";

export function init() {
  registerMananiteAmmo();
}

export function pf1PostInit() {
  registerMananiteAmmo();
  registerMananiteHooks();
}

export function setup() {}

export function ready() {}

export const api = {
  scaledMananiteFormula,
};
