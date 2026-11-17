import { MODULE_ID } from "../../constants.mjs";

/**
 * Damage min/max buttons on Pathfinder attack cards.
 *
 * The card owner (or a GM) can force the dice of a damage total, or of one damage
 * line, to their minimum or maximum. The change is written to the chat message
 * (card HTML and `system.rolls`), so every client sees it and PF1's Apply Damage
 * buttons use the new numbers. The original card is kept in a flag for Reset.
 *
 * The same buttons appear on `/d`, `/damage`, `/h`, and `/heal` cards: beside the
 * card title for the whole roll, and on each dice group in the roll breakdown.
 */

const SETTING = "enableDamageAdjust";
const FLAG = "damageAdjust";
const MODES = new Set(["min", "max"]);
/** Messages whose roll breakdown should stay open after the next render */
const keepExpanded = new Set();

export function init() {
  game.settings.register(MODULE_ID, SETTING, {
    name: "CFUTIL.Settings.enableDamageAdjust",
    hint: "CFUTIL.Settings.enableDamageAdjustHint",
    scope: "world",
    config: true,
    type: new foundry.data.fields.BooleanField({ initial: true }),
  });
}

export function pf1PostInit() {}

export function setup() {
  Hooks.on("renderChatMessageHTML", (message, html) => {
    try {
      const root = html instanceof HTMLElement ? html : html?.[0];
      if (isDamageCard(message)) injectCardControls(message, root);
      else injectControls(message, root);
    } catch (error) {
      console.error(`${MODULE_ID} | Damage adjust render`, error);
    }
  });
}

export function ready() {}

export const api = {
  setModes: (message, changes) => (isDamageCard(message) ? applyCardModes(message, changes) : applyModes(message, changes)),
  reset: (message) => resetAll(message),
};

function isEnabled() {
  return game.settings.get(MODULE_ID, SETTING) !== false;
}

/* -------------------------------------------- */
/*  Rendering                                   */
/* -------------------------------------------- */

function damageRows(attackEl) {
  return [...attackEl.querySelectorAll("tbody > tr")].filter(
    (tr) => !tr.classList.contains("attack") && !tr.classList.contains("damage"),
  );
}

function keysFor(index, attack, type) {
  const keys = (attack?.damage ?? []).map((_, j) => `${index}:n:${j}`);
  if (type === "critical") keys.push(...(attack?.critDamage ?? []).map((_, j) => `${index}:c:${j}`));
  return keys;
}

function injectControls(message, root) {
  if (!root || !isEnabled() || !message?.isOwner) return;
  // Saved (plain) roll data: PF1 turns message.system.rolls into Roll instances in memory
  const attacks = (message._source?.system ?? message.system)?.rolls?.attacks;
  if (!Array.isArray(attacks) || !attacks.length) return;
  const modes = message.getFlag(MODULE_ID, FLAG)?.modes ?? {};

  for (const attackEl of root.querySelectorAll(".chat-attack[data-index]")) {
    const index = Number(attackEl.dataset.index);
    const attack = attacks[index];
    if (!attack?.damage?.length && !attack?.critDamage?.length) continue;

    // Totals: the normal/critical header cells, or the header of an attack-less damage card
    for (const th of attackEl.querySelectorAll("tr.damage > th[data-damage-type], thead th.attack-damage")) {
      if (th.querySelector(":scope > .cf-dmg-ctrl")) continue;
      const type = th.dataset.damageType === "critical" ? "critical" : "normal";
      const keys = keysFor(index, attack, type);
      if (!keys.length) continue;
      // Reset replaces the buttons once every line in this column has been changed
      const active = keys.every((k) => modes[k]);
      th.prepend(buildControl(message, keys, active, true));
    }

    // Individual damage lines
    damageRows(attackEl).forEach((tr, j) => {
      const cells = [
        ["td.roll.damage.normal", `${index}:n:${j}`, attack.damage?.[j]],
        ["td.roll.damage.critical", `${index}:c:${j}`, attack.critDamage?.[j]],
      ];
      for (const [selector, key, roll] of cells) {
        const td = tr.querySelector(selector);
        if (!td || !roll || td.querySelector(":scope > .cf-dmg-ctrl")) continue;
        if (!modes[key] && !rollHasDice(roll)) continue; // flat damage has nothing to change
        td.prepend(buildControl(message, [key], Boolean(modes[key]), false));
      }
    });
  }
}

