import { MODULE_ID } from "../../constants.mjs";
import {
  getShield,
  isSuppressed,
  shieldAbsorbing,
  shieldFlagUpdate,
  suppressionExpiry,
} from "./state.mjs";

const FORMS = {
  sm: { size: "sm", width: 1, height: 1, label: "Compact" },
  huge: { size: "huge", width: 3, height: 3, label: "Guardian" },
  grg: { size: "grg", width: 4, height: 4, label: "Colossus" },
};

const HASTE_NAME = "Hearthfire Haste";

function gmMessage(content) {
  ChatMessage.create({
    content,
    speaker: ChatMessage.getSpeaker(),
    whisper: ChatMessage.getWhisperRecipients("GM").map((user) => user.id),
  });
}

export async function setShield(actor, shield, { chat } = {}) {
  await actor.update(shieldFlagUpdate(shield));
  if (chat) gmMessage(chat);
}

export async function applyHaste(actor, shield) {
  shield.hasteRounds = 3;
  let buff = actor.items.find((item) => item.getFlag(MODULE_ID, "astralAllow") && item.name === HASTE_NAME);
  if (!buff) {
    const created = await actor.createEmbeddedDocuments("Item", [{
      name: HASTE_NAME,
      type: "buff",
      img: "systems/pf1/icons/misc/magic-swirl.png",
      system: {
        description: { value: "<p>Electrical restoration or hearthfire acceleration. +1 to attack rolls, +1 dodge to AC, +30 ft. land and fly speed, and one extra attack on a full attack. Lasts 3 rounds; further shocks refresh the duration instead of stacking.</p>" },
        subType: "temp",
        active: true,
        duration: { value: "3", units: "round" },
        changes: [
          { _id: "cfh1ac", formula: "1", operator: "add", priority: 0, target: "ac", type: "dodge" },
          { _id: "cfh2at", formula: "1", operator: "add", priority: 0, target: "mattack", type: "untyped" },
          { _id: "cfh3ra", formula: "1", operator: "add", priority: 0, target: "rattack", type: "untyped" },
          { _id: "cfh4ls", formula: "30", operator: "add", priority: 0, target: "landSpeed", type: "untyped" },
          { _id: "cfh5fs", formula: "30", operator: "add", priority: 0, target: "flySpeed", type: "untyped" },
          { _id: "cfh6ex", formula: "1", operator: "add", priority: 0, target: "extraAttacks", type: "untyped" },
        ],
        changeFlags: {},
        contextNotes: [],
      },
      flags: { [MODULE_ID]: { astralAllow: true } },
    }]);
    buff = created?.[0];
  } else if (!buff.system.active) {
    await buff.update({ "system.active": true, "system.duration.value": "3" });
  }
  return shield;
}

export async function clearHaste(actor, shield) {
  shield.hasteRounds = 0;
  const buff = actor.items.find((item) => item.name === HASTE_NAME && item.system?.active);
  if (buff) await buff.update({ "system.active": false });
}

export async function removeSlow(actor) {
  const slows = actor.items.filter((item) => item.type === "buff" && item.system?.active && /slow/i.test(item.name));
  for (const item of slows) await item.update({ "system.active": false });
}

async function resizeTokens(actor, form) {
  const tokens = actor.getActiveTokens?.(true, true) || [];
  for (const token of tokens) {
    await token.update({ width: form.width, height: form.height });
  }
  if (!actor.isToken) {
    await actor.update({
      "system.traits.size": form.size,
      "prototypeToken.width": form.width,
      "prototypeToken.height": form.height,
    });
  } else {
    await actor.update({ "system.traits.size": form.size });
  }
}

