import { MODULE_ID } from "../../constants.mjs";

function gunData(item) {
  return item?.getFlag?.(MODULE_ID, "mananiteGun") ?? null;
}

function gunKind(item) {
  return gunData(item)?.kind || item?.getFlag?.("critical-fail-shared", "mananite") || "";
}

function crystalCharge(item) {
  return item?.getFlag?.(MODULE_ID, "mananiteCharge") ?? null;
}

function chargesOf(item) {
  const uses = item?.system?.uses;
  if (uses?.per === "charges") {
    const value = Number(uses.value);
    return Number.isFinite(value) ? value : 0;
  }
  const quantity = Number(item?.system?.quantity);
  return Number.isFinite(quantity) ? quantity : 0;
}

function crystalsOf(actor, coreSize) {
  return [...(actor?.items ?? [])]
    .filter((item) => crystalCharge(item)?.size === coreSize)
    .sort((a, b) => a.name.localeCompare(b.name));
}

function rootOf(html) {
  return html instanceof HTMLElement ? html : html?.[0];
}

function paintCurrent(select, crystal) {
  const img = select.querySelector(".cf-crystal-current img");
  const span = select.querySelector(".cf-crystal-current span");
  if (!span) return;
  if (!crystal) {
    img?.remove();
    span.textContent = game.i18n.localize("PF1.None");
    return;
  }
  let icon = img;
  if (!icon) {
    icon = document.createElement("img");
    span.before(icon);
  }
  icon.src = crystal.img;
  icon.alt = "";
  span.textContent = game.i18n.format("CFUTIL.Mananite.AmmoLabel", {
    name: crystal.name,
    charges: chargesOf(crystal)
  });
}

function chosenId(attacks, index, fallback) {
  return attacks?.[index]?.ammo?.id || fallback || "";
}

function assignCrystal(attacks, index, id) {
  const attack = attacks?.[index];
  if (!attack) return;
  attack.ammo = id ? { id } : null;
}

/**
 * Replaces PF1's quantity ammo menu with a charge menu that looks the same.
 * @param {Application} app
 * @param {HTMLElement|JQuery} html
 */
export function renderMananitePicker(app, html) {
  const root = rootOf(html);
  const use = app?.actionUse;
  const item = use?.item;
  const gun = gunData(item);
  if (!root || !gun) return;
  const dialog = root.closest(".attack-dialog") ?? root;
  dialog.classList.add("cf-mananite-ammo");
  if (gunKind(item) === "caster-gun") {
    for (const box of root.querySelectorAll('input[name="power-attack"]')) {
      box.checked = false;
      box.disabled = true;
    }
  }

  const header = root.querySelector(".attack-header");
  const rows = [...root.querySelectorAll(".attacks .attack")];
  if (!header || !rows.length || root.querySelector(".cf-crystal-select")) return;

  const heading = document.createElement("h3");
  heading.className = "ammo cf-crystal-header";
  heading.textContent = game.i18n.localize("PF1.AmmunitionAbbr");
  header.append(heading);

  const actor = use.actor ?? item.actor;
  const crystals = crystalsOf(actor, gun.coreSize);
  const attacks = use.shared?.attacks ?? [];
  const fallback = item.getFlag(MODULE_ID, "loadedCrystal") || "";
  const known = new Set(crystals.map((crystal) => crystal.id));

  rows.forEach((row) => {
    const index = Number(row.dataset.index);
    let selected = chosenId(attacks, index, "");
    if (selected && !known.has(selected)) {
      selected = "";
      assignCrystal(attacks, index, "");
    }
    if (!selected && known.has(fallback)) {
      selected = fallback;
      assignCrystal(attacks, index, selected);
    }
    row.append(buildSelect({ use, crystals, attacks, index, selected }));
  });
}

function buildSelect({ use, crystals, attacks, index, selected }) {
  const select = document.createElement("div");
  select.className = "ammo cf-crystal-select";
  const current = document.createElement("div");
  current.className = "flexrow cf-crystal-current";
  const span = document.createElement("span");
  current.append(span);
  const chevron = document.createElement("i");
  chevron.className = "fa-solid fa-chevron-down";
  current.append(chevron);
  const list = document.createElement("ul");
  list.className = "cf-crystal-list";

  const options = [{ id: "", name: game.i18n.localize("PF1.None"), img: "" }, ...crystals];
  for (const crystal of options) {
    const entry = document.createElement("li");
    entry.className = "cf-crystal-item";
    entry.dataset.id = crystal.id;
    if (crystal.id && crystal.id === selected) entry.classList.add("current");
    if (crystal.img) {
      const img = document.createElement("img");
      img.src = crystal.img;
      img.alt = "";
      entry.append(img);
    }
    const label = document.createElement("span");
    label.textContent = crystal.id
      ? game.i18n.format("CFUTIL.Mananite.AmmoLabel", { name: crystal.name, charges: chargesOf(crystal) })
      : crystal.name;
    entry.append(label);
    const controls = document.createElement("div");
    controls.className = "controls";
    controls.append(
      control("default", "PF1.Default", "fa-cog"),
      control("all", "PF1.ApplyToAll", "fa-plus")
    );
    entry.append(controls);
    list.append(entry);
  }

  select.append(current, list);
  paintCurrent(select, crystals.find((crystal) => crystal.id === selected) ?? null);

  current.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    const opening = !list.classList.contains("open");
    select.closest(".attack-dialog")?.querySelectorAll(".cf-crystal-list.open").forEach((open) => open.classList.remove("open"));
    list.classList.toggle("open", opening);
  });

  list.addEventListener("click", async (event) => {
    const control = event.target.closest("[data-action]");
    const entry = event.target.closest(".cf-crystal-item");
    if (!entry) return;
    event.preventDefault();
    event.stopPropagation();
    const id = entry.dataset.id || "";
    if (control?.dataset.action === "default") {
      await use.item.setFlag(MODULE_ID, "loadedCrystal", id);
      return;
    }
    if (control?.dataset.action === "all") {
      attacks.forEach((_, attackIndex) => assignCrystal(attacks, attackIndex, id));
      select.closest(".attacks")?.querySelectorAll(".cf-crystal-select").forEach((other) => {
        other.querySelectorAll(".cf-crystal-item").forEach((row) => row.classList.toggle("current", (row.dataset.id || "") === id));
        paintCurrent(other, crystals.find((crystal) => crystal.id === id) ?? null);
        other.querySelector(".cf-crystal-list")?.classList.remove("open");
      });
      return;
    }
    assignCrystal(attacks, index, id);
    list.querySelectorAll(".cf-crystal-item").forEach((row) => row.classList.toggle("current", row === entry));
    paintCurrent(select, crystals.find((crystal) => crystal.id === id) ?? null);
    list.classList.remove("open");
  });

  return select;
}

function control(action, tooltip, icon) {
  const link = document.createElement("a");
  link.dataset.action = action;
  link.dataset.tooltip = tooltip;
  const glyph = document.createElement("i");
  glyph.className = `fa-solid ${icon}`;
  link.append(glyph);
  return link;
}
