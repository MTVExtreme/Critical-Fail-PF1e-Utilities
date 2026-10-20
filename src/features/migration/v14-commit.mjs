import { MODULE_ID } from "../../constants.mjs";

const COMMITTED = "v14DataCommitted";
const CLEARED = "v14SourcesCleared";
const PACKS = "v14CompendiumPacks";
const MIGRATION = { pf1: { action: "migration" } };
const PACK_TYPES = new Set(["Actor", "Item", "Scene", "RollTable", "Macro", "JournalEntry"]);

/**
 * Commit fragile Pathfinder migrations for world directories, then compendiums.
 * Map tokens are not given a new skill list: that copy locks the client.
 */
export function init() {
  let resolve;
  let reject;
  globalThis.__cfV14Migration = new Promise((ok, fail) => {
    resolve = ok;
    reject = fail;
  });
  game.settings.register(MODULE_ID, COMMITTED, {
    scope: "world",
    config: false,
    type: Boolean,
    default: false,
  });
  game.settings.register(MODULE_ID, CLEARED, {
    scope: "world",
    config: false,
    type: Boolean,
    default: false,
  });
  game.settings.register(MODULE_ID, PACKS, {
    scope: "world",
    config: false,
    type: Object,
    default: {},
  });
  Hooks.once("ready", () => {
    commitV14Migrations()
      .then(resolve)
      .catch((error) => {
        console.error(`${MODULE_ID} | v14 migration`, error);
        ui.notifications?.error("Pathfinder v14 migration did not finish. It will try again on the next reload.");
        reject(error);
      });
  });
}

async function commitV14Migrations() {
  if (!game.user.isActiveGM) return;
  if (!game.settings.get(MODULE_ID, COMMITTED)) {
    ui.notifications?.info("Saving Pathfinder v14 migrations for world actors, items, and scenes.");
    const options = { fast: true, legacy: true, noHooks: true, dialog: null };
    await pf1.migrations.world.migrateActors(options);
    await pf1.migrations.world.migrateItems(options);
    await pf1.migrations.world.migrateScenes(options);
    await game.settings.set(MODULE_ID, COMMITTED, true);
    ui.notifications?.info("Pathfinder v14 migrations for the world directories are saved.");
  }
  if (!game.settings.get(MODULE_ID, CLEARED)) await clearReseedingSources();
  await migrateCompendiums();
}

/**
 * Skill items are created, but the old system.skills object is left in the
 * actor source. Pathfinder rebuilds system._pending from that object on every
 * load, so the migration banner never goes away.
 * @returns {Promise<void>}
 */
async function clearReseedingSources() {
  ui.notifications?.info("Clearing saved fields that keep Pathfinder migration warnings on world actors.");
  let cleared = 0;
  for (const actor of game.actors) {
    try {
      if (await clearActor(actor)) cleared += 1;
    } catch (error) {
      console.error(`${MODULE_ID} | v14 source clear`, actor?.name, actor?.uuid, error);
    }
  }
  await game.settings.set(MODULE_ID, CLEARED, true);
  ui.notifications?.info(`Pathfinder migration warnings were cleared on ${cleared} world actors.`);
}

/**
 * Creature and item compendiums get a real migration. Scene packs only have the
 * old fields removed from token actors, because copying a full skill list onto
 * every map token locks the client.
 * @returns {Promise<void>}
 */
async function migrateCompendiums() {
  const done = { ...game.settings.get(MODULE_ID, PACKS) };
  const packs = [...game.packs].filter(isPathfinderPack);
  const pending = packs.filter((pack) => !done[pack.collection]);
  if (!pending.length) return;
  ui.notifications?.info(`Migrating ${pending.length} Pathfinder compendiums. Map tokens are cleared without a new skill list.`);
  for (const pack of pending) {
    try {
      await migratePack(pack);
      done[pack.collection] = true;
      await game.settings.set(MODULE_ID, PACKS, done);
      pack.clear();
    } catch (error) {
      console.error(`${MODULE_ID} | v14 compendium`, pack.collection, error);
      ui.notifications?.warn(`Pathfinder compendium ${pack.collection} was not finished. It will try again on the next reload.`);
    }
  }
  ui.notifications?.info("Pathfinder compendium migration finished.");
}

