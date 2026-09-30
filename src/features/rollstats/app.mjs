import { MODULE_ID, ROLL_STATS_SETTING } from "../../constants.mjs";
import { clearStore, getStoreData } from "./store.mjs";
import {
  computeD20Stats,
  computeDamageStats,
  inRange,
  leaders,
  rangeFromFilter,
  sumCounts,
  toDateInput,
} from "./stats.mjs";

const { ApplicationV2, HandlebarsApplicationMixin, DialogV2 } = foundry.applications.api;

const PRESETS = ["all", "today", "yesterday", "7d", "30d", "date", "custom"];

/** Column definitions: `key` is the sort key, `pick` reads the raw value from a row. */
const D20_COLUMNS = [
  { key: "name", label: "Character", cls: "name", pick: (row) => row.name },
  { key: "total", label: "Rolls", hint: "RollsHint", pick: (row) => row.d20.total },
  { key: "nat20", label: "Nat20", cls: "nat20", pick: (row) => row.d20.nat20 },
  { key: "nat1", label: "Nat1", cls: "nat1", pick: (row) => row.d20.nat1 },
  { key: "streak20", label: "Streak20", cls: "nat20", hint: "StreakHint", pick: (row) => row.d20.streak20 },
  { key: "streak1", label: "Streak1", cls: "nat1", hint: "StreakHint", pick: (row) => row.d20.streak1 },
  { key: "max20In10", label: "Max20In10", cls: "nat20", hint: "In10Hint", pick: (row) => row.d20.max20In10 },
  { key: "max1In10", label: "Max1In10", cls: "nat1", hint: "In10Hint", pick: (row) => row.d20.max1In10 },
  { key: "average", label: "Average", pick: (row) => row.d20.average },
];

const DAMAGE_COLUMNS = [
  { key: "name", label: "Character", cls: "name", pick: (row) => row.name },
  { key: "damageCount", label: "DamageRolls", hint: "DamageHint", pick: (row) => row.damage.count },
  { key: "damageTotal", label: "DamageTotal", pick: (row) => row.damage.total },
  { key: "damageMax", label: "DamageMax", pick: (row) => row.damage.max },
  { key: "damageAverage", label: "DamageAverage", pick: (row) => row.damage.average },
  { key: "healingCount", label: "HealingRolls", hint: "HealingHint", pick: (row) => row.healing.count },
  { key: "healingTotal", label: "HealingTotal", pick: (row) => row.healing.total },
  { key: "healingMax", label: "HealingMax", pick: (row) => row.healing.max },
  { key: "healingAverage", label: "HealingAverage", pick: (row) => row.healing.average },
];

let instance = null;

/** Open (or focus) the Roll Stats popup. */
export function openRollStats() {
  instance ??= new RollStatsApp();
  return instance.render({ force: true });
}