function buildControl(message, keys, active, total, apply = applyModes) {
  const span = document.createElement("span");
  span.className = `cf-dmg-ctrl${total ? " cf-dmg-ctrl-total" : ""}`;
  const add = (mode, icon, label) => {
    const a = document.createElement("a");
    a.className = `cf-dmg-btn cf-dmg-btn-${mode}`;
    a.dataset.cfDmg = mode;
    a.dataset.tooltip = game.i18n.localize(label);
    a.setAttribute("aria-label", a.dataset.tooltip);
    a.innerHTML = `<i class="${icon}" inert></i>`;
    a.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (span.classList.contains("busy")) return;
      span.classList.add("busy");
      const value = mode === "reset" ? null : mode;
      apply(message, Object.fromEntries(keys.map((k) => [k, value])))
        .catch((error) => {
          console.error(`${MODULE_ID} | Damage adjust`, error);
          ui.notifications?.error(game.i18n.localize("CFUTIL.DamageAdjust.Failed"));
        })
        .finally(() => span.classList.remove("busy"));
    });
    span.append(a);
  };
  if (active) add("reset", "fa-solid fa-rotate-left", total ? "CFUTIL.DamageAdjust.ResetAll" : "CFUTIL.DamageAdjust.Reset");
  else {
    add("min", "fa-solid fa-dice-one", total ? "CFUTIL.DamageAdjust.MinAll" : "CFUTIL.DamageAdjust.Min");
    add("max", "fa-solid fa-dice-six", total ? "CFUTIL.DamageAdjust.MaxAll" : "CFUTIL.DamageAdjust.Max");
  }
  return span;
}

/* -------------------------------------------- */
/*  Message update                              */
/* -------------------------------------------- */

/**
 * @param {ChatMessage} message
 * @param {Record<string, "min"|"max"|null>} changes - keys `attack:n|c:line`
 */
export async function applyModes(message, changes) {
  if (!message?.isOwner) return;
  const flag = message.getFlag(MODULE_ID, FLAG) ?? {};
  const original = flag.original ?? {
    content: message.content,
    rolls: foundry.utils.deepClone(message._source.system?.rolls ?? {}),
  };
  const modes = { ...(flag.modes ?? {}) };
  for (const [key, mode] of Object.entries(changes)) {
    if (MODES.has(mode)) modes[key] = mode;
    else delete modes[key];
  }

  if (foundry.utils.isEmpty(modes)) return resetAll(message);

  const { content, rolls } = build(original, modes);
  await message.update({
    content,
    "system.rolls": rolls,
    [`flags.${MODULE_ID}.${FLAG}`]: { original, modes },
  });
}

export async function resetAll(message) {
  const flag = message?.getFlag(MODULE_ID, FLAG);
  if (!flag?.original || !message.isOwner) return;
  if (flag.original.kind === "card") {
    await message.update({
      content: flag.original.content,
      rolls: flag.original.rolls,
      [`flags.${MODULE_ID}.-=${FLAG}`]: null,
    });
    return;
  }
  await message.update({
    content: flag.original.content,
    "system.rolls": flag.original.rolls,
    [`flags.${MODULE_ID}.-=${FLAG}`]: null,
  });
}

function build(original, modes) {
  const rolls = foundry.utils.deepClone(original.rolls);
  const touched = new Set();
  for (const [key, mode] of Object.entries(modes)) {
    const [a, t, j] = key.split(":");
    const list = rolls.attacks?.[a]?.[t === "c" ? "critDamage" : "damage"];
    if (!list?.[j]) continue;
    list[j] = forcedRollData(list[j], mode);
    touched.add(Number(a));
  }

  const template = document.createElement("template");
  template.innerHTML = original.content;
  for (const attackEl of template.content.querySelectorAll(".chat-attack[data-index]")) {
    const index = Number(attackEl.dataset.index);
    if (!touched.has(index)) continue;
    const attack = rolls.attacks[index];

    // Replace adjusted inline rolls
    damageRows(attackEl).forEach((tr, j) => {
      for (const [selector, t, list] of [["td.roll.damage.normal", "n", attack.damage], ["td.roll.damage.critical", "c", attack.critDamage]]) {
        const mode = modes[`${index}:${t}:${j}`];
        const anchor = tr.querySelector(`${selector} a.inline-roll`);
        if (!mode || !anchor || !list?.[j]) continue;
        const classes = [...anchor.classList].filter((c) => !["inline-roll", "inline-result"].includes(c) && !c.startsWith("cf-dmg-"));
        const replacement = Roll.fromData(list[j]).toAnchor({ classes: [...classes, "cf-dmg-adjusted", `cf-dmg-${mode}`] });
        if (anchor.dataset.tooltipText) replacement.dataset.tooltipText = anchor.dataset.tooltipText;
        anchor.replaceWith(replacement);
      }
    });

    // Recompute totals and the Apply Damage values
    const sum = (list) => (list ?? []).reduce((t, r) => t + (Number(r?.total) || 0), 0);
    const normal = sum(attack.damage);
    const critical = normal + sum(attack.critDamage);
    for (const th of attackEl.querySelectorAll("tr.damage > th[data-damage-type], thead th.attack-damage")) {
      const isCrit = th.dataset.damageType === "critical";
      updateTotal(th, isCrit ? critical : normal);
    }
  }
  return { content: template.innerHTML, rolls };
}

