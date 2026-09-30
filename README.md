# Critical-Fail-PF1e-Utilities

Campaign utilities for **Pathfinder 1e** on Foundry VTT 13.

Module id: `critical-fail-pf1e-utilities`

## Features

### Surge Chance
- Auto-rolls when a **1st+ level spell** is cast/posted to chat, or a **Sphere magic** talent is used
- Manual **Surge** on Spells tab (prompts for spell level) and Spheres tab (**pick a sphere** for CL)
- Chance: `(8 + per-level mod) × spell level + base`, or `(4 + per-CL mod) × sphere CL + base`
- Item **Changes** targets (Spells section): **Base Surge Chance**, **Surge % per Spell Level**, **Surge % per Sphere CL**
- Actor **Settings** tab: roll `1d100`, `2d100kh`, or `2d100kl` for the chance roll
- Item **Details** tab: disable surge for a specific spell/talent
- Module settings: master **Enable Surge Roller** switch + auto-roll toggle

### Spheres of Guile
- Adds a **Spheres of Guile** block to the pf1spheres **Spheres** tab (requires the Spheres for Pathfinder 1e module)
- One row per skill sphere the actor has talents in: talent count (excluded talents in parentheses), **Ranks**, and an expandable talent list
- **Ranks** sums the `bonusSkillRanks` Changes on that sphere's talents; the tooltip also shows the rules value (5 per talent spent in the sphere, up to Hit Dice)
- Click a sphere name to open its base entry (or its wiki page), a talent name to open the talent, its icon to post it to chat, and the d20 to use it
- Shows the **operative modifier** when one is set in the Spheres actor settings
- Module setting: **Show Spheres of Guile on the Spheres tab**
- Pairs with the *Spheres of Guile Talents* pack in Critical Fail Shared, whose base spheres carry a `min(5 * @spheres.talents.<sphere>.value, @attributes.hd.total)` bonus skill rank Change (Vocation specialty talents and Working Folk grant `@attributes.hd.total`)

## Documentation

- [AGENTS.md](../AGENTS.md)
- [docs/](../docs/)