export class RollStatsApp extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "cf-roll-stats",
    classes: ["critical-fail-pf1e-utilities", "cf-roll-stats"],
    tag: "div",
    window: {
      title: "CFUTIL.RollStats.Title",
      icon: "fa-solid fa-chart-column",
      resizable: true,
      contentClasses: ["standard-form"],
    },
    position: { width: 960, height: 760 },
    actions: {
      refresh: RollStatsApp.#onRefresh,
      clear: RollStatsApp.#onClear,
    },
  };

  static PARTS = {
    main: {
      template: `modules/${MODULE_ID}/templates/roll-stats.hbs`,
      scrollable: [".cf-rs-scroll", ".cf-rs-table-wrap.d20", ".cf-rs-table-wrap.damage"],
    },
  };

  /** Filter state persists while the world is open. */
  filter = { preset: "all", from: "", to: "", date: "", chartActor: "all" };

  /** Per-table sort state. `dir` is 1 ascending, -1 descending. */
  sort = {
    d20: { key: "name", dir: 1 },
    damage: { key: "name", dir: 1 },
  };

  /** Name search; applied to rendered rows without re-rendering. */
  search = "";

  #settingHookId = null;

  /** @override */
  async _prepareContext(_options) {
    const range = rangeFromFilter(this.filter);
    const rows = buildRows(getStoreData(), range);

    const best20 = leaders(rows, (row) => row.d20.max20In10);
    const best1 = leaders(rows, (row) => row.d20.max1In10);
    for (const row of best20.rows) row.isBest20 = true;
    for (const row of best1.rows) row.isBest1 = true;

    const chartRows = this.filter.chartActor === "all" ? rows : rows.filter((row) => row.actorId === this.filter.chartActor);

    return {
      filter: this.filter,
      search: this.search,
      presets: PRESETS.map((value) => ({
        value,
        label: game.i18n.localize(`CFUTIL.RollStats.Preset.${value}`),
        selected: value === this.filter.preset,
      })),
      customEnabled: this.filter.preset === "custom",
      chartActors: [
        { value: "all", label: game.i18n.localize("CFUTIL.RollStats.AllPCs"), selected: this.filter.chartActor === "all" },
        ...rows.map((row) => ({ value: row.actorId, label: row.name, selected: row.actorId === this.filter.chartActor })),
      ],
      rangeLabel: describeRange(range),
      hasRows: rows.length > 0,
      rowCount: rows.length,
      totalD20: rows.reduce((sum, row) => sum + row.d20.total, 0),
      d20Columns: columnContext(D20_COLUMNS, this.sort.d20),
      damageColumns: columnContext(DAMAGE_COLUMNS, this.sort.damage),
      d20Rows: sortRows(rows, D20_COLUMNS, this.sort.d20),
      damageRows: sortRows(rows, DAMAGE_COLUMNS, this.sort.damage),
      totals: buildTotals(rows),
      comparison: {
        best20: { value: best20.value, names: best20.rows.map((row) => row.name).join(", ") },
        best1: { value: best1.value, names: best1.rows.map((row) => row.name).join(", ") },
      },
      chart: buildChart(chartRows),
      chartTitle:
        this.filter.chartActor === "all"
          ? game.i18n.localize("CFUTIL.RollStats.AllPCs")
          : rows.find((row) => row.actorId === this.filter.chartActor)?.name ?? game.i18n.localize("CFUTIL.RollStats.AllPCs"),
      isGM: game.user.isGM,
      trackingEnabled: game.settings.get(MODULE_ID, "enableRollTracking") === true,
      activeGM: game.users.activeGM?.name ?? null,
    };
  }

  /** @override */
  _onRender(context, options) {
    super._onRender(context, options);
    const root = this.element;

    for (const input of root.querySelectorAll("[data-filter]")) {
      input.addEventListener("change", (event) => this.#onFilterChange(event));
    }

    for (const header of root.querySelectorAll("th[data-sort-key]")) {
      header.addEventListener("click", (event) => this.#onSort(event));
    }

    const search = root.querySelector("[data-search]");
    if (search) {
      search.value = this.search;
      search.addEventListener("input", () => {
        this.search = search.value;
        this.#applySearch();
      });
    }
    this.#applySearch();
  }

  /** @override */
  _onFirstRender(context, options) {
    super._onFirstRender(context, options);
    this.#settingHookId = Hooks.on("updateSetting", (setting) => {
      if (setting?.key === `${MODULE_ID}.${ROLL_STATS_SETTING}` && this.rendered) this.render();
    });
  }

  /** @override */
  _onClose(options) {
    super._onClose(options);
    if (this.#settingHookId != null) Hooks.off("updateSetting", this.#settingHookId);
    this.#settingHookId = null;
    instance = null;
  }

  /** Hide table rows whose character name does not match the search box. */
  #applySearch() {
    const query = this.search.trim().toLowerCase();
    let visible = 0;
    for (const row of this.element.querySelectorAll("tr[data-search-name]")) {
      const match = !query || row.dataset.searchName.includes(query);
      row.hidden = !match;
      if (match) visible += 1;
    }
    const note = this.element.querySelector("[data-search-count]");
    if (note) {
      const perTable = this.element.querySelectorAll(".cf-rs-table-wrap").length || 1;
      const shown = Math.round(visible / perTable);
      note.textContent = query ? game.i18n.format("CFUTIL.RollStats.SearchCount", { shown }) : "";
    }
  }

  /**
   * @param {Event} event
   */
  #onSort(event) {
    const header = event.currentTarget;
    const table = header.dataset.sortTable;
    const key = header.dataset.sortKey;
    const state = this.sort[table];
    if (!state || !key) return;
    if (state.key === key) state.dir = -state.dir;
    else {
      state.key = key;
      state.dir = key === "name" ? 1 : -1;
    }
    this.render();
  }

  /**
   * @param {Event} event
   */
  #onFilterChange(event) {
    const input = event.currentTarget;
    const key = input.dataset.filter;
    const value = input.value;
    switch (key) {
      case "preset":
        this.filter.preset = value;
        if (value === "custom" && !this.filter.from && !this.filter.to) {
          this.filter.from = toDateInput(new Date());
          this.filter.to = toDateInput(new Date());
        }
        if (value !== "date") this.filter.date = "";
        break;
      case "date":
        this.filter.date = value;
        this.filter.preset = value ? "date" : "all";
        break;
      case "from":
      case "to":
        this.filter[key] = value;
        this.filter.preset = "custom";
        this.filter.date = "";
        break;
      case "chartActor":
        this.filter.chartActor = value;
        break;
    }
    this.render();
  }

  static #onRefresh() {
    this.render();
  }

  static async #onClear() {
    if (!game.user.isGM) return;
    const confirmed = await DialogV2.confirm({
      window: { title: game.i18n.localize("CFUTIL.RollStats.ClearTitle") },
      content: `<p>${game.i18n.localize("CFUTIL.RollStats.ClearConfirm")}</p>`,
      yes: { label: game.i18n.localize("CFUTIL.RollStats.ClearYes"), icon: "fa-solid fa-trash" },
      no: { label: game.i18n.localize("Cancel") },
      rejectClose: false,
    });
    if (!confirmed) return;
    await clearStore();
    this.render();
  }
}

