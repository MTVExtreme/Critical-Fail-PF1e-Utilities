import { MODULE_ID } from "../../constants.mjs";
import { isMananiteEnabled } from "../../settings.mjs";
import { scaledMananiteFormula } from "./damage.mjs";

const AMMO_TYPE = "mananite";

/** The action use currently being resolved on this client. */
let activeUse = null;

export function registerMananiteAmmo() {
  const types = CONFIG.PF1?.ammoTypes;
  if (!types || types[AMMO_TYPE]) return;
  types[AMMO_TYPE] = "CFUTIL.Ammo.Mananite";
}

function gunData(item) {
  return item?.getFlag?.(MODULE_ID, "mananiteGun") ?? null;
}

function crystalData(item) {
  return item?.getFlag?.(MODULE_ID, "mananiteCharge") ?? null;
}

function chargesOf(item) {
  const value = Number(item?.system?.uses?.value);
  return Number.isFinite(value) ? value : 0;
}

function warnOnce(use, key, message) {
  use._cfMananiteWarnings ??= new Set();
  if (use._cfMananiteWarnings.has(key)) return;
  use._cfMananiteWarnings.add(key);
  ui.notifications.warn(message);
}

function loadedCrystal(use, attackIndex) {
  const attack = use.shared?.attacks?.[attackIndex];
  const ammoId = attack?.ammo?.id ?? use.item?.system?.ammo?.default;
  if (!ammoId) return null;
  return use.actor?.items?.get(ammoId) ?? use.item?.actor?.items?.get(ammoId) ?? null;
}

function applyLoadedCrystal(action, rollData, parts) {
  if (!isMananiteEnabled() || !activeUse || activeUse.item !== action.item) return;
  const gun = gunData(action.item);
  const actionId = action.id ?? action._id;
  const profile = gun?.actions?.[actionId];
  if (!gun || !profile || !parts?.length) return;

  const index = Number(rollData?.attackCount ?? 0);
  const crystal = loadedCrystal(activeUse, index);
  const charge = crystalData(crystal);
  const isCritDamage = Number(rollData?.critMult) > 1;
  activeUse._cfMananiteRejected ??= new Set();
  if (isCritDamage && activeUse._cfMananiteRejected.has(index)) {
    parts[0].base = "0";
    return;
  }

  const reject = (key, message) => {
    parts[0].base = "0";
    if (!isCritDamage) {
      activeUse._cfMananiteRejected.add(index);
      warnOnce(activeUse, key, message);
    }
  };

  if (!crystal || crystal.system?.extraType !== AMMO_TYPE || !charge) {
    reject("missing", game.i18n.localize("CFUTIL.Mananite.LoadCrystal"));
    return;
  }
  if (charge.size !== gun.coreSize) {
    reject(
      `size:${crystal.id}`,
      game.i18n.format("CFUTIL.Mananite.WrongSize", { crystal: charge.size, gun: gun.coreSize })
    );
    return;
  }

  parts[0].base = scaledMananiteFormula(parts[0].base, { ...profile, sides: charge.sides });
  if (isCritDamage) return;

  const draw = Number(profile.draw) || 0;
  activeUse._cfMananiteSpend ??= [];
  const spent = activeUse._cfMananiteSpend
    .filter((entry) => entry.crystalId === crystal.id)
    .reduce((total, entry) => total + entry.draw, 0);
  if (chargesOf(crystal) < spent + draw) {
    parts[0].base = "0";
    activeUse._cfMananiteRejected.add(index);
    warnOnce(activeUse, `charges:${crystal.id}`, game.i18n.format("CFUTIL.Mananite.NotEnough", { name: crystal.name }));
    return;
  }
  activeUse._cfMananiteSpend.push({ crystalId: crystal.id, draw });
}

async function spendCommittedCharges(use) {
  const entries = use._cfMananiteSpend ?? [];
  if (!entries.length) return;
  const totals = new Map();
  for (const entry of entries) totals.set(entry.crystalId, (totals.get(entry.crystalId) ?? 0) + entry.draw);
  for (const [crystalId, draw] of totals) {
    const crystal = use.actor?.items?.get(crystalId);
    if (!crystal || draw <= 0) continue;
    const remaining = Math.max(0, chargesOf(crystal) - draw);
    await crystal.update({ "system.uses.value": remaining });
    ui.notifications.info(game.i18n.format("CFUTIL.Mananite.Spent", {
      draw,
      name: crystal.name,
      remaining
    }));
  }
}

function labelMananiteAmmo(app, html) {
  const root = html instanceof HTMLElement ? html : html?.[0];
  const actor = app?.actionUse?.actor ?? app?.actionUse?.item?.actor;
  if (!root || !actor) return;
  for (const row of root.querySelectorAll(".ammo-item[data-id]")) {
    const item = actor.items.get(row.dataset.id);
    const charge = crystalData(item);
    if (!charge) continue;
    const label = row.querySelector("span");
    if (!label) continue;
    label.textContent = game.i18n.format("CFUTIL.Mananite.AmmoLabel", {
      name: item.name,
      charges: chargesOf(item)
    });
  }
}

export function registerMananiteHooks() {
  Hooks.on("pf1CreateActionUse", (use) => {
    if (!gunData(use.item)) return;
    activeUse = use;
  });

  Hooks.on("pf1PreDamageRoll", (action, rollData, parts) => {
    try {
      applyLoadedCrystal(action, rollData, parts);
    } catch (error) {
      console.error(`${MODULE_ID} | Mananite damage`, error);
    }
  });

  Hooks.on("pf1PreActionUse", (use) => {
    if (use !== activeUse) return;
    activeUse = null;
    if (!isMananiteEnabled()) return;
    spendCommittedCharges(use).catch((error) => console.error(`${MODULE_ID} | Mananite charges`, error));
  });

  Hooks.on("renderAttackDialog", (app, html) => {
    try {
      labelMananiteAmmo(app, html);
    } catch (error) {
      console.error(`${MODULE_ID} | Mananite ammo list`, error);
    }
  });
}
