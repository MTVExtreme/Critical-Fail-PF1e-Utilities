import { openRollStats } from "./app.mjs";

const BUTTON_CLASS = "cf-roll-stats-button";

/** Adds the Roll Stats button to the Actors sidebar footer for GMs. */
export function registerDirectoryButton() {
  Hooks.on("renderActorDirectory", (app, html) => injectButton(html));
}

/** The sidebar renders before `ready`; add the button to an already rendered directory. */
export function injectExistingDirectoryButton() {
  const element = ui.actors?.element;
  if (element) injectButton(element);
}

/**
 * @param {JQuery|HTMLElement} html
 */
function injectButton(html) {
  if (!game.user?.isGM) return;
  const root = toElement(html);
  if (!root || root.querySelector(`.${BUTTON_CLASS}`)) return;

  const footer = root.querySelector("footer.directory-footer") ?? root.querySelector(".directory-footer");
  const button = document.createElement("button");
  button.type = "button";
  button.className = `${BUTTON_CLASS} critical-fail-pf1e-utilities`;
  button.dataset.tooltip = game.i18n.localize("CFUTIL.RollStats.ButtonHint");
  button.innerHTML = `<i class="fa-solid fa-chart-column" inert></i><span>${game.i18n.localize("CFUTIL.RollStats.Button")}</span>`;
  button.addEventListener("click", (event) => {
    event.preventDefault();
    openRollStats();
  });

  if (footer) footer.append(button);
  else root.append(button);
}

/**
 * @param {JQuery|HTMLElement|HTMLElement[]} html
 * @returns {HTMLElement|null}
 */
function toElement(html) {
  if (!html) return null;
  if (html instanceof HTMLElement) return html;
  if (Array.isArray(html)) return html[0] ?? null;
  if (html[0] instanceof HTMLElement) return html[0];
  if (typeof html.get === "function") return html.get(0) ?? null;
  return null;
}
