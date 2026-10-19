import { MODULE_ID } from "../../constants.mjs";

const HEALTH_MONITOR = "koboldworks-pf1-health-monitor";
const priorShield = new WeakMap();
const priorBurn = new WeakMap();

export function rememberPools(actor) {
  priorShield.set(actor, actor.getFlag?.(MODULE_ID, "energyShield")?.value ?? null);
  priorBurn.set(actor, Number(actor.getFlag?.(MODULE_ID, "burn")?.value) || 0);
}

function signed(value) {
  return new Intl.NumberFormat(undefined, { signDisplay: "always" }).format(value);
}

function scrollPool(actor, delta, { heal, label, fill, stroke }) {
  if (!delta) return;
  const tokens = actor.getActiveTokens?.(true, true) || [];
  for (const token of tokens) {
    const center = token.center || token.object?.center;
    if (!center || !canvas?.interface?.createScrollingText) continue;
    canvas.interface.createScrollingText(center, `${signed(delta)} ${label}`, {
      anchor: CONST.TEXT_ANCHOR_POINTS.CENTER,
      direction: heal ? CONST.TEXT_ANCHOR_POINTS.TOP : CONST.TEXT_ANCHOR_POINTS.BOTTOM,
      fontSize: Math.max((canvas.grid?.size || 100) / 3, 24),
      fill,
      stroke,
      strokeThickness: 3,
      jitter: 0.5,
    });
  }
}

function scrollShield(actor, delta) {
  const heal = delta > 0;
  scrollPool(actor, delta, {
    heal,
    label: "Shield",
    fill: heal ? "#9adfff" : "#14366b",
    stroke: heal ? "#06324d" : "#d7ecff",
  });
}

function scrollBurn(actor, delta) {
  const heal = delta < 0;
  scrollPool(actor, delta, {
    heal,
    label: "Burn",
    fill: heal ? "#e4b6ff" : "#4a1468",
    stroke: heal ? "#3b1058" : "#f3dcff",
  });
}

function logPool(actor, delta, { heal, label, kind, word }) {
  if (!game.modules.get(HEALTH_MONITOR)?.active || !delta) return;
  const prelude = game.i18n.localize("Koboldworks.HealthMonitor.Card.Prelude");
  const change = game.i18n.localize(word || (heal
    ? "Koboldworks.HealthMonitor.Card.Gain"
    : "Koboldworks.HealthMonitor.Card.Lose"));
  ChatMessage.create({
    content: `<div class="koboldworks health-monitor"><span class="prelude">${prelude}</span> <span class="label">${change}</span> <span class="value">${Math.abs(delta)}</span> <span label="target">${label}</span></div>`,
    speaker: ChatMessage.getSpeaker({ actor }),
    flags: {
      [HEALTH_MONITOR]: { heal, target: kind, value: delta },
      [MODULE_ID]: { [`${kind}Feedback`]: true },
    },
  });
}

function logShield(actor, delta) {
  logPool(actor, delta, { heal: delta > 0, label: game.i18n.localize("CFUTIL.Shield.Label"), kind: "shield" });
}

function logBurn(actor, delta) {
  const removed = delta < 0;
  logPool(actor, delta, {
    heal: removed,
    word: removed ? "Koboldworks.HealthMonitor.Card.Lose" : "Koboldworks.HealthMonitor.Card.Gain",
    label: game.i18n.localize("CFUTIL.Burn.Label"),
    kind: "burn",
  });
}

export function announceShieldChange(actor, _data, _options, userId) {
  const beforeShield = priorShield.get(actor);
  const beforeBurn = priorBurn.get(actor);
  priorShield.delete(actor);
  priorBurn.delete(actor);
  if (game.user.id !== userId) return;
  const afterShield = actor.getFlag?.(MODULE_ID, "energyShield")?.value;
  if (beforeShield != null && afterShield != null && beforeShield !== afterShield) {
    const delta = afterShield - beforeShield;
    scrollShield(actor, delta);
    logShield(actor, delta);
    game.socket?.emit(`module.${MODULE_ID}`, { type: "shield", uuid: actor.uuid, delta });
  }
  const afterBurn = Number(actor.getFlag?.(MODULE_ID, "burn")?.value) || 0;
  if (beforeBurn != null && beforeBurn !== afterBurn) {
    const delta = afterBurn - beforeBurn;
    scrollBurn(actor, delta);
    logBurn(actor, delta);
    game.socket?.emit(`module.${MODULE_ID}`, { type: "burn", uuid: actor.uuid, delta });
  }
}

export function registerShieldSocket() {
  game.socket?.on(`module.${MODULE_ID}`, (payload) => {
    if (payload?.type !== "shield" && payload?.type !== "burn") return;
    const doc = fromUuidSync(payload.uuid);
    const actor = doc?.actor || doc;
    if (!actor) return;
    if (payload.type === "shield") scrollShield(actor, Number(payload.delta) || 0);
    if (payload.type === "burn") scrollBurn(actor, Number(payload.delta) || 0);
  });
}

export function paintShieldFeedback(message, html) {
  const shield = message?.getFlag?.(MODULE_ID, "shieldFeedback");
  const burn = message?.getFlag?.(MODULE_ID, "burnFeedback");
  if (!shield && !burn) return;
  const root = html instanceof HTMLElement ? html : html?.[0];
  const card = root?.closest?.(".chat-message") || root;
  if (shield) card?.classList.add("cf-shield-feedback");
  if (burn) card?.classList.add("cf-burn-feedback");
}
