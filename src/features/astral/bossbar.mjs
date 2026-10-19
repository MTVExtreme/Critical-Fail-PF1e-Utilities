import { isAstralEnabled } from "../../settings.mjs";
import { getShield, isSuppressed } from "./state.mjs";

function rootOf(html) {
  if (!html) return document.querySelector("#boss-bar");
  if (html instanceof HTMLElement) return html;
  return html[0] || document.querySelector("#boss-bar");
}

function paintItem(item) {
  item.querySelector(":scope > .cf-astral-shield, .boss-bar-container > .cf-astral-shield")?.remove();
  const uuid = item.dataset.uuid;
  const actor = uuid ? fromUuidSync(uuid) : null;
  const resolved = actor?.actor || actor;
  const shield = getShield(resolved);
  const container = item.querySelector(".boss-bar-container");
  if (!shield || !container) return;

  const suppressed = isSuppressed(shield);
  const collapsed = shield.value <= 0;
  const percent = shield.max > 0 ? Math.max(0, Math.min(100, (shield.value / shield.max) * 100)) : 0;
  const overlay = document.createElement("div");
  overlay.className = "cf-astral-shield";
  if (suppressed) overlay.classList.add("suppressed");
  else if (collapsed) overlay.classList.add("collapsed");
  overlay.style.setProperty("--shield-percent", `${percent}%`);

  const field = document.createElement("div");
  field.className = "cf-astral-field";
  overlay.append(field);
  if (game.user.isGM) {
    const label = document.createElement("div");
    label.className = "cf-astral-readout";
    const state = suppressed ? "Field down" : collapsed ? "Collapsed" : "Shield";
    label.textContent = `${state} ${Math.round(shield.value).toLocaleString()} / ${Math.round(shield.max).toLocaleString()}`;
    overlay.append(label);
  }
  container.append(overlay);
}

export function paintBossBar(html) {
  if (!isAstralEnabled()) return;
  const root = rootOf(html);
  if (!root) return;
  for (const item of root.querySelectorAll(".bar-list-item")) paintItem(item);
}

export function registerBossBar() {
  const paint = (app, html) => {
    try {
      paintBossBar(html);
    } catch (error) {
      console.error("critical-fail-pf1e-utilities | Astral shield bar", error);
    }
  };
  Hooks.on("renderBossBar", paint);
  Hooks.on("updateActor", () => requestAnimationFrame(() => paintBossBar()));
  Hooks.on("ready", () => paintBossBar());
}
