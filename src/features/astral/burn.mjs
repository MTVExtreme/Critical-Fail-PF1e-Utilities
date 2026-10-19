import { MODULE_ID } from "../../constants.mjs";

const FLAG = "burn";
const syncing = new WeakSet();

export function getBurn(actor) {
  const stored = actor?.getFlag?.(MODULE_ID, FLAG);
  return { shown: false, value: 0, ...stored };
}

export async function setBurnShown(actor, shown) {
  const current = getBurn(actor);
  await actor.update({ [`flags.${MODULE_ID}.${FLAG}`]: { ...current, shown: Boolean(shown) } });
}

/** Burn is its own pool of nonlethal hit points. It does not add into the Nonlethal box. */
export async function setBurnPoints(actor, value) {
  const current = getBurn(actor);
  const next = Math.max(0, Math.floor(Number(value) || 0));
  await actor.update({ [`flags.${MODULE_ID}.${FLAG}`]: { ...current, shown: true, value: next } });
}

export function registerBurnRest() {
  Hooks.on("pf1PreActorRest", (actor, options, updateData) => {
    if (!options?.restoreHealth) return;
    const burn = getBurn(actor);
    if (!burn.value) return;
    foundry.utils.setProperty(updateData, `flags.${MODULE_ID}.${FLAG}`, { ...burn, value: 0 });
  });
}

export async function syncBurnUnconscious(actor) {
  if (!actor || syncing.has(actor)) return;
  const hp = Number(actor.system?.attributes?.hp?.value) || 0;
  const nonlethal = Number(actor.system?.attributes?.hp?.nonlethal) || 0;
  const burn = Number(getBurn(actor).value) || 0;
  const down = nonlethal + burn > hp;
  const marked = Boolean(actor.getFlag(MODULE_ID, "burnUnconscious"));
  const has = Boolean(actor.statuses?.has?.("unconscious"));
  if (down === has && down === marked) return;
  if (!down && !marked) return;
  syncing.add(actor);
  try {
    if (down && !has) await actor.setCondition?.("unconscious", true);
    if (!down && has && marked) await actor.setCondition?.("unconscious", false);
    if (down && !marked) await actor.setFlag(MODULE_ID, "burnUnconscious", true);
    if (!down && marked) await actor.unsetFlag(MODULE_ID, "burnUnconscious");
  } finally {
    syncing.delete(actor);
  }
}