/**
 * One row per player character with recorded data inside the range.
 * @param {ReturnType<typeof getStoreData>} store
 * @param {{ from: number|null, to: number|null }} range
 */
export function buildRows(store, range) {
  const rows = [];
  for (const [actorId, entry] of Object.entries(store.actors)) {
    const actor = game.actors.get(actorId);
    if (actor && actor.type !== "character") continue;
    const d20 = entry.d20.filter((record) => inRange(record[0], range)).sort((a, b) => a[0] - b[0]);
    const dmg = entry.dmg.filter((record) => inRange(record[0], range));
    if (!d20.length && !dmg.length) continue;
    const d20Stats = computeD20Stats(d20.map((record) => record[1]));
    const { damage, healing } = computeDamageStats(dmg);
    const name = actor?.name ?? entry.name ?? actorId;
    rows.push({
      actorId,
      name,
      searchName: name.toLowerCase(),
      img: actor?.img ?? "icons/svg/mystery-man.svg",
      missing: !actor,
      d20: d20Stats,
      damage,
      healing,
      fmt: {
        pct20: d20Stats.pct20.toFixed(1),
        pct1: d20Stats.pct1.toFixed(1),
        average: d20Stats.average.toFixed(1),
        damageAverage: damage.average.toFixed(1),
        healingAverage: healing.average.toFixed(1),
      },
      isBest20: false,
      isBest1: false,
    });
  }
  rows.sort((a, b) => a.name.localeCompare(b.name));
  return rows;
}

/**
 * @param {typeof D20_COLUMNS} columns
 * @param {{ key: string, dir: number }} sort
 */
function columnContext(columns, sort) {
  return columns.map((column) => ({
    key: column.key,
    cls: column.cls ?? "",
    label: game.i18n.localize(`CFUTIL.RollStats.${column.label}`),
    hint: column.hint ? game.i18n.localize(`CFUTIL.RollStats.${column.hint}`) : "",
    active: column.key === sort.key,
    desc: column.key === sort.key && sort.dir < 0,
  }));
}

/**
 * Stable sort by the active column; ties fall back to name.
 * @param {ReturnType<typeof buildRows>} rows
 * @param {typeof D20_COLUMNS} columns
 * @param {{ key: string, dir: number }} sort
 */
