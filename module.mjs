import { MODULE_ID } from "./src/constants.mjs";
import { registerSettings } from "./src/settings.mjs";
import { registerApi } from "./src/api.mjs";
import { features } from "./src/features/_index.mjs";

Hooks.once("init", () => {
  registerSettings();
  for (const feature of Object.values(features)) feature.init?.();
  console.log(`${MODULE_ID} | Initialized`);
});

Hooks.once("pf1PostInit", () => {
  for (const feature of Object.values(features)) feature.pf1PostInit?.();
});

Hooks.once("setup", () => {
  registerApi();
  for (const feature of Object.values(features)) feature.setup?.();
});

Hooks.once("ready", () => {
  for (const feature of Object.values(features)) feature.ready?.();
  console.log(`${MODULE_ID} | Ready (Surge Chance available)`);
});
