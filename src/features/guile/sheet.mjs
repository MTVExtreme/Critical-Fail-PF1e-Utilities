import { GUILE_RANKS_PER_TALENT } from "../../constants.mjs";
import { isGuileTabEnabled } from "../../settings.mjs";
import { getOperativeModifier, getSkillSphereSummary, getSphereWikiUrl, isSpheresActive } from "./data.mjs";

const SECTION_CLASS = "cf-guile-section";

export function registerGuileSheetUI() {
  Hooks.on("renderActorSheetPF", injectGuileSection);
  Hooks.on("renderActorSheet", (app, html) => {
    if (!isPf1ActorSheet(app)) return;
    injectGuileSection(app, html);
  });
}

function isPf1ActorSheet(app) {
  return Boolean(
    app?.actor &&
      (app.options?.classes?.includes?.("pf1") ||
        app.constructor?.name?.startsWith?.("ActorSheetPF") ||
        app.template?.includes?.("systems/pf1")),
  );
}

/**
 * Adds a "Spheres of Guile" block to the pf1spheres Spheres tab listing every skill sphere
 * the actor has talents in, with talent counts, granted skill ranks, and the talents themselves.
 * @param {ActorSheet} app
 * @param {JQuery|HTMLElement} html
 */
function injectGuileSection(app, html) {
  if (!isGuileTabEnabled() || !isSpheresActive()) return;
  const root = toElement(html);
  const spheresTab = root?.querySelector(".tab.spheres");
  if (!spheresTab || spheresTab.querySelector(`.${SECTION_CLASS}`)) return;

  const actor = app.actor;
  const summary = getSkillSphereSummary(actor);
  if (!summary.length) return;

  app.cfGuileTab ??= { expanded: {} };

  const section = document.createElement("div");
  section.className = `${SECTION_CLASS} critical-fail-pf1e-utilities`;
  section.innerHTML = `
    ${renderHeader(actor)}
    <ol class="spheres-list cf-guile-spheres">
      ${summary.map((data) => renderSphere(app, data)).join("")}
    </ol>
  `;

  const anchor = spheresTab.querySelector("ol.spheres-list");
  if (anchor) anchor.after(section);
  else spheresTab.append(section);

  activateListeners(app, section, summary);
}

/**
 * @param {Actor} actor
 * @returns {string}
 */
function renderHeader(actor) {
  const oam = getOperativeModifier(actor);
  const modifier =
    oam == null
      ? ""
      : `<span class="cf-guile-oam" data-tooltip="${esc(game.i18n.localize("CFUTIL.Guile.OperativeModHint"))}">
          ${esc(game.i18n.localize("CFUTIL.Guile.OperativeMod"))} ${esc(signed(oam))}
        </span>`;
  return `
    <div class="cf-guile-header-row">
      <span class="block-header cf-guile-header flexrow">${esc(game.i18n.localize("CFUTIL.Guile.Header"))}</span>
      ${modifier}
    </div>
  `;
}

/**
 * Mirrors the pf1spheres `li.sphere` markup so its stylesheet applies.
 * @param {ActorSheet} app
 * @param {ReturnType<typeof getSkillSphereSummary>[number]} data
 * @returns {string}
 */
function renderSphere(app, data) {
  const expanded = app.cfGuileTab.expanded[data.sphere] === true;
  const counts = data.counts;
  const countTooltip = `@spheres.talents.${data.sphere}.total: ${counts.total} <br> @spheres.talents.${data.sphere}.excluded: ${counts.excluded}`;
  const excluded = counts.excluded ? ` (${counts.excluded})` : "";

  const ranksTooltip = [
    game.i18n.format("CFUTIL.Guile.RanksGranted", { ranks: data.ranks.granted }),
    data.ranks.expected == null
      ? game.i18n.localize("CFUTIL.Guile.RanksNoBase")
      : game.i18n.format("CFUTIL.Guile.RanksExpected", {
          ranks: data.ranks.expected,
          perTalent: GUILE_RANKS_PER_TALENT,
        }),
  ].join(" <br> ");

  const talents = data.talents.map((item) => renderTalent(item)).join("");

  return `
    <li class="sphere grid cf-guile-sphere" data-sphere="${esc(data.sphere)}">
      <img class="sphere-icon" alt="${esc(data.label)}" src="${esc(data.icon)}" />
      <div class="block-header sphere-label flexrow" data-tooltip="${esc(game.i18n.localize("CFUTIL.Guile.OpenSphere"))}">${esc(data.label)}</div>
      <div class="sphere-info">
        <span data-tooltip="${esc(countTooltip)}">
          <b>${esc(game.i18n.localize("CFUTIL.Guile.Talents"))}</b>: ${counts.total}${excluded}
        </span>
      </div>
      <span class="sphere-level-label">${esc(game.i18n.localize("CFUTIL.Guile.Ranks"))}</span>
      <div class="sphere-level-value cf-guile-ranks" data-tooltip="${esc(ranksTooltip)}">${data.ranks.granted}</div>
      <div class="block-header expand-sphere flexrow">
        ${esc(game.i18n.localize("CFUTIL.Guile.Talents"))}
        <i class="fas fa-angle-double-down ${expanded ? "rotate-arrow" : ""}"></i>
      </div>
      <ol class="item-list sphere-talents" style="display: ${expanded ? "grid" : "none"}">
        ${talents}
      </ol>
    </li>
  `;
}

