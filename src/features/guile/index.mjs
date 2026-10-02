import {
  getExpectedSkillRanks,
  getGrantedSkillRanks,
  getSkillSphereSummary,
  getSkillTalentsBySphere,
  getTalentCounts,
  isSkillTalent,
} from "./data.mjs";
import { registerExtraSpheres } from "./extra-spheres.mjs";
import { registerGuileSheetUI } from "./sheet.mjs";

export function init() {
  registerExtraSpheres();
}

export function pf1PostInit() {
  registerGuileSheetUI();
}

export function setup() {}

export function ready() {}

export const api = {
  getSkillSphereSummary,
  getSkillTalentsBySphere,
  getTalentCounts,
  getGrantedSkillRanks,
  getExpectedSkillRanks,
  isSkillTalent,
};
