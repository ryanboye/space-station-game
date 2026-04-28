# `scope/` — Pre-Implementation Scope Documents

Scope documents live here. They describe **what** a feature is, **what it isn't**, and **what decisions still need to be made** — before anyone writes an implementation plan.

## What this folder is for

Each `.md` file in `scope/` is a **scope document** — a working document for one feature. It answers:

- What is the feature, in player-facing terms?
- What does it touch in the existing game? (Citations into `docs/` are encouraged.)
- What's explicitly in scope, and explicitly out?
- What are the open questions / unresolved decisions?
- What are the integration points with other in-flight scopes?

A scope document does **not** answer:

- "How do we build this?" → that's an implementation plan, comes later.
- "When does this ship?" → that's roadmap/sequencing.
- "What's the exact data shape?" → that's design, comes after scope alignment.

## Lifecycle

```
scope/  →  plan  →  PR(s)
  │         │         │
  evolves   ships     ships
  via       once      iteratively
  PRs                
```

A scope doc lives here while the team aligns on what the feature *is*. Once scope is locked, the doc gets a "Status: locked" header and becomes a reference. The implementation work happens against a separate plan or design doc.

If a scope is abandoned, the doc stays here with "Status: abandoned" and a one-line postmortem. Zombie scopes confuse future agents — keep the graveyard explicit.

## How to write one

Use the existing scopes (`system-map.md`, `contracts.md`) as templates. Common sections:

- **TL;DR** — one paragraph
- **The frame** — what the player experiences
- **In scope** — bulleted list
- **Out of scope** — bulleted list (often more important than in-scope)
- **Touches in the existing game** — `docs/` citations
- **Integration points** — other scopes this depends on or affects
- **Open questions / decisions needed** — explicit, numbered, the team chooses
- **Player-facing examples** — 2–3 concrete scenarios so reviewers can imagine play

## Difference from `docs/`

| Folder | Purpose | Audience |
|---|---|---|
| `docs/` | How the game works *today*. Stable reference for agents picking up tasks. | Future agents, contributors onboarding |
| `scope/` | What features we're considering for *tomorrow*. Working documents, evolves under review. | Designers, reviewers, owner approval |

When a scoped feature ships, `docs/` gets updated to reflect the new state of the world. Scope documents may then be retired or kept as historical context with a "shipped" marker.

## Conventions

- Filename = feature kebab-case (`system-map.md`, not `SystemMapDesign.md`).
- One scope per file. If a scope grows multi-part, split with numeric prefixes (`01-system-map-overview.md`, `02-system-map-factions.md`).
- Cite `docs/*` and source files generously. If a scope doc says "this changes how `LaneProfile` works," it should link `docs/07-docks-ships.md` and the underlying `sim.ts:262`.
- Keep player-facing examples concrete. "After T6, when the player clicks the system-map button, they see…" is more useful than "the system map provides spatial context."
- Status header at the top: `**Status:** drafting | aligning | locked | shipped | abandoned`.

## Active scopes (as of 2026-04-27)

- `system-map.md` — multi-scale map (station / outer hull / star system). Currently *aligning* (v2 incorporates seb review). **v1 milestone with `contracts.md`.**
- `contracts.md` — external nudges with breach penalties. Currently *aligning* (v2 incorporates seb review). **v1 milestone with `system-map.md`.** Depends on `system-map`.
- `dock-migration.md` — berths as proper U-shaped buildings with size matching, capability-tag modules, and airlocks as a separate exterior-door primitive. Currently *aligning* (v2 incorporates seb review). **v2 milestone — ships after `system-map` + `contracts` v1 lands.**
