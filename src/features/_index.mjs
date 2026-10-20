import * as surge from "./surge/index.mjs";
import * as rollstats from "./rollstats/index.mjs";
import * as mananite from "./mananite/index.mjs";
import * as astral from "./astral/index.mjs";
import * as skills from "./skills/background-sets.mjs";
import * as migration from "./migration/v14-commit.mjs";

export const features = {
  surge,
  rollstats,
  mananite,
  astral,
  skills,
  migration,
};