function updateTotal(th, rawTotal) {
  const buttons = [...th.querySelectorAll('a[data-action="applyDamage"]')];
  const healing = buttons.some((b) => String(b.dataset.value ?? "").startsWith("-"));
  let total = rawTotal;
  let clamped = false;
  // PF1 minimum damage rule: at least 1 (nonlethal)
  if (!healing && total < 1) {
    total = 1;
    clamped = true;
  }
  const label = th.querySelector("a.fake-inline-roll, a.total");
  if (label) {
    label.textContent = String(total);
    label.classList.add("cf-dmg-adjusted");
  }
  for (const button of buttons) {
    const ratio = Number(button.dataset.ratio) || 1;
    const value = ratio < 1 ? Math.floor(total * ratio) : total;
    button.dataset.value = `${healing ? "-" : ""}${value}`;
    if (clamped) {
      const tags = new Set((button.dataset.tags ?? "").split(";").filter(Boolean));
      tags.add("nonlethal");
      button.dataset.tags = [...tags].join(";");
    }
  }
}

/* -------------------------------------------- */
/*  /damage and /heal cards                     */
/* -------------------------------------------- */

function isDamageCard(message) {
  if (!message?.rolls?.length) return false;
  if (message.type === "damage") return true; // PF1 v14 damage messages
  const health = message.system?.subject?.health; // PF1 11 chat commands
  return health === "damage" || health === "healing";
}

function injectCardControls(message, root) {
  if (!root || !isEnabled() || !message?.isOwner) return;
  const card = root.querySelector(".damage-card");
  const roll = message.rolls[0];
  if (!card || !roll) return;
  const dice = roll.dice;
  const keys = dice.map((d, i) => (isForcible(d) ? `r:${i}` : null)).filter(Boolean);
  if (!keys.length) return;
  const modes = message.getFlag(MODULE_ID, FLAG)?.modes ?? {};

  // Whole roll: beside the card title
  const title = card.querySelector(":scope > h2") ?? card.querySelector("h2");
  if (title && !title.querySelector(":scope > .cf-dmg-ctrl")) {
    title.prepend(buildControl(message, keys, keys.every((k) => modes[k]), true, applyCardModes));
  }

  // Each dice group: in the roll breakdown (one tooltip part per die term)
  const parts = card.querySelectorAll(".dice-tooltip .tooltip-part");
  dice.forEach((die, i) => {
    const part = parts[i];
    if (!part || !isForcible(die)) return;
    const header = part.querySelector(".part-header") ?? part;
    if (header.querySelector(":scope > .cf-dmg-ctrl")) return;
    const control = buildControl(message, [`r:${i}`], Boolean(modes[`r:${i}`]), false, applyCardModes);
    control.addEventListener("click", () => keepExpanded.add(message.id), true);
    header.prepend(control);
  });

  if (keepExpanded.delete(message.id)) card.querySelector(".dice-tooltip")?.classList.add("expanded");
}

/**
 * @param {ChatMessage} message
 * @param {Record<string, "min"|"max"|null>} changes - keys `r:<die index>`
 */
async function applyCardModes(message, changes) {
  if (!message?.isOwner) return;
  const flag = message.getFlag(MODULE_ID, FLAG) ?? {};
  const original = flag.original ?? {
    kind: "card",
    content: message.content,
    rolls: message.rolls.map((r) => JSON.parse(JSON.stringify(r))),
  };
  const modes = { ...(flag.modes ?? {}) };
  for (const [key, mode] of Object.entries(changes)) {
    if (MODES.has(mode)) modes[key] = mode;
    else delete modes[key];
  }
  if (foundry.utils.isEmpty(modes)) return resetAll(message);

  const diceModes = Object.fromEntries(Object.entries(modes).map(([k, v]) => [Number(k.split(":")[1]), v]));
  const data = forcedDiceData(original.rolls[0], diceModes);
  const content = original.content?.includes("damage-card")
    ? await rebuildCardContent(original.content, Roll.fromData(data), message)
    : original.content; // PF1 v14 draws the card from the roll itself

  await message.update({
    content,
    rolls: [data, ...original.rolls.slice(1)],
    [`flags.${MODULE_ID}.${FLAG}`]: { original, modes },
  });
}

