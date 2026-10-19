/**
 * Pure Astral Energy Shield math. Foundry hooks live in hooks.mjs.
 * Energy resistance and immunity are already reflected in each part's `after`.
 * Damage reduction applies only to physical damage that gets past the shield.
 */

const PHYSICAL = new Set(["bludgeoning", "piercing", "slashing"]);

export function partTypes(part) {
  const raw = part?.types || part?.typeIds || [];
  const list = raw instanceof Set ? [...raw] : Array.isArray(raw) ? raw : [];
  return list.map((type) => String(type || "").toLowerCase()).filter(Boolean);
}

export function classifyParts(options) {
  const ratio = Number.isFinite(options?.ratio) ? options.ratio : 1;
  const instances = Array.isArray(options?.instances) ? options.instances : [];
  const parts = [];

  for (const inst of instances) {
    const types = partTypes(inst);
    const scaled = Math.max(0, Math.floor((Number(inst.value) || 0) * ratio));
    const after = Math.max(0, Math.floor(Number(inst.total ?? scaled)));
    const physical = inst.isPhysical === true || types.some((type) => PHYSICAL.has(type));
    const fire = types.includes("fire");
    const electric = types.includes("electricity") || types.includes("electric");
    const emp = types.includes("emp");

    if (emp) {
      parts.push({ kind: "emp", incoming: 0, after: 0, scaled });
      continue;
    }
    if (fire && !physical) {
      parts.push({ kind: "fire", incoming: 0, after: 0, scaled });
      continue;
    }
    if (electric && !physical) {
      parts.push({ kind: "electric", incoming: 0, after: 0, scaled });
      continue;
    }
    if (physical && !fire && !electric) {
      parts.push({
        kind: "physical",
        incoming: scaled,
        after,
        scaled,
        drApplies: scaled > after,
      });
      continue;
    }
    parts.push({ kind: "mitigated", incoming: after, after, scaled, drApplies: false });
  }

  if (!parts.length && Number(options?.value) > 0) {
    const raw = Math.max(0, Math.floor(Number(options.value) || 0));
    const reduction = Math.max(0, Math.floor(Number(options.reduction) || 0));
    const after = Math.max(0, raw - reduction);
    parts.push({
      kind: reduction > 0 ? "physical" : "mitigated",
      incoming: reduction > 0 ? raw : after,
      after,
      scaled: raw,
      drApplies: reduction > 0,
    });
  }

  return parts;
}

function emptyEffects() {
  return {
    fire: false,
    electric: 0,
    emp: false,
    haste: false,
    removeSlow: false,
    reflect: null,
    collapsed: false,
  };
}

/**
 * @returns {null | { body: number, shieldValue: number, rewrite: boolean, effects: object }}
 * `body` is the number passed to applyDamage (negative heals). `rewrite` replaces the
 * incoming value and clears the reduction that was already folded into this result.
 */
function peelTemp(parts, temp) {
  let left = Math.max(0, Math.floor(Number(temp) || 0));
  let taken = 0;
  for (const part of parts) {
    if (left <= 0) break;
    if (part.kind !== "physical" && part.kind !== "mitigated") continue;
    const use = Math.min(left, Math.max(0, part.incoming));
    part.incoming -= use;
    left -= use;
    taken += use;
  }
  return taken;
}

function resolveBasicShield({ shield, options, absorbing, tempFirst, temp }) {
  if (!shield?.enabled || !absorbing) return null;
  if (Number(options?.value) < 0) return null;
  const ratio = Number.isFinite(options?.ratio) ? options.ratio : 1;
  const raw = Math.max(0, Math.floor((Number(options?.value) || 0) * ratio));
  const reduction = Math.max(0, Math.floor(Number(options?.reduction) || 0));
  let incoming = Math.max(0, raw - reduction);
  let tempTaken = 0;
  if (tempFirst) {
    tempTaken = Math.min(Math.max(0, Math.floor(Number(temp) || 0)), incoming);
    incoming -= tempTaken;
  }
  if (incoming <= 0) return null;
  const shieldHp = Math.max(0, Number(shield.value) || 0);
  const take = Math.min(shieldHp, incoming);
  return {
    body: incoming - take,
    tempTaken,
    shieldValue: Math.max(0, Math.min(Number(shield.max) || 0, shieldHp - take)),
    rewrite: true,
    effects: emptyEffects(),
  };
}

