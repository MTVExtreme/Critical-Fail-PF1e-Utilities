import { MODULE_ID } from "../../constants.mjs";
import {
  SURGE_CONFIG_SETTING,
  defaultSurgeConfig,
  getSurgeConfig,
  normalizeSurgeConfig,
  severityLabel,
  severityRanges,
  applySurgeArea,
} from "./config.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/** GM settings window for surge chance scaling, surge areas, and the severity table. */
export class SurgeConfigApp extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "cf-surge-config",
    classes: ["critical-fail-pf1e-utilities", "cf-surge-config"],
    tag: "form",
    window: {
      title: "CFUTIL.SurgeConfig.Title",
      icon: "fa-solid fa-bolt",
      resizable: true,
      contentClasses: ["standard-form"],
    },
    position: { width: 580, height: 720 },
    form: {
      handler: SurgeConfigApp.#onSubmit,
      submitOnChange: false,
      closeOnSubmit: false,
    },
    actions: {
      addBand: SurgeConfigApp.#onAddBand,
      removeBand: SurgeConfigApp.#onRemoveBand,
      resetSeverity: SurgeConfigApp.#onResetSeverity,
      resetChance: SurgeConfigApp.#onResetChance,
    },
  };

  static PARTS = {
    form: {
      template: `modules/${MODULE_ID}/templates/surge-config.hbs`,
      scrollable: [".cf-surge-config-body"],
    },
    footer: { template: "templates/generic/form-footer.hbs" },
  };

  /** @override Keep the window inside the screen; the settings scroll inside it. */
  _initializeApplicationOptions(options) {
    options = super._initializeApplicationOptions(options);
    const max = Math.max(400, (globalThis.innerHeight || 900) - 80);
    if (Number.isFinite(options.position?.height)) options.position.height = Math.min(options.position.height, max);
    return options;
  }

  /** Unsaved edits, so adding or removing a band keeps what was typed. */
  #draft = null;

  /** @override */
  async _prepareContext(_options) {
    const config = this.#draft ?? getSurgeConfig();
    const ranges = severityRanges(config);
    const total = config.severity.reduce((t, b) => t + b.chance, 0);
    return {
      config,
      bands: config.severity.map((band, i) => ({
        ...band,
        index: i,
        placeholder: severityLabel({ ...band, label: "" }),
        range: rangeText(ranges[i]),
      })),
      total,
      totalOk: total === 100,
      preview: previewRows(config),
      canRemove: config.severity.length > 1,
      buttons: [{ type: "submit", icon: "fa-solid fa-floppy-disk", label: "CFUTIL.SurgeConfig.Save" }],
    };
  }

  #listening = false;

  /** @override */
  _onRender(context, options) {
    super._onRender?.(context, options);
    // Live totals, ranges, and chance preview while typing (the form element survives re-renders)
    if (this.#listening) return;
    this.#listening = true;
    this.element.addEventListener("input", () => this.#refreshLive());
  }

  #readForm() {
    const data = new foundry.applications.ux.FormDataExtended(this.element).object;
    const expanded = foundry.utils.expandObject(data);
    const current = this.#draft ?? getSurgeConfig();
    const rows = Object.entries(expanded.severity ?? {})
      .sort(([a], [b]) => Number(a) - Number(b))
      .map(([i, row]) => ({ ...current.severity[Number(i)], ...row }));
    return normalizeSurgeConfig({ ...current, ...expanded, severity: rows });
  }

  #refreshLive() {
    const config = this.#readForm();
    const ranges = severityRanges(config);
    const total = config.severity.reduce((t, b) => t + b.chance, 0);
    const totalEl = this.element.querySelector("[data-cf-total]");
    if (totalEl) {
      totalEl.textContent = String(total);
      totalEl.closest(".cf-surge-total")?.classList.toggle("bad", total !== 100);
    }
    this.element.querySelectorAll("[data-cf-range]").forEach((el) => {
      el.textContent = rangeText(ranges[Number(el.dataset.cfRange)]);
    });
    const rows = previewRows(config);
    this.element.querySelectorAll("[data-cf-preview]").forEach((el, i) => {
      if (rows[i]) el.textContent = `${rows[i].spell}% · ${rows[i].sphere}%`;
    });
  }

  static async #onAddBand() {
    const config = this.#readForm();
    config.severity.push({ id: foundry.utils.randomID(8), label: "", labelKey: "", chance: 0 });
    this.#draft = config;
    this.render();
  }

  static async #onRemoveBand(_event, target) {
    const config = this.#readForm();
    const index = Number(target.closest("[data-index]")?.dataset.index);
    if (config.severity.length > 1 && Number.isInteger(index)) config.severity.splice(index, 1);
    this.#draft = config;
    this.render();
  }

  static async #onResetSeverity() {
    const config = this.#readForm();
    config.severity = defaultSurgeConfig().severity;
    this.#draft = config;
    this.render();
  }

  static async #onResetChance() {
    const config = this.#readForm();
    const base = defaultSurgeConfig();
    Object.assign(config, {
      perLevel: base.perLevel,
      perCL: base.perCL,
      areaName: "",
      areaMultiplier: 1,
      areaFlat: 0,
    });
    this.#draft = config;
    this.render();
  }

  static async #onSubmit(_event, _form, _formData) {
    const config = this.#readForm();
    const total = config.severity.reduce((t, b) => t + b.chance, 0);
    if (total !== 100) {
      ui.notifications.error(game.i18n.format("CFUTIL.SurgeConfig.TotalError", { total }));
      this.#draft = config;
      return;
    }
    await game.settings.set(MODULE_ID, SURGE_CONFIG_SETTING, config);
    this.#draft = null;
    ui.notifications.info(game.i18n.localize("CFUTIL.SurgeConfig.Saved"));
    this.close();
  }
}

function rangeText(range) {
  if (!range || range.min == null) return "—";
  return range.min === range.max ? String(range.min) : `${range.min}–${range.max}`;
}

/** Sample chances (no actor Changes) for spell levels 1–9 and sphere CL 2× the level. */
function previewRows(config) {
  return Array.from({ length: 9 }, (_, i) => {
    const level = i + 1;
    return {
      level,
      cl: level * 2,
      spell: applySurgeArea(level * config.perLevel, config),
      sphere: applySurgeArea(level * 2 * config.perCL, config),
    };
  });
}