export async function advanceShieldTurn(actor, { quiet = false } = {}) {
  const shield = getShield(actor);
  if (!shield || shield.coreRemoved) return null;
  const wasSuppressed = isSuppressed(shield);
  if (shield.suppressedUntil && !wasSuppressed) shield.suppressedUntil = null;

  if (!isSuppressed(shield)) {
    if (!shield.regenSuppressed) {
      const heal = Number(shield.bodyRegen) || 0;
      if (heal > 0) {
        const before = actor.system.attributes.hp.value;
        await actor.applyDamage(-heal, { asNonlethal: false });
        if ((before ?? 0) <= 0) {
          gmMessage(`<p><strong>${actor.name}</strong> was inert. Astral regeneration restores it to ${heal} body hit points.</p>`);
        }
      }
    } else {
      shield.regenSuppressed = false;
      if (!quiet) gmMessage(`<p>Evil damage suppresses ${actor.name}'s regeneration this turn.</p>`);
    }
    shield.value = Math.min(shield.max, shield.value + (Number(shield.regen) || 0));
  }

  if (shield.hasteRounds > 0) {
    shield.hasteRounds -= 1;
    if (shield.hasteRounds <= 0) await clearHaste(actor, shield);
  }
  await actor.update(shieldFlagUpdate(shield));
  return shield;
}

export async function triggerEmp(actor) {
  const shield = getShield(actor);
  if (!shield || shield.coreRemoved) return;
  shield.suppressedUntil = suppressionExpiry();
  await applyHaste(actor, shield);
  const hp = actor.system.attributes.hp;
  const missing = Math.max(0, (hp.max || 0) - (hp.value || 0));
  const toBody = Math.min(missing, 20);
  if (toBody > 0) await actor.applyDamage(-toBody, { asNonlethal: false });
  await actor.update(shieldFlagUpdate(shield));
  gmMessage(`<p><strong>Electromagnetic disruption.</strong> ${actor.name}'s astral shield drops for 1 round at ${shield.value.toLocaleString()} integrity. The pulse heals ${toBody} body hit points and grants haste for 3 rounds.</p>`);
}

export async function endEmp(actor) {
  const shield = getShield(actor);
  if (!shield) return;
  shield.suppressedUntil = null;
  await actor.update(shieldFlagUpdate(shield));
  gmMessage(`<p>${actor.name}'s astral shield snaps back at ${shield.value.toLocaleString()} integrity.</p>`);
}

async function promptNumber(title, label) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    new Dialog({
      title,
      content: `<form><div class="form-group"><label>${label}</label><input name="amount" type="number" value="0" autofocus></div></form>`,
      buttons: {
        ok: {
          icon: '<i class="fas fa-check"></i>',
          label: "Apply",
          callback: (html) => {
            const root = html instanceof HTMLElement ? html : html[0];
            finish(Number(root?.querySelector("[name=amount]")?.value) || 0);
          },
        },
        cancel: { label: "Cancel", callback: () => finish(null) },
      },
      default: "ok",
      close: () => finish(null),
    }).render(true);
  });
}

export async function defensiveInterception(actor) {
  const shield = getShield(actor);
  if (!shieldAbsorbing(shield)) {
    ui.notifications.warn(`${actor.name}'s shield cannot intercept while it is down.`);
    return;
  }
  const amount = await promptNumber("Defensive Interception", "Hit point damage to redirect into the shield");
  if (amount === null) return;
  const damage = Math.max(0, Math.floor(amount));
  const absorbed = Math.min(shield.value, damage);
  const excess = damage - absorbed;
  shield.value -= absorbed;
  await actor.update(shieldFlagUpdate(shield));
  gmMessage(`<p><strong>Defensive interception.</strong> ${actor.name} pulls ${absorbed} damage into the astral shield (${shield.value.toLocaleString()} remaining).${excess > 0 ? ` ${excess} damage still reaches the original target.` : ""}</p>`);
}

export async function archiveInjunction(actor) {
  const shield = getShield(actor);
  if (!shield || shield.coreRemoved) return;
  const target = [...(game.user.targets || [])][0];
  if (target && canvas.scene) {
    await MeasuredTemplateDocument.create({
      t: "circle",
      user: game.user.id,
      x: target.center.x,
      y: target.center.y,
      distance: 30,
      direction: 0,
      fillColor: "#7ee7ff",
      borderColor: "#d7fbff",
    }, { parent: canvas.scene });
  }
  const rows = [];
  for (const token of game.user.targets || []) {
    const targetActor = token.actor;
    if (!targetActor || targetActor === actor) continue;
    try {
      const roll = await targetActor.rollSavingThrow("will", { skipDialog: true, dice: "1d20", bonus: 0, dc: 34 });
      const total = roll?.total ?? roll?.rolls?.[0]?.total;
      rows.push(`<li>${targetActor.name}: Will ${total ?? "rolled"} vs DC 34</li>`);
    } catch (error) {
      rows.push(`<li>${targetActor.name}: roll a DC 34 Will save</li>`);
    }
  }
  gmMessage(`<p><strong>Archive injunction.</strong> 30-foot burst, DC 34 Will or entangled and unable to leave the square for 1d4 rounds. Escape DC 34. The bands have hardness 20 and 40 hit points. This is a force effect and deals no damage.</p>${rows.length ? `<ul>${rows.join("")}</ul>` : "<p>Target creatures before using this to place the burst and roll saves.</p>"}`);
}