/**
 * @param {CompendiumCollection} pack
 * @returns {boolean}
 */
function isPathfinderPack(pack) {
  const type = pack.metadata.type;
  if (!PACK_TYPES.has(type)) return false;
  if (pack.metadata.packageType === "world") return game.system.id === "pf1";
  if (pack.metadata.packageType === "system") return pack.metadata.package === "pf1";
  return pack.metadata.system === "pf1";
}

/**
 * @param {CompendiumCollection} pack
 * @returns {Promise<void>}
 */
async function migratePack(pack) {
  await pack.getIndex();
  if (!pack.index.size) return;
  const type = pack.metadata.type;
  // Pathfinder only rewrites actors, items, and scenes. Map scenes stay on the
  // field-clear path so tokens are not given a new skill list.
  if (type !== "Actor" && type !== "Item" && type !== "Scene") return;
  const wasLocked = pack.locked;
  if (wasLocked) await pack.configure({ locked: false });
  try {
    ui.notifications?.info(`Migrating ${pack.metadata.label} (${pack.index.size}).`);
    if (pack.metadata.type === "Actor") await migrateActorPack(pack);
    else if (pack.metadata.type === "Scene") await migrateScenePack(pack);
    else if (pack.metadata.type === "Item") await migrateItemPack(pack);
  } finally {
    pack.clear();
    if (wasLocked) await pack.configure({ locked: true });
  }
}

/**
 * @param {CompendiumCollection} pack
 * @returns {Promise<void>}
 */