export function sortRows(rows, columns, sort) {
  const column = columns.find((c) => c.key === sort.key) ?? columns[0];
  const dir = sort.dir < 0 ? -1 : 1;
  return [...rows].sort((a, b) => {
    const va = column.pick(a);
    const vb = column.pick(b);
    let result;
    if (typeof va === "string" || typeof vb === "string") result = String(va).localeCompare(String(vb));
    else result = (Number(va) || 0) - (Number(vb) || 0);
    if (result === 0 && column.key !== "name") result = a.name.localeCompare(b.name);
    return result * dir;
  });
}

/**
 * Party totals for the table footers (averages are weighted by roll count).
 * @param {ReturnType<typeof buildRows>} rows
 */
export function buildTotals(rows) {
  const sum = (pick) => rows.reduce((acc, row) => acc + pick(row), 0);
  const d20Total = sum((row) => row.d20.total);
  const d20Sum = sum((row) => row.d20.average * row.d20.total);
  const damageCount = sum((row) => row.damage.count);
  const damageTotal = sum((row) => row.damage.total);
  const healingCount = sum((row) => row.healing.count);
  const healingTotal = sum((row) => row.healing.total);
  const nat20 = sum((row) => row.d20.nat20);
  const nat1 = sum((row) => row.d20.nat1);
  return {
    d20: {
      total: d20Total,
      nat20,
      nat1,
      pct20: d20Total ? ((nat20 / d20Total) * 100).toFixed(1) : "0.0",
      pct1: d20Total ? ((nat1 / d20Total) * 100).toFixed(1) : "0.0",
      streak20: rows.reduce((best, row) => Math.max(best, row.d20.streak20), 0),
      streak1: rows.reduce((best, row) => Math.max(best, row.d20.streak1), 0),
      max20In10: rows.reduce((best, row) => Math.max(best, row.d20.max20In10), 0),
      max1In10: rows.reduce((best, row) => Math.max(best, row.d20.max1In10), 0),
      average: d20Total ? (d20Sum / d20Total).toFixed(1) : "0.0",
    },
    damage: {
      count: damageCount,
      total: damageTotal,
      max: rows.reduce((best, row) => Math.max(best, row.damage.max), 0),
      average: damageCount ? (damageTotal / damageCount).toFixed(1) : "0.0",
    },
    healing: {
      count: healingCount,
      total: healingTotal,
      max: rows.reduce((best, row) => Math.max(best, row.healing.max), 0),
      average: healingCount ? (healingTotal / healingCount).toFixed(1) : "0.0",
    },
  };
}

/**
 * Bar chart data for faces 1–20.
 * @param {Array<{ d20: { counts: number[] } }>} rows
 */
function buildChart(rows) {
  const counts = sumCounts(rows.map((row) => row.d20.counts));
  const total = counts.reduce((sum, n) => sum + n, 0);
  const max = Math.max(1, ...counts);
  const expected = total / 20;
  return {
    total,
    expected: expected.toFixed(1),
    expectedPct: Math.min(100, (expected / max) * 100).toFixed(1),
    bars: counts.map((count, index) => {
      const face = index + 1;
      const pct = total ? ((count / total) * 100).toFixed(1) : "0.0";
      return {
        face,
        count,
        heightPct: ((count / max) * 100).toFixed(1),
        cls: face === 1 ? "nat1" : face === 20 ? "nat20" : "",
        tooltip: game.i18n.format("CFUTIL.RollStats.BarTooltip", { face, count, pct }),
      };
    }),
  };
}

/**
 * @param {{ preset: string, from: number|null, to: number|null }} range
 * @returns {string}
 */
function describeRange(range) {
  const format = (ts) => new Date(ts).toLocaleDateString();
  if (range.from == null && range.to == null) return game.i18n.localize("CFUTIL.RollStats.Preset.all");
  if (range.from != null && range.to != null) {
    const from = format(range.from);
    const to = format(range.to);
    return from === to ? from : `${from} – ${to}`;
  }
  if (range.from != null) return game.i18n.format("CFUTIL.RollStats.Since", { date: format(range.from) });
  return game.i18n.format("CFUTIL.RollStats.Until", { date: format(range.to) });
}