export function resolveShieldDamage({ shield, options, hp, absorbing, spell, astral, tempFirst = false, temp = 0 }) {
  const useAstral = astral ?? Boolean(shield?.form || shield?.coreRemoved || Number(shield?.bodyRegen) || Number(shield?.regen) || Number(shield?.dr));
  if (!useAstral) return resolveBasicShield({ shield, options, absorbing, tempFirst, temp });
  if (!shield?.enabled) return null;
  if (Number(options?.value) < 0 && !(options?.instances || []).length) return null;

  const parts = classifyParts(options);
  const effects = emptyEffects();
  let electricWould = 0;

  for (const part of parts) {
    if (part.kind === "fire") {
      effects.fire = true;
      effects.haste = true;
      effects.removeSlow = true;
    } else if (part.kind === "electric") {
      electricWould += part.scaled;
      effects.haste = true;
    } else if (part.kind === "emp") {
      effects.emp = true;
      effects.haste = true;
      electricWould += 60;
    }
  }
  effects.electric = electricWould;

  const hostileSpell = !!(spell?.sr && !spell.fromSelf);
  const energyResponse = effects.fire || effects.electric > 0 || effects.emp;
  if (hostileSpell && !energyResponse) {
    const amount = parts.reduce((sum, part) => sum + (part.scaled || 0), 0) || Math.max(0, Math.floor(Number(options?.value) || 0));
    if (amount > 0) {
      effects.reflect = {
        amount,
        backlash: !!spell.area,
        name: spell.name || "Spell",
        casterUuid: spell.casterUuid || "",
        casterName: spell.casterName || "the caster",
      };
      return { body: 0, shieldValue: shield.value, rewrite: true, effects };
    }
  }

  const shieldActive = absorbing && !effects.emp && shield.value > 0;
  const hasSpecial = effects.fire || effects.electric > 0 || effects.emp;
  if (!shieldActive && !hasSpecial) return null;

  const tempTaken = tempFirst && shieldActive ? peelTemp(parts, temp) : 0;

  const maxHp = Math.max(0, Number(hp?.max) || 0);
  const currentHp = Math.max(0, Number(hp?.value) || 0);
  let shieldHp = Math.max(0, Number(shield.value) || 0);
  let body;

  if (shieldActive) {
    let physicalOverflow = 0;
    let otherOverflow = 0;
    let drUsed = false;
    for (const part of parts) {
      if (part.kind === "physical") {
        if (part.drApplies) drUsed = true;
        const take = Math.min(shieldHp, part.incoming);
        shieldHp -= take;
        physicalOverflow += part.incoming - take;
      } else if (part.kind === "mitigated") {
        const take = Math.min(shieldHp, part.incoming);
        shieldHp -= take;
        otherOverflow += part.incoming - take;
      }
    }
    const rating = Math.max(0, Number(shield.dr) || 0);
    const physicalBody = drUsed ? Math.max(0, physicalOverflow - rating) : physicalOverflow;
    body = physicalBody + otherOverflow;
  } else {
    body = parts.reduce((sum, part) => {
      if (part.kind === "physical" || part.kind === "mitigated") return sum + part.after;
      return sum;
    }, 0);
  }

  const heal = Math.floor(electricWould / 3);
  if (heal > 0) {
    const missing = Math.max(0, maxHp - currentHp);
    const missingAfter = missing + Math.max(0, body);
    const toBody = Math.min(missingAfter, heal);
    const toShield = shieldActive ? heal - toBody : 0;
    body -= toBody;
    if (toShield > 0) shieldHp = Math.min(shield.max, shieldHp + toShield);
  }

  if (shield.value > 0 && shieldHp <= 0) effects.collapsed = true;

  return {
    body,
    tempTaken,
    shieldValue: Math.max(0, Math.min(shield.max, shieldHp)),
    rewrite: true,
    effects,
  };
}
