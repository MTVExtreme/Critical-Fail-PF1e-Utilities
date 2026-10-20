import { MODULE_ID } from "../../constants.mjs";
import { isMananiteEnabled } from "../../settings.mjs";
import { scaledMananiteFormula } from "./damage.mjs";
import { renderMananitePicker } from "./dialog.mjs";

const AMMO_TYPE = "mananite";
const ABILITIES = ["str", "dex", "con", "int", "wis", "cha"];

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

function gunKind(item) {
  return gunData(item)?.kind || item?.getFlag?.("critical-fail-shared", "mananite") || "";
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

function rejectShot(use, index, parts) {
  parts[0].base = "0";
  const attack = use.shared?.attacks?.[index];
  if (attack) attack.ammo = null;
}

function isSupercombine(action) {
  return action?.hasAttack === false || action?.actionType === "save" || action?.name === "Supercombine";
}

function stageRank(stage) {
  const match = String(stage ?? "").match(/(\d+)/);
  return match ? Number(match[1]) : 0;
}

function formulaPlus(base, extra) {
  if (!extra) return base || "";
  if (!base) return extra;
  return `(${base}) + (${extra})`;
}

function addAttackPenalty(attack, formula, flavor) {
  const value = flavor ? `${formula}[${flavor}]` : formula;
  if (Array.isArray(attack.bonuses)) {
    attack.bonuses.push({ formula, flavor, value });
    return;
  }
  attack.attackBonus = formulaPlus(attack.attackBonus, formula);
}

function copyAttack(attack, label, extraPenalty) {
  const bonuses = Array.isArray(attack.bonuses) ? attack.bonuses.map((bonus) => ({ ...bonus })) : null;
  const copy = {
    type: attack.type ?? null,
    label,
    abstract: !!attack.abstract,
    ammo: attack.ammo ? { ...attack.ammo } : null,
    chargeCost: attack.chargeCost ?? null,
    chatAttack: null,
    rollData: attack.rollData ? { ...attack.rollData } : undefined,
  };
  if (bonuses) {
    copy.bonuses = bonuses;
    Object.defineProperty(copy, "activeBonuses", {
      get() {
        return this.bonuses
          .filter((bonus) => bonus.value != null && bonus.value !== "")
          .map((bonus) => bonus.value);
      },
    });
  }
  else {
    copy.attackBonus = formulaPlus(attack.attackBonus, extraPenalty);
  }
  Object.defineProperty(copy, "hasAmmo", { get() { return !!this.ammo; } });
  if (bonuses && extraPenalty) addAttackPenalty(copy, extraPenalty, "Burst");
  return copy;
}

function expandBursts(attacks) {
  const expanded = [];
  for (const attack of attacks) {
    for (let round = 1; round <= 3; round += 1) {
      expanded.push(copyAttack(attack, `${attack.label} (round ${round})`, ""));
    }
  }
  return expanded;
}

function applySemiPenalty(use) {
  if (!use.shared?.fullAttack) return;
  const config = use.shared.config ?? use.shared.formData ?? use.formData ?? {};
  const rapid = (use.shared.attacks ?? []).some((attack) => attack.type === "rapidShot" || attack.type === "rapid-shot")
    || !!config.rapidShot
    || !!config["rapid-shot"];
  const penalty = rapid ? "-4" : "-2";
  for (const attack of use.shared.attacks ?? []) {
    addAttackPenalty(attack, penalty, "Semi-automatic");
  }
}

function keepSingleShot(use) {
  const attacks = use.shared?.attacks ?? [];
  const first = attacks.find((attack) => !["haste", "haste-attack", "rapidShot", "rapid-shot", "manyshot"].includes(attack.type)) ?? attacks[0];
  if (first) use.shared.attacks = [first];
}

function ensureCrystals(use) {
  const fallback = use.item?.getFlag?.(MODULE_ID, "loadedCrystal");
  if (!fallback) return;
  for (const attack of use.shared?.attacks ?? []) {
    if (!attack.ammo?.id) attack.ammo = { id: fallback };
  }
}

function stripDeadlyAim(use) {
  const labels = ["PF1.DeadlyAim", "PF1.PowerAttack"].map((key) => game.i18n.localize(key));
  if (Array.isArray(use.shared?.attackBonus)) {
    use.shared.attackBonus = use.shared.attackBonus.filter((part) => !labels.some((label) => String(part).includes(`[${label}]`)));
  }
  const rollData = use.shared?.rollData;
  if (rollData) {
    rollData.powerAttackBonus = 0;
    rollData.powerAttackPenalty = 0;
  }
  if (use.shared) use.shared.powerAttack = false;
}

function attachFiringMode(use) {
  const gun = gunData(use.item);
  if (!gun || use._cfMananiteFiring) return;
  const actionId = use.action?.id ?? use.action?._id;
  const profile = gun.actions?.[actionId];
  use._cfMananiteFiring = true;
  const original = use.generateChatAttacks.bind(use);
  use.generateChatAttacks = async function generateMananiteAttacks() {
    try {
      if (profile?.solo) keepSingleShot(this);
      if (profile?.semi && !this._cfSemiApplied) {
        applySemiPenalty(this);
        this._cfSemiApplied = true;
      }
      if (profile?.burst && !this._cfBurstExpanded) {
        this.shared.attacks = expandBursts(this.shared.attacks ?? []);
        this._cfBurstExpanded = true;
      }
      ensureCrystals(this);
      if (gunKind(this.item) === "caster-gun") stripDeadlyAim(this);
    } catch (error) {
      console.error(`${MODULE_ID} | Mananite firing`, error);
    }
    return original();
  };
}

function casterAbility(actor) {
  const books = actor?.system?.spells ?? {};
  let best = null;
  for (const book of Object.values(books)) {
    const key = book?.ability;
    if (!ABILITIES.includes(key)) continue;
    const mod = Number(actor.system?.abilities?.[key]?.mod);
    if (!Number.isFinite(mod)) continue;
    if (!best || mod > best.mod) best = { key, mod };
  }
  return best?.key ?? "";
}

function applyDamageAbility(action, rollData) {
  const kind = gunKind(action.item);
  if (!kind || !rollData) return;
  rollData.action ??= {};
  rollData.action.ability ??= {};
  if (kind === "shardcaster") {
    rollData.action.ability.damage = "";
    return;
  }
  if (kind !== "caster-gun") return;
  const ability = casterAbility(action.item?.actor);
  rollData.action.ability.damage = ability;
  if (ability) rollData.ablMult = 1;
}

function releaseAmmo(use) {
  for (const attack of use.shared?.attacks ?? []) attack.ammo = null;
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
    rejectShot(activeUse, index, parts);
    if (rollData.action?.ability) rollData.action.ability.damage = "";
    if (!isCritDamage) {
      activeUse._cfMananiteRejected.add(index);
      warnOnce(activeUse, key, message);
    }
  };

  if (!crystal || !charge) {
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
  if (profile.automatic && stageRank(charge.stage) < 3) {
    reject(
      "automatic",
      game.i18n.format("CFUTIL.Mananite.AutomaticStage", { stage: charge.stage || "Unrefined" })
    );
    releaseAmmo(activeUse);
    return;
  }

  parts[0].base = scaledMananiteFormula(parts[0].base, { ...profile, sides: charge.sides });
  applyDamageAbility(action, rollData);
  if (isSupercombine(action)) {
    releaseAmmo(activeUse);
    return;
  }
  if (isCritDamage) return;

  const draw = Number(profile.draw) || 0;
  if (draw <= 0) return;
  activeUse._cfChargeSpend ??= [];
  const spent = activeUse._cfChargeSpend
    .filter((entry) => entry.crystalId === crystal.id)
    .reduce((total, entry) => total + entry.draw, 0);
  if (chargesOf(crystal) < spent + draw) {
    reject(`charges:${crystal.id}`, game.i18n.format("CFUTIL.Mananite.NotEnough", { name: crystal.name }));
    return;
  }
  activeUse._cfChargeSpend.push({ crystalId: crystal.id, draw });
}

async function spendCrystalCharges(use) {
  const entries = use._cfChargeSpend ?? [];
  if (!entries.length) return;
  const totals = new Map();
  for (const entry of entries) totals.set(entry.crystalId, (totals.get(entry.crystalId) ?? 0) + entry.draw);
  for (const [crystalId, draw] of totals) {
    const crystal = use.actor?.items?.get(crystalId);
    if (!crystal) continue;
    const remaining = Math.max(0, chargesOf(crystal) - draw);
    await crystal.update({ "system.uses.value": remaining });
    ui.notifications.info(game.i18n.format("CFUTIL.Mananite.Spent", {
      draw,
      name: crystal.name,
      remaining
    }));
  }
}

export function registerMananiteHooks() {
  Hooks.on("pf1CreateActionUse", (use) => {
    if (!gunData(use.item)) return;
    activeUse = use;
    attachFiringMode(use);
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
    releaseAmmo(use);
    activeUse = null;
    spendCrystalCharges(use).catch((error) => console.error(`${MODULE_ID} | Mananite charges`, error));
  });

  const paintAmmo = (app, html) => {
    try {
      renderMananitePicker(app, html);
    } catch (error) {
      console.error(`${MODULE_ID} | Mananite ammo list`, error);
    }
  };
  Hooks.on("renderActionDialog", paintAmmo);
  Hooks.on("renderAttackDialog", paintAmmo);
}