/** PF1 11: the card HTML is stored, so rewrite its total, breakdown, and Apply buttons. */
async function rebuildCardContent(html, roll, message) {
  const template = document.createElement("template");
  template.innerHTML = html;
  const card = template.content.querySelector(".damage-card");
  if (!card) return html;
  const total = roll.total;
  const healing = message.system?.subject?.health === "healing" || card.classList.contains("heal");

  const heading = card.querySelector(".roll-total");
  if (heading) {
    const icon = heading.querySelector("i");
    heading.replaceChildren(...(icon ? [icon, " "] : []), String(total));
    heading.classList.add("cf-dmg-adjusted");
  }
  const tooltip = card.querySelector(".dice-tooltip");
  if (tooltip) {
    const holder = document.createElement("template");
    holder.innerHTML = await roll.getTooltip();
    const fresh = holder.content.firstElementChild;
    if (fresh) tooltip.replaceWith(fresh);
  }
  const sign = healing ? -1 : 1;
  const buttons = [...card.querySelectorAll('button[data-action="applyDamage"]')];
  if (buttons[0]) buttons[0].dataset.value = String(total * sign);
  if (buttons[1]) buttons[1].dataset.value = String(Math.floor(total / 2) * sign);
  return template.innerHTML;
}

/* -------------------------------------------- */
/*  Roll math                                   */
/* -------------------------------------------- */

function rollHasDice(rollData) {
  // Works on saved roll data and on Roll instances
  if (rollData instanceof Roll) return rollData.dice.some(isForcible);
  const seen = new Set();
  const walk = (node) => {
    if (!node || typeof node !== "object" || seen.has(node)) return false;
    seen.add(node);
    if (node.class === "Die" && Number(node.faces) > 0) return true;
    return Object.values(node).some(walk);
  };
  return walk(rollData);
}

function isForcible(term) {
  return term instanceof foundry.dice.terms.Die && Number(term.faces) > 0;
}

/**
 * @param {object} rollData - Serialized roll
 * @param {"min"|"max"} mode
 * @returns {object} Serialized roll with every die set to its minimum or maximum face
 */
function forcedRollData(rollData, mode) {
  const roll = Roll.fromData(foundry.utils.deepClone(rollData));
  for (const die of roll.dice) if (isForcible(die)) setDie(die, mode);
  recompute(roll);
  const data = JSON.parse(JSON.stringify(roll));
  data.formula = rollData.formula; // keep the formula text the card showed
  return data;
}

/**
 * @param {object} rollData - Serialized roll
 * @param {Record<number, "min"|"max">} modes - Mode per index of `roll.dice`
 * @returns {object} Serialized roll with the chosen dice forced
 */
function forcedDiceData(rollData, modes) {
  const roll = Roll.fromData(foundry.utils.deepClone(rollData));
  roll.dice.forEach((die, i) => {
    if (modes[i] && isForcible(die)) setDie(die, modes[i]);
  });
  recompute(roll);
  const data = JSON.parse(JSON.stringify(roll));
  data.formula = rollData.formula;
  return data;
}

function setDie(die, mode) {
  const value = mode === "max" ? Number(die.faces) : 1;
  for (const result of die.results) {
    if (result.count !== undefined) continue; // success-counting dice are left alone
    result.result = value;
  }
}

/** Recompute totals from the (changed) dice up, including nested and function terms. */
function recompute(roll) {
  const { FunctionTerm, ParentheticalTerm, PoolTerm } = foundry.dice.terms;
  for (const term of roll.terms) {
    if (term instanceof ParentheticalTerm && term.roll) {
      recompute(term.roll);
    } else if (term instanceof FunctionTerm && Array.isArray(term.rolls)) {
      if (!term.rolls.some((r) => r.dice?.length)) continue;
      for (const r of term.rolls) recompute(r);
      term.result = functionResult(term);
    } else if (term instanceof PoolTerm && Array.isArray(term.rolls)) {
      term.rolls.forEach((r, i) => {
        recompute(r);
        if (term.results?.[i]) term.results[i].result = r.total;
      });
    }
  }
  roll._total = roll._evaluateTotal();
}

function functionResult(term) {
  const rolls = term.rolls;
  // PF1 sizeRoll stores the rolled dice as its last roll
  if (term.fn === "sizeRoll") return rolls.at(-1)?.total ?? term.result;
  const fn = CONFIG.Dice.functions?.[term.fn] ?? Math[term.fn];
  if (typeof fn === "function") {
    const value = Number(fn(...rolls.map((r) => r.total)));
    if (Number.isFinite(value)) return value;
  }
  return rolls.at(-1)?.total ?? term.result;
}
