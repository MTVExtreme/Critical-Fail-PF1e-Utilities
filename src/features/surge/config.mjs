import { MODULE_ID, SEVERITY_BANDS, SPELL_SURGE_PER_LEVEL, SPHERE_SURGE_PER_CL } from "../../constants.mjs";

/** World setting holding the GM's surge rules (chance scaling, surge area, severity table). */
export const SURGE_CONFIG_SETTING = "surgeConfig";

/** Built-in severity chances on the d100 (sum 100). Matches the original 1–30 / 31–50 / 51–70 / 71–90 / 91–100 bands. */
const DEFAULT_SEVERITY_CHANCES = { mild: 30, moderate: 20, severe: 20, extreme: 20, crazy: 10 };

export function defaultSurgeConfig() {
  return {
    v: 1,
    perLevel: SPELL_SURGE_PER_LEVEL,
    perCL: SPHERE_SURGE_PER_CL,
    areaName: "",
    areaMultiplier: 1,
    areaFlat: 0,
    severity: SEVERITY_BANDS.map((band) => ({
      id: band.id,
      label: "",
      labelKey: band.labelKey,
      chance: DEFAULT_SEVERITY_CHANCES[band.id] ?? 0,
    })),
  };
}

export function registerSurgeConfigSetting() {
  game.settings.register(MODULE_ID, SURGE_CONFIG_SETTING, {
    scope: "world",
    config: false,
    type: Object,
    default: defaultSurgeConfig(),
    onChange: () => rerenderSurgeViews(),
  });
}

/**
 * Current surge rules, with defaults filled in and values cleaned.
 * @returns {ReturnType<typeof defaultSurgeConfig>}
 */
export function getSurgeConfig() {
  let stored = {};
  try {
    stored = game.settings.get(MODULE_ID, SURGE_CONFIG_SETTING) ?? {};
  } catch {
    stored = {};
  }
  return normalizeSurgeConfig(stored);
}

/**
 * @param {object} data
 * @returns {ReturnType<typeof defaultSurgeConfig>}
 */
export function normalizeSurgeConfig(data) {
  const base = defaultSurgeConfig();
  const num = (value, fallback) => (Number.isFinite(Number(value)) && value !== "" && value !== null ? Number(value) : fallback);
  const out = {
    v: 1,
    perLevel: num(data?.perLevel, base.perLevel),
    perCL: num(data?.perCL, base.perCL),
    areaName: String(data?.areaName ?? "").trim(),
    areaMultiplier: Math.max(0, num(data?.areaMultiplier, base.areaMultiplier)),
    areaFlat: num(data?.areaFlat, base.areaFlat),
    severity: base.severity,
  };
  if (Array.isArray(data?.severity) && data.severity.length) {
    out.severity = data.severity.map((band, i) => ({
      id: String(band?.id || `band${i + 1}`),
      label: String(band?.label ?? "").trim(),
      labelKey: band?.labelKey ? String(band.labelKey) : "",
      chance: Math.max(0, Math.floor(num(band?.chance, 0))),
    }));
  }
  return out;
}

/** Display name of a severity band. */
export function severityLabel(band) {
  if (band.label) return band.label;
  if (band.labelKey && game.i18n.has?.(band.labelKey)) return game.i18n.localize(band.labelKey);
  return band.id;
}

/**
 * Severity bands with their d100 ranges, built from the chances in order (first band starts at 1).
 * Bands with 0% chance get no range.
 * @param {ReturnType<typeof defaultSurgeConfig>} [config]
 * @returns {{ id: string, label: string, chance: number, min: number|null, max: number|null }[]}
 */
export function severityRanges(config = getSurgeConfig()) {
  let next = 1;
  return config.severity.map((band) => {
    const chance = band.chance;
    const range = chance > 0 ? { min: next, max: Math.min(100, next + chance - 1) } : { min: null, max: null };
    if (chance > 0) next += chance;
    return { id: band.id, label: severityLabel(band), chance, ...range };
  });
}

/**
 * Apply the surge-area multiplier and flat bonus, then clamp to 0–100.
 * @param {number} raw - Chance from spell level or sphere CL, including the actor's Changes
 * @param {ReturnType<typeof defaultSurgeConfig>} [config]
 */
export function applySurgeArea(raw, config = getSurgeConfig()) {
  return Math.clamp(Math.floor(raw * config.areaMultiplier + config.areaFlat), 0, 100);
}

/** True when the surge area changes anything. */
export function hasSurgeArea(config = getSurgeConfig()) {
  return config.areaMultiplier !== 1 || config.areaFlat !== 0;
}

/** Short text such as "High Surge Zone: ×2, +10%". */
export function surgeAreaSummary(config = getSurgeConfig()) {
  if (!hasSurgeArea(config)) return "";
  const parts = [];
  if (config.areaMultiplier !== 1) parts.push(`×${config.areaMultiplier}`);
  if (config.areaFlat !== 0) parts.push(`${config.areaFlat > 0 ? "+" : ""}${config.areaFlat}%`);
  const name = config.areaName || game.i18n.localize("CFUTIL.SurgeConfig.AreaDefaultName");
  return `${name}: ${parts.join(", ")}`;
}

function rerenderSurgeViews() {
  // Actor sheets show sphere surge chances; refresh open PF1 sheets.
  for (const app of Object.values(ui.windows ?? {})) {
    if (app?.actor && app.rendered) app.render(false);
  }
  for (const app of foundry.applications.instances?.values?.() ?? []) {
    if (app?.actor && app.rendered) app.render();
  }
}
