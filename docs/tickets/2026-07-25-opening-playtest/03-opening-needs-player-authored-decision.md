# Make the First Five Minutes Require a Player-Authored Decision

**Priority:** P1 design slice; lead review required

## Problem

The opening is legible enough to watch but not yet compelling to play. The stock station can automatically earn the first 500-credit threshold while the player does nothing. Meals and supplies deplete, but their initial buffers are large enough that the player can watch several days pass before acting. Tier 1 arrives simply because a visitor enters.

The best existing ingredients are now visible:

- pod demand for food, supplies, freight, fuel, and repair
- prepared meal purchasing versus eventual local production
- travel-supply pricing and restocking
- site-specific supply, retail, repair, and solar modifiers
- optional capital projects with advances and awards

They need to be composed into one early choice rather than four parallel systems.

## Proposed slice

After the first two free demonstration pods, present a real operating constraint:

1. The player has enough cash and stock to support only two of three immediate opportunities: food buffer, retail restock, or a small fuel/repair capability.
2. The next traffic bank visibly forecasts its likely demand mix.
3. The player chooses where to invest through world construction or the existing focused shop/project controls.
4. The chosen service attracts/serves matching pods better; the neglected service produces visible missed revenue rather than instant catastrophe.
5. The first capital project should reinforce the choice with an advance, not dictate a linear quest.

## Guardrails

- Do not add manual approval for every pod.
- Do not pause on approaching traffic.
- Do not solve the opening with a modal tutorial or checklist of forced clicks.
- Do not make the recommended charter objectively best; it should be balanced and forgiving, while other sites create recognizable economic openings.
- Failure should cost opportunity, rating growth, and some credits before it threatens crew survival.

## Acceptance criteria

- Within 90 simulated seconds, the player sees at least two mutually competing investments with understandable costs and expected benefits.
- A no-input run earns materially less and grows rating more slowly than a competent player run.
- Two reasonable opening strategies are viable and visibly different, for example food + retail versus food + fuel.
- The site modifier changes at least one break-even decision the player can observe in the UI.
- A five-minute playtest can answer: `What did I choose? What did I give up? What will I build next?`

## Suggested implementation boundaries

- tune initial inventory and pod demand in simulation content/config
- expose next-bank demand forecast through the existing watch card
- preserve the current economy ledger as the source of truth
- use existing capital projects; revise terms rather than building a new quest framework
