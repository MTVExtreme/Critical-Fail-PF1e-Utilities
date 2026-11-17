# Changelog

All notable changes to this project will be documented in this file.

This is the Foundry V13 line (0.x). The Foundry V14 line (14.x) is on the `main` branch.

## [Unreleased]

## [0.5.0] - 2026-11-17

- Added **Shield Regeneration** and **Shield Fast Healing** to actors whose shield is shown: they restore shield points at the start of the creature's turn in combat, like PF1 regeneration and fast healing do for hit points. Regeneration can list damage types that stop it (for example `5/acid, fire`). Both are also Change targets under Health.
- Added **Configure Surges** to the module settings: world-wide surge chance scaling (% per spell level, % per sphere CL), a named surge area with a chance multiplier and flat bonus, and an editable severity table (names, % chance of each band, add or remove bands). Surge cards show the active surge area.
- Added damage min/max buttons to Pathfinder attack cards: set all damage, or one damage line, to the dice's minimum or maximum, with a Reset button. The change is saved on the chat message, so Apply Damage uses it. Setting: Damage min/max buttons.
- The same buttons work on `/d`, `/damage`, `/h`, and `/heal` cards, for the whole roll or for each dice group in the roll breakdown.
- Shield and burn cards in the Health Monitor log go to GMs and to players who can see that actor. Other players no longer receive them.
- Turned on the module socket channel, so Astral shield and burn changes float over tokens for every connected player.
- Roll Stats no longer counts Take 10, Take 20, or manually entered d20 results.

## [0.4.3] - 2026-10-19

- Added Astral energy shields with actor-sheet controls, damage absorption, and token health bar integration.
- Added burn tracking beside nonlethal damage, including unconsciousness and recovery handling.
- Added shield and burn health tracking, including floating token messages and Koboldworks Health Monitor integration.
- Added Astral Sphinx support, including its energy field and related combat behavior.

## [0.3.0] - 2026-10-02

- Added Mananite ammunition support, settings, and an API for managing crystals and caster guns.
- Expanded the Spheres of Guile feature with extra sphere registration.
- Added the Roll Stats GM tool for recording and analyzing PC d20 rolls, damage, and healing.

## [0.2.0] - 2026-09-29

- Added Spheres of Guile support, with a Spheres-tab display for skill talents and ranks.
- Added module settings and an API for the Guile feature.

## [0.1.0] - 2026-07-11

- Initial release with Surge Chance features.
