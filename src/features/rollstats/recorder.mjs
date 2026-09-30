import { isRollTrackingEnabled } from "../../settings.mjs";
import { queueRecords } from "./store.mjs";

/** Actor types whose rolls are recorded (PC sheets). */
const TRACKED_ACTOR_TYPES = new Set(["character"]);

export function registerRollRecorder() {
  Hooks.on("createChatMessage", onCreateChatMessage);
}

/**
 * Only the active GM records, so every roll is stored exactly once regardless of who rolled it.
 * @param {ChatMessage} message
 */
function onCreateChatMessage(message) {
  try {
    if (!isRollTrackingEnabled()) return;
    if (!game.user?.isActiveGM) return;
    const record = recordFromMessage(message);
    if (record) queueRecords([record]);
  } catch (err) {
    console.error("critical-fail-pf1e-utilities | Roll stats recorder failed", err);
  }
}

/**
 * Build a store record from a chat message, or `null` when there is nothing to track.
 * @param {ChatMessage} message
 */
export function recordFromMessage(message) {
  const actor = resolveActor(message);
  if (!actor || !TRACKED_ACTOR_TYPES.has(actor.type)) return null;
  const extracted = extractFromMessage(message, actor);
  if (!extracted.d20.length && !extracted.dmg.length) return null;
  return {
    actorId: actor.id,
    name: actor.name,
    ts: Number(message.timestamp) || Date.now(),
    d20: extracted.d20,
    dmg: extracted.dmg,
  };
}

/**
 * @param {ChatMessage} message
 * @returns {Actor|null}
 */
export function resolveActor(message) {
  const speaker = message?.speaker ?? {};
  if (speaker.actor) {
    const actor = game.actors?.get(speaker.actor);
    if (actor) return actor;
  }
  if (speaker.scene && speaker.token) {
    const token = game.scenes?.get(speaker.scene)?.tokens?.get(speaker.token);
    if (token?.actor) return token.actor;
  }
  return null;
}

/**
 * Natural d20 results and damage rolled on a message.
 *
 * PF1 action cards keep their rolls as JSON in `message.system.rolls.attacks`; every other roll
 * message (skill checks, saves, initiative, `/r 1d20`) exposes Roll instances on `message.rolls`.
 *
 * @param {ChatMessage} message
 * @param {Actor|null} [actor]
 * @returns {{ d20: number[], dmg: Array<{ amount: number, heal: boolean }> }}
 */
export function extractFromMessage(message, actor = null) {
  const d20 = [];
  const dmg = [];
  const attacks = message?.system?.rolls?.attacks;

  if (Array.isArray(attacks) && attacks.length) {
    const heal = isHealAction(message, actor);
    for (const attack of attacks) {
      if (!attack) continue;
      collectD20Faces(attack.attack, d20);
      collectD20Faces(attack.critConfirm, d20);
      const amount = sumTotals(attack.damage) + sumTotals(attack.critDamage);
      if (amount > 0) dmg.push({ amount, heal });
    }
    return { d20, dmg };
  }

  for (const roll of message?.rolls ?? []) collectD20Faces(roll, d20);
  return { d20, dmg };
}

/**
 * Whether the action behind a PF1 card is a Healing action.
 * @param {ChatMessage} message
 * @param {Actor|null} actor
 */
function isHealAction(message, actor) {
  const itemId = message?.system?.item?.id;
  const actionId = message?.system?.action?.id;
  if (!itemId || !actionId) return false;
  const item = actor?.items?.get(itemId);
  const actions = item?.actions;
  const action = actions?.get?.(actionId) ?? actions?.find?.((a) => a.id === actionId) ?? item?.system?.actions?.find?.((a) => a._id === actionId);
  return action?.actionType === "heal";
}

/**
 * Collect kept natural d20 results from a Roll instance or Roll JSON, walking nested terms.
 * Discarded (kh/kl, rerolled) results are skipped so `2d20kh` counts once.
 * @param {object|null} roll
 * @param {number[]} out
 */
export function collectD20Faces(roll, out) {
  if (!roll) return;
  walkTerms(roll.terms, out, 0);
}

function walkTerms(terms, out, depth) {
  if (!Array.isArray(terms) || depth > 8) return;
  for (const term of terms) {
    if (!term || typeof term !== "object") continue;
    if (Number(term.faces) === 20 && Array.isArray(term.results)) {
      for (const result of term.results) {
        if (!result || result.active === false || result.discarded) continue;
        const face = Number(result.result);
        if (face >= 1 && face <= 20) out.push(face);
      }
      continue;
    }
    if (Array.isArray(term.rolls)) for (const nested of term.rolls) walkTerms(nested?.terms, out, depth + 1);
    if (term.roll?.terms) walkTerms(term.roll.terms, out, depth + 1);
    if (Array.isArray(term.terms)) walkTerms(term.terms, out, depth + 1);
  }
}

/**
 * @param {Array<{ total?: number }>|undefined} rolls
 * @returns {number}
 */
function sumTotals(rolls) {
  if (!Array.isArray(rolls)) return 0;
  return rolls.reduce((sum, roll) => sum + (Number(roll?.total) || 0), 0);
}