/**
 * @param {Item} item
 * @returns {string}
 */
function renderTalent(item) {
  const tags = (item.system?.tags ?? []).map((tag) => `<span class="talent-tag">${esc(tag)}</span>`).join("");
  const hasAction = item.hasAction ?? (item.system?.actions?.length ?? 0) > 0;
  const use = hasAction
    ? `<a class="item-control item-action action roll" data-tooltip="PF1.UseFeat"><i class="fas fa-dice-d20"></i></a>`
    : "";
  const disabled = item.system?.disabled ? " cf-guile-disabled" : "";
  return `
    <li class="talent grid item${disabled}" data-item-id="${esc(item.id)}">
      <div class="talent-icon" data-tooltip="${esc(game.i18n.localize("CFUTIL.Guile.ShowCard"))}">
        <img src="${esc(item.img)}" alt="${esc(item.name)}" />
        <i class="fas fa-comment"></i>
      </div>
      <div class="talent-name" data-tooltip="${esc(game.i18n.localize("CFUTIL.Guile.OpenTalent"))}">
        <b>${esc(item.name)}</b>
        ${tags}
      </div>
      <div class="talent-activation">${esc(activationLabel(item))}</div>
      <div class="talent-use">${use}</div>
    </li>
  `;
}

/**
 * @param {Item} item
 * @returns {string}
 */
function activationLabel(item) {
  try {
    return item.getLabels?.()?.activation ?? "";
  } catch (_err) {
    return "";
  }
}

/**
 * @param {ActorSheet} app
 * @param {HTMLElement} section
 * @param {ReturnType<typeof getSkillSphereSummary>} summary
 */
function activateListeners(app, section, summary) {
  const actor = app.actor;
  const bySphere = new Map(summary.map((data) => [data.sphere, data]));

  for (const toggle of section.querySelectorAll(".expand-sphere")) {
    toggle.addEventListener("click", (event) => {
      event.preventDefault();
      const li = toggle.closest(".sphere");
      const list = li?.querySelector(".sphere-talents");
      if (!li || !list) return;
      const open = list.style.display === "none";
      list.style.display = open ? "grid" : "none";
      toggle.querySelector("i")?.classList.toggle("rotate-arrow", open);
      app.cfGuileTab.expanded[li.dataset.sphere] = open;
    });
  }

  for (const label of section.querySelectorAll(".sphere-label")) {
    label.addEventListener("click", (event) => {
      event.preventDefault();
      const sphere = label.closest(".sphere")?.dataset.sphere;
      const data = bySphere.get(sphere);
      if (data?.base) return data.base.sheet.render(true, { focus: true });
      const url = getSphereWikiUrl(sphere);
      if (url) window.open(url, "_blank", "noopener");
    });
  }

  for (const name of section.querySelectorAll(".talent-name")) {
    const open = (event) => {
      event.preventDefault();
      getItem(actor, name)?.sheet.render(true, { focus: true });
    };
    name.addEventListener("click", open);
    name.addEventListener("contextmenu", open);
  }

  for (const icon of section.querySelectorAll(".talent-icon")) {
    icon.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      getItem(actor, icon)?.displayCard(undefined, { token: app.token });
    });
  }

  for (const use of section.querySelectorAll(".talent-use > a")) {
    use.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      getItem(actor, use)?.use({ ev: event, token: app.token });
    });
  }
}

/**
 * @param {Actor} actor
 * @param {HTMLElement} element
 * @returns {Item|undefined}
 */
function getItem(actor, element) {
  const id = element.closest(".item[data-item-id]")?.dataset.itemId;
  return id ? actor.items.get(id) : undefined;
}

/**
 * @param {number} value
 * @returns {string}
 */
function signed(value) {
  const n = Number(value) || 0;
  return n >= 0 ? `+${n}` : `${n}`;
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function esc(value) {
  return foundry.utils.escapeHTML(String(value ?? ""));
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
