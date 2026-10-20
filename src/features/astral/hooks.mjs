import { MODULE_ID } from "../../constants.mjs";
import { isAstralEnabled } from "../../settings.mjs";
import { resolveShieldDamage } from "./resolve.mjs";
import {
  advanceShieldTurn,
  applyHaste,
  archiveInjunction,
  bindReflectionButton,
  changeForm,
  defensiveInterception,
  endEmp,
  postReflection,
  reflectSpell,
  removeSlow,
  setCore,
  suppressRegen,
  triggerEmp,
} from "./actions.mjs";
import { registerBossBar } from "./bossbar.mjs";
import { getBurn, registerBurnRest, syncBurnUnconscious } from "./burn.mjs";
import { announceShieldChange, paintShieldFeedback, rememberPools } from "./feedback.mjs";
import { registerShieldSheet } from "./sheet.mjs";
import { registerTokenBars, refreshTokenBars } from "./bar.mjs";
import {
  getShield,
  isAstralShield,
  isPrimaryGM,
  shieldAbsorbing,
  shieldFlagUpdate,
  stageShield,
  takeStagedShield,
} from "./state.mjs";
import { absorbDirectHealth, registerTokenHealth } from "./token-health.mjs";

const HARMFUL = new Set([
  "bleeding", "blinded", "confused", "cowering", "dazed", "dazzled", "deafened",
  "entangled", "exhausted", "fascinated", "fatigued", "frightened", "grappled",
  "helpless", "incorporeal", "nauseated", "panicked", "paralyzed", "petrified",
  "pinned", "prone", "shaken", "sickened", "staggered", "stunned", "unconscious",
]);

const MIND = new Set(["confused", "cowering", "fascinated", "frightened", "panicked", "shaken"]);

const CONTROL = {
  "Trigger EMP": triggerEmp,
  "End EMP": endEmp,
  "Advance turn": (actor) => advanceShieldTurn(actor),
  "Defensive interception": defensiveInterception,
  "Compact form": (actor) => changeForm(actor, "sm"),
  "Guardian form": (actor) => changeForm(actor, "huge"),
  "Colossus form": (actor) => changeForm(actor, "grg"),
  "Archive injunction": archiveInjunction,
  "Suppress regeneration": suppressRegen,
  "Remove core": (actor) => setCore(actor, true),
  "Restore core": (actor) => setCore(actor, false),
  "Reflect spell": reflectSpell,
};

function spellInfo(actor, options) {
  const item = options.item;
  if (!item || item.type !== "spell" || item.system?.sr !== true) return null;
  const ownerId = item.actor?.id || item.parent?.id;
  const speaker = options.message?.speaker || {};
  const casterUuid = speaker.token
    ? `Scene.${speaker.scene}.Token.${speaker.token}`
    : (item.actor?.uuid || "");
  const area = options.action?.area || options.action?.measureTemplate || options.action?.template || {};
  const areaSize = Number(area.value ?? area.size ?? area.distance ?? 0);
  return {
    sr: true,
    fromSelf: ownerId === actor.id,
    name: item.name,
    casterUuid,
    casterName: speaker.alias || item.actor?.name || "the caster",
    area: areaSize > 0 || !!(area.type && !["touch", "none", "personal", "self"].includes(String(area.type))),
  };
}

async function applyEffects(actor, effects, shield) {
  if (!effects) return;
  if (effects.haste) await applyHaste(actor, shield);
  if (effects.removeSlow) await removeSlow(actor);
  if (effects.emp) {
    shield.suppressedUntil = shield.suppressedUntil || { round: (game.combat?.round || 0) + 1, turn: game.combat?.turn || 0 };
  }
  if (effects.reflect) await postReflection({ sphinx: actor, ...effects.reflect });
  if (effects.collapsed) {
    ChatMessage.create({
      content: `<p><strong>${actor.name}'s astral shield collapses.</strong> Condition immunity ends until it restores at least 1 hit point. Regeneration can begin on its next turn.</p>`,
      speaker: ChatMessage.getSpeaker({ actor }),
      whisper: ChatMessage.getWhisperRecipients("GM").map((user) => user.id),
    });
  }
  if (effects.emp) {
    ChatMessage.create({
      content: `<p><strong>Electromagnetic disruption.</strong> ${actor.name}'s shield is inactive for 1 round and keeps its current integrity. Haste lasts 3 rounds.</p>`,
      speaker: ChatMessage.getSpeaker({ actor }),
      whisper: ChatMessage.getWhisperRecipients("GM").map((user) => user.id),
    });
  }
}

function hasEntry(value, needle) {
  if (!value) return false;
  const wanted = String(needle).toLowerCase();
  const source = value.names ?? value.standard ?? value;
  const list = typeof source?.has === "function" ? [...source] : Array.isArray(source) ? source : [];
  return list.some((entry) => String(entry?.id || entry?.name || entry).toLowerCase() === wanted);
}

function harmfulCondition(item, shield) {
  if (!item || item.getFlag?.(MODULE_ID, "astralAllow")) return false;
  if (item.type !== "buff") return false;
  const name = String(item.name || "").toLowerCase();
  const flagged = String(item.getFlag?.("pf1", "condition") || item.system?.condition || "").toLowerCase();
  const key = flagged || name;
  if (MIND.has(key) && !shieldAbsorbing(shield)) return false;
  if (/curse|bestow curse|energy drain|negative level/.test(name)) return true;
  return HARMFUL.has(key) || HARMFUL.has(name);
}

