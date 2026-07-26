# Reconcile Global Goals, Tiers, Rating, and Projects

**Priority:** P1 design cleanup; lead review required

## Problem

The opening currently presents several progression languages at once:

- Global Goal: traffic revenue plus visitors served
- Tier unlock: first arrival, then credits plus visitor archetypes, then berth turnarounds
- Station rating: cumulative quality/reputation
- Capital projects: optional advances and completion awards

Each system is individually plausible, but the player cannot tell which is the main arc. In the playtest, Tier 2 unlocked while the Global Goal was still incomplete. That makes the cards look contradictory even when their underlying math is valid.

## Recommended hierarchy

- **Rating:** access and market quality. It changes who is willing to visit and the value/risk mix.
- **Credits:** player agency. They buy physical capacity and services.
- **Projects:** optional financing and medium-term challenges. They should be the Prison Architect-style contract layer.
- **Tiers:** broad capability eras, unlocked by demonstrated operation, not a second objective checklist.
- **Global Goal card:** show the currently accepted project or the next self-chosen station ambition, not an unrelated fixed campaign ladder.

## Acceptance criteria

- One compact progression surface explains the relationship among rating, credits, projects, and the next capability era.
- Completing or declining a project never blocks core construction indefinitely.
- Tier transitions cannot appear to contradict the active overarching goal.
- Early tiers unlock categories; individual modules remain visible with their cost and unmet requirements wherever possible.
- Save migration preserves existing tier, project, and rating progress.

## Open design decision

Choose whether the three current Global Goals become default capital projects or are removed. Do not leave both systems with nearly identical targets.

## Likely ownership

- progression presentation in `src/main.ts`
- unlock definitions in `src/sim/content/unlocks.ts`
- capital projects and economy helpers in `src/sim/sim.ts`
- design docs `docs/09-progression.md` and `docs/36-opening-economy-legibility-and-growth.md`