export async function changeForm(actor, key) {
  const shield = getShield(actor);
  const form = FORMS[key];
  if (!shield || !form || shield.coreRemoved) return;
  shield.form = key;
  await resizeTokens(actor, form);
  await actor.update(shieldFlagUpdate(shield));
  gmMessage(`<p>${actor.name} folds into its <strong>${form.label}</strong> form (${form.size}). Strength, hit points, and the shield are unchanged.</p>`);
}

export async function reflectSpell(actor) {
  const casterToken = [...(game.user.targets || [])][0];
  const caster = casterToken?.actor;
  if (!caster || caster === actor) {
    ui.notifications.warn("Target the original caster, then use Reflect spell.");
    return;
  }
  const amount = await promptNumber("Reflect Spell", `Damage reflected onto ${caster.name}`);
  if (amount === null) return;
  await postReflection({
    sphinx: actor,
    amount: Math.max(0, Math.floor(amount)),
    backlash: false,
    name: "Spell",
    casterUuid: casterToken.document?.uuid || caster.uuid,
    casterName: caster.name,
  });
}

export async function postReflection({ sphinx, amount, backlash, name, casterUuid, casterName }) {
  const verb = backlash
    ? `turns the area spell back on ${casterName} alone`
    : `reflects ${name} back at ${casterName}`;
  const button = casterUuid
    ? `<p><button type="button" data-cf-reflect="1" data-uuid="${casterUuid}" data-damage="${amount}">Apply ${amount} to ${casterName}</button></p>`
    : "";
  gmMessage(`<div class="cf-astral-card"><p><strong>Spell reflection.</strong> ${sphinx.name} ${verb}. The spell keeps its original caster level and DC. ${sphinx.name} is untouched.</p>${button}</div>`);
}

export async function setCore(actor, removed) {
  const shield = getShield(actor);
  if (!shield) return;
  shield.coreRemoved = removed;
  if (removed) {
    shield.suppressedUntil = { round: 9999, turn: 0 };
    await clearHaste(actor, shield);
  } else if (shield.suppressedUntil?.round === 9999) {
    shield.suppressedUntil = null;
  }
  await actor.update(shieldFlagUpdate(shield));
  gmMessage(removed
    ? `<p>The astral diamond leaves ${actor.name}. It is an inanimate construct until the core is restored. The soul in the diamond is not destroyed.</p>`
    : `<p>The astral diamond is seated again. ${actor.name} resumes its watch.</p>`);
}

export async function suppressRegen(actor) {
  const shield = getShield(actor);
  if (!shield) return;
  shield.regenSuppressed = true;
  await actor.update(shieldFlagUpdate(shield));
  gmMessage(`<p>Evil damage suppresses ${actor.name}'s astral regeneration on its next turn.</p>`);
}

export function bindReflectionButton(html) {
  const root = html instanceof HTMLElement ? html : html?.[0];
  if (!root) return;
  for (const button of root.querySelectorAll("[data-cf-reflect]")) {
    button.addEventListener("click", async (event) => {
      event.preventDefault();
      if (!game.user.isGM) return;
      const uuid = button.dataset.uuid;
      const damage = Number(button.dataset.damage) || 0;
      const doc = await fromUuid(uuid);
      const actor = doc?.actor || doc;
      if (!actor || !damage) return;
      await pf1.documents.ActorPF.applyDamage(damage, { targets: [actor], interactive: true });
    });
  }
}
