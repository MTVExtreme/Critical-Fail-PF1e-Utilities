import { MODULE_ID } from "./constants.mjs";
import { api as surgeApi } from "./features/surge/index.mjs";

export function registerApi() {
  const mod = game.modules.get(MODULE_ID);
  if (!mod) return;

  mod.api = {
    id: MODULE_ID,
    version: mod.version,
    surge: surgeApi,
  };
}
