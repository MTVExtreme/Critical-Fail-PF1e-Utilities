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

### Roll Stats (GM tool)
- **Roll Stats** button at the bottom of the **Actors** sidebar (GM only) opens a popup covering every player character
- Per PC: d20 rolls, natural 20s and 1s (count and %), longest 20 / 1 streaks, most 20s and most 1s in any 10 consecutive rolls (party leaders are marked, for the two homebrew feats), average d20
- Damage rolled (count / total / max / average) from PF1 action cards, and the same for Healing-type actions
- Both tables sit in capped, scrollable panels with sticky headers and an **All PCs** totals footer; click a column header to sort, and the **Find PC** box filters rows as you type (built for 50+ characters)
- Bar chart of how often each face 1–20 came up, for all PCs or one PC, with the fair-die expectation as a dashed line
- Timeframe filters: all time, today, yesterday, last 7 / 30 days, a specific date, or a custom range
- Recording happens on the **active GM's** client from chat messages (attacks, crit confirms, saves, skills, initiative, manual d20 rolls; dropped kh/kl dice and rerolls are skipped) and is written to the hidden world setting `rollStatsData`, so deleting chat does not lose data. Rolls made while no GM is connected are not recorded.
- Module setting **Record PC roll statistics**; the popup has a **Clear all recorded data** button
- API: `game.modules.get("critical-fail-pf1e-utilities").api.rollStats` (`open`, `getData`, `clear`, `flush`)

### Astral energy shield
- The sheet Settings tab has **Show shield beside hit points**, off unless you turn it on for that actor. While it is on, a **Shield** box sits beside hit points. Set a maximum to turn the pool on. Hovering the box lists the raw shield values the same way hit points do. By default that pool is lost before hit points and temporary hit points. **Take Temp HP first**, beside that switch and off by default, loses temporary hit points before the shield. The token hit-point buttons use that same order, and the shield is drawn as the blue top half of the token bar.
- **Show burn beside nonlethal** adds a Burn box to the right of Nonlethal. The number is hit points of burn, kept separate from Nonlethal. If the two together are higher than current hit points, the creature falls unconscious. A rest that restores health clears burn. Burn is purple on the token bar, beside nonlethal, and in the hit-point hover tip.
- Shield changes float over the token and, when Koboldworks Health Monitor is enabled, appear in its log. Healing is light blue and damage is dark blue. Burn uses the same log: light purple when burn is removed, dark purple when burn is taken.
- For the sphinx, resistances apply before the shield. Damage reduction applies only to physical damage that gets past it.
- Fire and electricity never injure it. Electricity heals 1 body hit point per 3 points and then spills into the shield. Both grant haste for 3 rounds, refreshed rather than stacked. Fire also ends a slow effect.
- An EMP damage type, or the sphinx's **Trigger EMP** action, drops the field for one round without erasing its hit points, heals 20, and grants haste.
- Hostile spells that allow spell resistance are reflected (or turned back on the caster, for an area) instead of touching the shield. Fire and electricity spells trigger the energy response instead of reflecting.
- While the field has hit points, new harmful conditions, curses, ability damage, ability drain, and negative levels are refused. Mind-affecting effects can land while the field is down.
- At the start of its turn the primary GM client restores 10 body hit points (unless evil damage suppressed regeneration) and 10 shield hit points.
- The sphinx's **Guardian Controls** item runs EMP, interception, size changes, archive injunction, core removal, and spell reflection.
- If the Boss Bar module is showing that actor, a cyan hexagonal forcefield covers the bar in proportion to shield integrity. Players see the field only. The shield total is on the sheet, and on the bar for the GM.

## Documentation

- [AGENTS.md](../AGENTS.md)
- [docs/](../docs/)
