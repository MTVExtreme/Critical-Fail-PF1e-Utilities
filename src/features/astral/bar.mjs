import { MODULE_ID } from "../../constants.mjs";
import { getBurn } from "./burn.mjs";
import { getShield } from "./state.mjs";

function barHeight(token) {
  let height = Math.max((canvas.dimensions?.size || 100) / 12, 8);
  if ((token.document?.height || 1) >= 2) height *= 1.6;
  return height;
}

export function registerTokenBars() {
  const prototype = CONFIG.Token.objectClass?.prototype;
  if (!prototype?._drawBar || prototype._drawBar.cfPools) return;
  const original = prototype._drawBar;
  function _drawBar(index, graphics, data) {
    const drawn = original.call(this, index, graphics, data);
    if (data?.attribute === "attributes.hp") paintPools(this, graphics);
    return drawn;
  }
  _drawBar.cfPools = true;
  prototype._drawBar = _drawBar;
}

function paintPools(token, graphics) {
  const actor = token.actor;
  if (!actor || !graphics?.beginFill) return;
  const width = token.w || token.document?.width * (canvas.dimensions?.size || 100) || 0;
  if (!width) return;
  const height = barHeight(token);
  const hp = actor.system?.attributes?.hp || {};
  const max = Math.max(1, Number(hp.max) || 1);

  const shield = getShield(actor);
  if (shield?.max > 0 && shield.value > 0) {
    const portion = Math.clamp(shield.value / shield.max, 0, 1) * width;
    graphics.beginFill(0x3aa0e6, 0.95).lineStyle(1, 0x082033, 0.9).drawRoundedRect(0, 0, portion, height / 2, 2);
  }

  const burn = Number(getBurn(actor).value) || 0;
  if (burn > 0) {
    const nonlethal = Math.max(0, Number(hp.nonlethal) || 0);
    const start = Math.clamp(nonlethal / max, 0, 1) * width;
    const burnWidth = Math.clamp(burn / max, 0, 1) * width;
    const room = Math.max(0, width - start);
    graphics.beginFill(0x9b4dff, 0.95).lineStyle(1, 0x2a1040, 0.9).drawRoundedRect(start, height / 2, Math.min(burnWidth, room), height / 2, 2);
  }
}

export function refreshTokenBars(actor) {
  for (const token of actor.getActiveTokens?.(true, true) || []) {
    const object = token.drawBars ? token : token.object;
    object?.drawBars?.();
  }
}