export function registerAstralHooks() {
  registerBossBar();
  registerShieldSheet();
  registerBurnRest();
  registerTokenHealth();
  registerTokenBars();
  Hooks.on("renderPF1ExtendedTooltip", (sheet, id, template) => {
    if (id !== "hit-points" || !template?.content) return;
    const burn = Number(getBurn(sheet.actor).value) || 0;
    const path = document.createElement("span");
    path.className = "path";
    path.textContent = `@flags.${MODULE_ID}.burn.value`;
    const value = document.createElement("span");
    value.className = "value";
    value.textContent = String(burn);
    template.content.append(path, value);
  });

  Hooks.on("pf1ApplyDamageTargetOptions", (app, _target, opts) => {
    const source = app?.options || app || {};
    opts.item ??= source.item;
    opts.action ??= source.action;
    opts.message ??= source.message;
  });

  Hooks.on("pf1ApplyDamage", (actor, options) => {
    try {
      if (!isAstralEnabled()) return;
      const shield = getShield(actor);
      if (!shield) return;
      const hp = actor.system?.attributes?.hp || {};
      const astral = isAstralShield(shield);
      const result = resolveShieldDamage({
        shield,
        options,
        hp,
        absorbing: shieldAbsorbing(shield),
        spell: astral ? spellInfo(actor, options) : null,
        astral,
        tempFirst: Boolean(shield.tempFirst),
        temp: Math.max(0, Number(hp.temp) || 0),
      });
      if (!result?.rewrite) return;
      options.value = result.body + (result.tempTaken || 0);
      options.reduction = 0;
      options.ratio = 1;
      const next = { ...shield, value: result.shieldValue };
      if (result.effects.haste) next.hasteRounds = 3;
      if (result.effects.emp) {
        next.suppressedUntil = {
          round: (game.combat?.round || 0) + 1,
          turn: game.combat?.turn || 0,
        };
      }
      const types = (options.instances || []).flatMap((inst) => [...(inst.types || [])]).map((type) => String(type).toLowerCase());
      if (hasEntry(options.item?.system?.descriptors, "evil") || types.includes("evil")) next.regenSuppressed = true;
      if (result.body + (result.tempTaken || 0) !== 0) stageShield(actor, next);
      else void actor.update(shieldFlagUpdate(next));
      void applyEffects(actor, result.effects, next);
    } catch (error) {
      console.error(`${MODULE_ID} | Astral shield`, error);
    }
  });

  Hooks.on("preUpdateActor", (actor, update, options) => {
    rememberPools(actor);
    const staged = takeStagedShield(actor);
    if (!isAstralEnabled()) {
      if (staged) foundry.utils.setProperty(update, `flags.${MODULE_ID}.energyShield`, staged);
      return;
    }
    if (staged) foundry.utils.setProperty(update, `flags.${MODULE_ID}.energyShield`, staged);

    const shield = staged || getShield(actor);
    if (options?.pf1?.action !== "rest") absorbDirectHealth(actor, update, shield, { staged: Boolean(staged), options });
    if (!isAstralShield(shield) || !shieldAbsorbing(shield)) return;
    for (const ability of ["str", "dex", "con", "int", "wis", "cha"]) {
      const incoming = update.system?.abilities?.[ability];
      if (!incoming) continue;
      const current = actor.system.abilities?.[ability] || {};
      if (incoming.damage != null && incoming.damage > (current.damage || 0)) incoming.damage = current.damage || 0;
      if (incoming.drain != null && incoming.drain > (current.drain || 0)) incoming.drain = current.drain || 0;
    }
    const drain = update.system?.attributes?.energyDrain;
    if (drain != null && drain > (actor.system.attributes?.energyDrain || 0)) {
      update.system.attributes.energyDrain = actor.system.attributes.energyDrain || 0;
    }
  });

  Hooks.on("preCreateItem", (item) => {
    if (!isAstralEnabled()) return;
    const actor = item.actor || item.parent;
    const shield = getShield(actor);
    if (!isAstralShield(shield) || !shieldAbsorbing(shield)) return;
    if (!harmfulCondition(item, shield)) return;
    ui.notifications.info(`${actor.name}'s astral shield shrugs off ${item.name}.`);
    return false;
  });

  Hooks.on("pf1PreActionUse", (use) => {
    if (use.item?.getFlag(MODULE_ID, "astralAction") !== "controls") return;
    const run = CONTROL[use.action?.name];
    if (!run) return;
    run(use.actor).catch((error) => console.error(`${MODULE_ID} | Astral control`, error));
    return false;
  });

  Hooks.on("updateCombat", (combat, changed) => {
    if (!isAstralEnabled() || !isPrimaryGM()) return;
    if (!("turn" in changed) && !("round" in changed)) return;
    const actor = combat.combatant?.actor;
    const shield = getShield(actor);
    if (!isAstralShield(shield) || shield.coreRemoved) return;
    advanceShieldTurn(actor, { quiet: true }).catch((error) => console.error(`${MODULE_ID} | Astral turn`, error));
  });

  const bind = (_message, html) => bindReflectionButton(html);
  Hooks.on("renderChatMessageHTML", (message, html) => {
    bind(message, html);
    paintShieldFeedback(message, html);
  });
  Hooks.on("renderChatMessage", (message, html) => {
    bind(message, html);
    paintShieldFeedback(message, html);
  });
  Hooks.on("updateActor", (actor, data, options, userId) => {
    announceShieldChange(actor, data, options, userId);
    const changed = data.flags?.[MODULE_ID]?.energyShield || data.flags?.[MODULE_ID]?.burn
      || data.system?.attributes?.hp || data.items;
    if (changed) refreshTokenBars(actor);
    if (game.user.id === userId) {
      syncBurnUnconscious(actor).catch((error) => console.error(`${MODULE_ID} | Burn unconscious`, error));
    }
  });
}
