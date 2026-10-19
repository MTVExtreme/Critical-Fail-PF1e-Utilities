import { registerAstralHooks } from "./hooks.mjs";
import { registerPoolChanges } from "./changes.mjs";
import { registerTokenHealth } from "./token-health.mjs";
import { advanceShieldTurn, triggerEmp } from "./actions.mjs";
import { registerShieldSocket } from "./feedback.mjs";
import { getShield, setShieldPoints, setShieldShown, setShieldTempFirst } from "./state.mjs";

export function init() {}

export function pf1PostInit() {
  registerPoolChanges();
  registerAstralHooks();
}

export function setup() {}

export function ready() {
  registerShieldSocket();
  registerTokenHealth();
}

export const api = {
  getShield,
  setShieldPoints,
  setShieldShown,
  setShieldTempFirst,
  advanceTurn: advanceShieldTurn,
  triggerEmp,
};
