import { MODULE_ID } from "../../constants.mjs";

const SETTING = "backgroundSkillSetsRepaired";

/** Top-level skills the PF1 v14 migration marks as background. */
const BACKGROUND_ROOTS = new Set([
  "appraise",
  "artistry",
  "craft",
  "handleAnimal",
  "linguistics",
  "lore",
  "perform",
  "profession",
  "sleightOfHand",
]);

/** Knowledge subskills the PF1 v14 migration marks as background. */
const BACKGROUND_FULL = new Set([
  "knowledge.engineering",
  "knowledge.geography",
  "knowledge.history",
  "knowledge.nobility",
]);

export function init() {
  game.settings.register(MODULE_ID, SETTING, {
    scope: "world",
    config: false,
    type: Boolean,
    default: false,
  });
}

/**
 * PF1 v14 created skill items in the Adventure set and then dropped the background
 * set while updating existing items. Put the background skills back.
 */
export async function ready() {
  if (!game.user.isActiveGM) return;
  if (game.settings.get(MODULE_ID, SETTING)) return;

  const skillConfig = game.settings.get("pf1", "skills");
  const skillData = typeof skillConfig?.toObject === "function" ? skillConfig.toObject() : { ...skillConfig };
  if (!skillData.sets || !skillData.background) {
    skillData.sets = true;
    skillData.background = true;
    await game.settings.set("pf1", "skills", skillData);
  }

  const touched = [];
  for (const actor of game.actors) {
    const itemUpdates = [];
    for (const item of actor.items) {
      if (!isMisfiledBackgroundSkill(item)) continue;
      itemUpdates.push({ _id: item.id, "system.sets": ["background"] });
    }
    if (!itemUpdates.length) continue;
    await actor.updateEmbeddedDocuments("Item", itemUpdates);
    touched.push(`${actor.name} (${itemUpdates.length})`);
  }

  await game.settings.set(MODULE_ID, SETTING, true);
  if (touched.length) {
    console.log(`${MODULE_ID} | Background skills moved out of Adventure: ${touched.join(", ")}`);
    ui.notifications.info(`Background skills were sorted out of Adventure on ${touched.length} actor${touched.length === 1 ? "" : "s"}.`);
  }
}

/**
 * @param {Item} item
 * @returns {boolean}
 */
function isMisfiledBackgroundSkill(item) {
  if (item.type !== "skill" || !isBackgroundSkill(item)) return false;
  const sets = item.system?.sets;
  const current = sets instanceof Set ? [...sets] : Array.isArray(sets) ? [...sets] : [];
  return !(current.length === 1 && current[0] === "background");
}

/**
 * @param {Item} item
 * @returns {boolean}
 */
function isBackgroundSkill(item) {
  const id = item.system?.identifier;
  if (!id) return false;
  const grouping = item.system?.grouping || "";
  const full = grouping ? `${grouping}.${id}` : id;
  if (BACKGROUND_FULL.has(full)) return true;
  if (!grouping && BACKGROUND_ROOTS.has(id)) return true;
  if (grouping && BACKGROUND_ROOTS.has(grouping)) return true;
  return false;
}