async function migrateActorPack(pack) {
  let count = 0;
  for (const id of pack.index.keys()) {
    const actor = await pack.getDocument(id);
    if (!actor) continue;
    try {
      await clearActor(actor, { allowPack: true });
    } catch (error) {
      console.error(`${MODULE_ID} | v14 compendium actor`, actor.name, actor.uuid, error);
    }
    count += 1;
    if (count % 10 === 0) {
      pack.clear();
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }
}

/**
 * @param {CompendiumCollection} pack
 * @returns {Promise<void>}
 */
async function migrateScenePack(pack) {
  for (const id of pack.index.keys()) {
    const scene = await pack.getDocument(id);
    if (!scene) continue;
    try {
      for (const token of scene.tokens) {
        if (token.actorLink) continue;
        const actor = token.actor;
        if (!actor || foundry.utils.isEmpty(actor.system?._pending)) continue;
        await clearActor(actor, { allowPack: true, allowToken: true, extract: false });
      }
      if (game.user.isGM) {
        await scene.update({ flags: { pf1: { migration: game.system.version } } }, writeOptions(scene));
      }
    } catch (error) {
      console.error(`${MODULE_ID} | v14 compendium scene`, scene.name, scene.uuid, error);
    }
    pack.clear();
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

/**
 * @param {Actor} actor
 * @param {{ allowPack?: boolean, allowToken?: boolean, extract?: boolean }} [options]
 * @returns {Promise<boolean>}
 */
async function clearActor(actor, { allowPack = false, allowToken = false, extract = true } = {}) {
  if (!actor || (actor.pack && !allowPack) || (actor.isToken && !allowToken)) return false;
  if (foundry.utils.isEmpty(actor.system?._pending)) return false;

  const pending = actor.system._pending;
  const needsSkills = extract && Boolean(pending.skills) && actor.itemTypes.skill.length === 0;
  const needsExtract = extract && Boolean(pending.spells || pending.movement || pending.extranousDetails || pending.extranousAttributes);
  let extracted = !needsExtract;
  if (needsSkills) {
    try {
      const operations = await pf1.migrations.actor.migrate(actor, { legacy: true, commit: false });
      await commitOperations(operations);
    } catch (error) {
      console.error(`${MODULE_ID} | v14 skills`, actor.name, actor.uuid, error);
    }
  }
  if (needsExtract && actor._source?.system) {
    try {
      const staged = foundry.utils.deepClone(actor._source.system);
      staged._pending = foundry.utils.deepClone(pending);
      await actor.update({ system: new foundry.data.operators.ForcedReplacement(staged) }, writeOptions(actor));
      const operations = await pf1.migrations.actor.migrate(actor, { legacy: true, commit: false });
      await commitOperations(operations);
      extracted = true;
    } catch (error) {
      console.error(`${MODULE_ID} | v14 extract`, actor.name, actor.uuid, error);
    }
  }

  const current = actor._source?.system;
  if (!current) return false;
  const system = foundry.utils.deepClone(current);
  let changed = false;
  if (system.skills && (actor.itemTypes.skill.length > 0 || !extract)) {
    delete system.skills;
    changed = true;
  }
  if (extracted && system.attributes?.spells?.spellbooks) {
    delete system.attributes.spells;
    changed = true;
  }
  if (system._pending) {
    delete system._pending;
    changed = true;
  }
  if (extracted) changed = deleteLegacyFields(system) || changed;
  if (!changed) return false;
  await actor.update({ system: new foundry.data.operators.ForcedReplacement(system) }, writeOptions(actor));
  return foundry.utils.isEmpty(actor.system?._pending);
}

/**
 * Item compendiums use Pathfinder's own migrator, then save without a socket
 * broadcast. Scene packs never reach this path.
 * @param {CompendiumCollection} pack
 * @returns {Promise<void>}
 */
async function migrateItemPack(pack) {
  let count = 0;
  for (const id of pack.index.keys()) {
    const item = await pack.getDocument(id);
    count += 1;
    if (item && !hasCurrentMigration(item)) {
      try {
        const operations = await pf1.migrations.item.migrate(item, { legacy: true, commit: false });
        await commitOperations(operations);
      } catch (error) {
        console.error(`${MODULE_ID} | v14 compendium item`, item?.name, item?.uuid, error);
      }
    }
    if (count % 10 === 0) {
      pack.clear();
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }
}

/**
 * Foundry 14's `#handleUpdateDocuments` reads `doc._source` before loading a
 * compendium document that the receiving client has not opened. Saving with
 * `broadcast: false` keeps the write on the server and on the GM who already
 * has the document. World documents still broadcast, because every client has
 * those collections.
 * @param {object[] | null | undefined} operations
 * @returns {Promise<void>}
 */
async function commitOperations(operations) {
  if (!operations?.length) return;
  for (const operation of operations) {
    if (operation.pack || operation.parent?.pack) {
      operation.broadcast = false;
      operation.render = false;
    }
  }
  await foundry.documents.modifyBatch(operations);
}

/**
 * @param {foundry.abstract.Document | null | undefined} document
 * @returns {object}
 */
function writeOptions(document) {
  if (!document?.pack) return MIGRATION;
  return { ...MIGRATION, broadcast: false, render: false };
}

/**
 * @param {foundry.abstract.Document | null | undefined} document
 * @returns {boolean}
 */
function hasCurrentMigration(document) {
  const version = document?.flags?.pf1?.migration;
  if (!version) return false;
  return !foundry.utils.isNewerVersion(game.system.version, version);
}

/**
 * @param {object} system
 * @returns {boolean}
 */
function deleteLegacyFields(system) {
  let changed = false;
  if (system.details?.bonusFeatFormula) {
    delete system.details.bonusFeatFormula;
    changed = true;
  }
  if (system.details?.bonusSkillRankFormula) {
    delete system.details.bonusSkillRankFormula;
    changed = true;
  }
  const strength = system.abilities?.str;
  if (strength?.carryBonus !== undefined) {
    delete strength.carryBonus;
    changed = true;
  }
  if (strength?.carryMultiplier !== undefined) {
    delete strength.carryMultiplier;
    changed = true;
  }
  const attributes = system.attributes;
  if (attributes) {
    for (const key of ["naturalAC", "acNotes", "saveNotes", "cmdNotes", "srNotes"]) {
      if (attributes[key] !== undefined) {
        delete attributes[key];
        changed = true;
      }
    }
  }
  return changed;
}
