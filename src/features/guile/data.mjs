import { GUILE_RANKS_PER_TALENT, GUILE_SPHERES_WITHOUT_BASE_RANKS, GUILE_WIKI_SLUGS } from "../../constants.mjs";

const SPHERES_MODULE_ID = "pf1spheres";
const SHARED_MODULE_ID = "critical-fail-shared";

/**
 * Whether pf1spheres is active and exposes its skill sphere dictionary.
 * @returns {boolean}
 */
export function isSpheresActive() {
  return game.modules.get(SPHERES_MODULE_ID)?.active === true && Boolean(globalThis.pf1s?.config?.skillSpheres);
}

/**
 * Skill sphere dictionary from pf1spheres (labels are localized after i18nInit).
 * @returns {Record<string, { label: string, icon?: string, reference?: string }>}
 */
export function getSkillSphereConfig() {
  return globalThis.pf1s?.config?.skillSpheres ?? {};
}

/**
 * @param {string} sphere
 * @returns {boolean}
 */
export function isSkillSphere(sphere) {
  return typeof sphere === "string" && sphere in getSkillSphereConfig();
}

/**
 * @param {Item} item
 * @returns {boolean}
 */
export function isSkillTalent(item) {
  return item?.type === "feat" && item.system?.subType === "skillTalent" && isSkillSphere(item.flags?.pf1spheres?.sphere);
}

/**
 * Owned skill talents grouped by sphere key.
 * @param {Actor} actor
 * @returns {Map<string, Item[]>}
 */
export function getSkillTalentsBySphere(actor) {
  const groups = new Map();
  for (const item of actor?.items ?? []) {
    if (!isSkillTalent(item)) continue;
    const sphere = item.flags.pf1spheres.sphere;
    if (!groups.has(sphere)) groups.set(sphere, []);
    groups.get(sphere).push(item);
  }
  for (const items of groups.values()) items.sort(compareTalents);
  return groups;
}

/**
 * Base sphere entries first, then alphabetical.
 * @param {Item} a
 * @param {Item} b
 */
function compareTalents(a, b) {
  const baseA = isBaseTalent(a) ? 0 : 1;
  const baseB = isBaseTalent(b) ? 0 : 1;
  if (baseA !== baseB) return baseA - baseB;
  return a.name.localeCompare(b.name);
}

/**
 * The base sphere entry: tagged by the Critical Fail Shared pack, or simply named after the sphere.
 * @param {Item} item
 * @returns {boolean}
 */
export function isBaseTalent(item) {
  if (item?.flags?.[SHARED_MODULE_ID]?.category === "Base") return true;
  const label = getSkillSphereConfig()[item?.flags?.pf1spheres?.sphere]?.label;
  return Boolean(label) && item.name?.trim().toLowerCase() === label.toLowerCase();
}

/**
 * Talent counts as prepared by pf1spheres (`@spheres.talents.<sphere>`).
 * @param {Actor} actor
 * @param {string} sphere
 * @returns {{ total: number, value: number, excluded: number }}
 */
export function getTalentCounts(actor, sphere) {
  const counts = actor?.system?.spheres?.talents?.[sphere];
  return {
    total: Number(counts?.total) || 0,
    value: Number(counts?.value) || 0,
    excluded: Number(counts?.excluded) || 0,
  };
}

/**
 * Bonus skill ranks granted by the given talents' `bonusSkillRanks` Changes.
 * Disabled talents are skipped; formulas are evaluated against the actor's roll data.
 * @param {Actor} actor
 * @param {Item[]} items
 * @returns {number}
 */
export function getGrantedSkillRanks(actor, items) {
  const rollData = actor?.getRollData?.() ?? {};
  let total = 0;
  for (const item of items) {
    if (item.system?.disabled) continue;
    for (const change of iterateChanges(item)) {
      if (change.target !== "bonusSkillRanks") continue;
      total += evaluateFormula(change.formula, rollData);
    }
  }
  return total;
}

/**
 * @param {Item} item
 * @returns {Iterable<{ target: string, formula: string }>}
 */
function iterateChanges(item) {
  const changes = item.changes;
  if (changes?.contents) return changes.contents;
  if (Array.isArray(changes)) return changes;
  return item.system?.changes ?? [];
}

/**
 * @param {string|number} formula
 * @param {object} rollData
 * @returns {number}
 */
function evaluateFormula(formula, rollData) {
  if (formula == null || formula === "") return 0;
  if (typeof formula === "number") return formula;
  const RollPF = pf1.dice?.RollPF;
  try {
    if (RollPF?.safeRollSync) {
      const roll = RollPF.safeRollSync(String(formula), rollData, undefined, { suppressError: true });
      return Number(roll?.total) || 0;
    }
    const roll = new Roll(String(formula), rollData);
    roll.evaluateSync({ strict: false });
    return Number(roll.total) || 0;
  } catch (_err) {
    return 0;
  }
}

/**
 * Ranks the base rules grant: 5 per talent spent in the sphere, capped at Hit Dice.
 * Returns `null` for spheres without a base rank grant (Vocation).
 * @param {Actor} actor
 * @param {string} sphere
 * @returns {number|null}
 */
export function getExpectedSkillRanks(actor, sphere) {
  if (GUILE_SPHERES_WITHOUT_BASE_RANKS.includes(sphere)) return null;
  const counts = getTalentCounts(actor, sphere);
  const hd = Number(actor?.system?.attributes?.hd?.total) || 0;
  return Math.min(GUILE_RANKS_PER_TALENT * counts.value, hd);
}

/**
 * Operative ability modifier as prepared by pf1spheres, or `null` when no operative ability is set.
 * @param {Actor} actor
 * @returns {number|null}
 */
export function getOperativeModifier(actor) {
  if (!actor?.flags?.pf1spheres?.operativeAbility) return null;
  return Number(actor.system?.spheres?.oam) || 0;
}

/**
 * @param {string} sphere
 * @returns {string|null}
 */
export function getSphereWikiUrl(sphere) {
  const slug = GUILE_WIKI_SLUGS[sphere];
  return slug ? `https://spheresofpower.wikidot.com/${slug}` : null;
}

/**
 * Per-sphere summary for every skill sphere the actor owns talents in.
 * @param {Actor} actor
 * @returns {Array<{
 *   sphere: string,
 *   label: string,
 *   icon: string,
 *   counts: { total: number, value: number, excluded: number },
 *   ranks: { granted: number, expected: number|null },
 *   base: Item|null,
 *   talents: Item[]
 * }>}
 */
export function getSkillSphereSummary(actor) {
  if (!actor || !isSpheresActive()) return [];
  const config = getSkillSphereConfig();
  const groups = getSkillTalentsBySphere(actor);
  const summary = [];
  for (const [sphere, talents] of groups) {
    const base = talents.find(isBaseTalent) ?? null;
    summary.push({
      sphere,
      label: config[sphere]?.label ?? sphere,
      icon: config[sphere]?.icon || base?.img || talents[0]?.img || "icons/svg/book.svg",
      counts: getTalentCounts(actor, sphere),
      ranks: {
        granted: getGrantedSkillRanks(actor, talents),
        expected: getExpectedSkillRanks(actor, sphere),
      },
      base,
      talents,
    });
  }
  summary.sort((a, b) => a.label.localeCompare(b.label));
  return summary;
}
