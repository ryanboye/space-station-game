# Station Portfolio Program

Status: implementation handoff corpus
Date: 2026-07-26

## Purpose

This folder turns the station-identity discussion into bounded implementation
contracts. It is written for an implementation agent branching from `main`.
The lead design decision is already made:

> The player does not choose a permanent class. They build a physical business,
> observe its operation, and gradually create a station identity through capital
> allocation.

The game develops along three independent axes:

- **Scale:** pods -> berths -> terminals and districts.
- **Portfolio:** hospitality, trade, engineering, science, or strategic service.
- **Permanence:** transient stop -> staffed port -> living settlement.

Shared infrastructure supports every portfolio. Portfolio facilities determine
why traffic comes, what the player does with it, and how the station earns money.

## Authority And Related Research

Read these before implementing a package:

1. `00-shared-contracts.md` - invariants every package must preserve.
2. `01-player-authored-opening.md` - the first playable decision and immediate priority.
3. The selected portfolio document.
4. `08-implementation-packages.md` - dependency order and agent handoffs.
5. `../tickets/2026-07-25-opening-playtest/README.md` - current P0 defects.
6. `../33-prison-architect-depth-catalogue.md` - deeper facility and operations research.
7. `../35-port-infrastructure-evolution.md` - Pod Dock and berth contracts.
8. `../36-opening-economy-legibility-and-growth.md` - current economy implementation.

Code is the source of truth when implementation and prose disagree. Report the
conflict instead of silently choosing a new product direction.

## Status Vocabulary

- **Live:** present and usable in the current build, although tuning may remain.
- **Partial:** code and presentation exist, but the loop is incomplete, misleading,
  or not yet consequential.
- **New:** no coherent player-facing operation exists.

## Portfolio Index

| File | Portfolio | Current maturity | First physical operation |
|---|---|---|---|
| `02-hospitality-and-tourism.md` | Food, drink, rest, entertainment, lodging | Partial, broadest existing base | Feed pod travelers |
| `03-trade-and-logistics.md` | Retail, courier work, warehousing, cargo | Partial | Sell travel supplies and handle courier lots |
| `04-engineering-and-ship-services.md` | Fuel, minor repair, overhaul, salvage | Partial | Refuel and repair pods |
| `05-science-and-exploration.md` | Observation, samples, research contracts | New with several stub assets | Process a survey project |
| `06-strategic-and-emergency.md` | Security, rescue, customs, military readiness | Partial systems, no coherent economy | Operate a secure emergency berth |
| `07-residents-and-civic-life.md` | Housing and permanent station life | Partial and orthogonal | House residents with 24-hour services |

## Recommended Product Sequence

1. Make the current simulation truthful. Complete P0 opening tickets before adding
   another portfolio dependency.
2. Ship the player-authored pod opening with three viable investments:
   hospitality, commerce, or engineering.
3. Deepen those three paths until each has a visible operation and failure state.
4. Make the first medium berth a capital amplifier rather than a tier reward.
5. Add operating rhythm: physical roles, service hours, stock buffers, maintenance,
   and commuter tenant staff.
6. Add residents as a permanence choice.
7. Add science and strategic portfolios after shared facility and contract machinery
   is stable.

Do not implement all portfolio documents in parallel. The first three share traffic,
inventory, service-session, economy, and UI code. Use the package boundaries in
`08-implementation-packages.md`.

## Definition Of A Playable Portfolio

A portfolio is not complete because its room and modules can be placed. It must have:

1. A visible demand source.
2. A physical facility recipe.
3. Specific staff or an explicit tenant operating model.
4. Located inventory or another real input.
5. Actors or ships that reserve, travel to, and use the facility.
6. Time-based work with finite capacity.
7. A categorized economic result.
8. At least two valid expansion responses to pressure.
9. A recoverable failure state.
10. World feedback that explains success, waiting, and failure without a debug panel.

If any item is missing, label the feature partial rather than granting synthetic
completion or revenue.
