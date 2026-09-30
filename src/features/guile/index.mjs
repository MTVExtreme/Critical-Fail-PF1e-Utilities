import {
  getExpectedSkillRanks,
  getGrantedSkillRanks,
  getSkillSphereSummary,
  getSkillTalentsBySphere,
  getTalentCounts,
  isSkillTalent,
} from "./data.mjs";
import { registerGuileSheetUI } from "./sheet.mjs";

export function init() {}

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
