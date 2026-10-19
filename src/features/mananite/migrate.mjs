import { MODULE_ID } from "../../constants.mjs";

const SIZES = {
  Fine: { capacity: 2, weight: 0.25 },
  Diminutive: { capacity: 4, weight: 0.5 },
  Tiny: { capacity: 8, weight: 1 },
  Small: { capacity: 16, weight: 2 },
  Medium: { capacity: 32, weight: 4 },
  Large: { capacity: 64, weight: 8 },
  Huge: { capacity: 128, weight: 16 },
  Gargantuan: { capacity: 256, weight: 32 },
  Colossal: { capacity: 512, weight: 64 }
};
const QUALITIES = {
  Cracked: { efficiency: 0.75, priceMult: 0.5 },
  Flawed: { efficiency: 0.875, priceMult: 0.75 },
  Pristine: { efficiency: 1, priceMult: 1 },
  Marvelous: { efficiency: 1.25, priceMult: 2 },
  Flawless: { efficiency: 1.5, priceMult: 4 },
  Exceptional: { efficiency: 2, priceMult: 8 },
  Perfect: { efficiency: 3, priceMult: 20 }
};
const STAGES = {
  Unrefined: { mult: 1, cost: 10 },
  "Stage 1": { mult: 2, cost: 8 },
  "Stage 2": { mult: 3, cost: 6 },
  "Stage 3": { mult: 4, cost: 4 },
  "Stage 4": { mult: 5, cost: 2 },
  "Stage 5": { mult: 6, cost: 1 },
  "Stage 6": { mult: 8, cost: 0.5 }
};

function round2(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function crystalEconomics(charge) {
  const size = SIZES[charge?.size];
  const quality = QUALITIES[charge?.quality];
  const stage = STAGES[charge?.stage];
  if (!size || !quality || !stage) return null;
  return {
    capacity: round2(size.capacity * stage.mult * quality.efficiency),
    value: round2(size.capacity * stage.mult * stage.cost * quality.priceMult),
    weight: size.weight
  };
}

/** Charges left on a crystal that still uses quantity, or the ammo clamp, as its pool. */
export function chargePool(item, capacity) {
  const uses = item.system?.uses ?? {};
  const quantity = Number(item.system?.quantity);
  const stored = Number(uses.value);
  const formula = Number(uses.maxFormula);
  if (uses.per === "charges") {
    if (item.system?.subType === "ammo" && stored === 1 && !(quantity > 1) && formula > 1) return Math.min(capacity, formula);
    if (Number.isFinite(stored) && stored >= 0) return Math.min(capacity, stored);
  }
  if (Number.isFinite(quantity) && quantity > 0) return Math.min(capacity, quantity);
  return capacity;
}

function crystalCharge(item) {
  return item?.getFlag?.(MODULE_ID, "mananiteCharge") ?? null;
}

function onChargeModel(item) {
  return item.system?.subType !== "ammo"
    && item.system?.uses?.per === "charges"
    && Number(item.system?.uses?.maxFormula) > 0;
}

async function migrateCrystal(item) {
  const charge = crystalCharge(item);
  if (!charge || onChargeModel(item)) return;
  const stats = crystalEconomics(charge);
  if (!stats) return;
  const remaining = chargePool(item, stats.capacity);
  let description = item.system?.description?.value ?? "";
  description = description
    .replace("The item quantity is the remaining charges.", `Charges: ${stats.capacity}. Quantity stays 1; firing spends charges.`)
    .replace(
      "Its quantity is the charge pool, and a shot spends the gun's draw from that quantity.",
      "A shot spends the gun's draw from these charges. The crystal is not consumed."
    );
  await item.update({
    "system.quantity": 1,
    "system.price": stats.value,
    "system.weight.value": stats.weight,
    "system.subType": "gear",
    "system.uses.per": "charges",
    "system.uses.value": remaining,
    "system.uses.maxFormula": String(stats.capacity),
    "system.uses.autoDeductChargesCost": "1",
    "system.description.value": description
  });
}

async function migrateGun(item) {
  const gun = item.getFlag(MODULE_ID, "mananiteGun");
  if (!gun) return;
  const kind = gun.kind || item.getFlag("critical-fail-shared", "mananite") || "caster-gun";
  const source = item.toObject().system.actions ?? [];
  let actionsChanged = false;
  const actions = source.map((action) => {
    const type = action.ammo?.type ?? "";
    const cost = Number(action.ammo?.cost) || 0;
    if (!type && cost <= 0) return action;
    actionsChanged = true;
    return { ...action, ammo: { type: "", cost: 0 } };
  });
  const update = {};
  if (item.system?.showInCombat !== true) update["system.showInCombat"] = true;
  if (item.system?.ammo?.type) update["system.ammo.type"] = "";
  if (actionsChanged) update["system.actions"] = actions;
  if (Object.keys(update).length) await item.update(update);
  if (gun.kind !== kind) await item.setFlag(MODULE_ID, "mananiteGun", { ...gun, kind });
}

export async function migrateMananite() {
  const items = [
    ...(game.items ?? []),
    ...[...(game.actors ?? [])].flatMap((actor) => [...actor.items])
  ];
  for (const item of items) {
    if (!item.isOwner) continue;
    try {
      if (crystalCharge(item)) await migrateCrystal(item);
      else if (item.getFlag(MODULE_ID, "mananiteGun")) await migrateGun(item);
    } catch (error) {
      console.error(`${MODULE_ID} | Mananite migration`, item.name, error);
    }
  }
}
