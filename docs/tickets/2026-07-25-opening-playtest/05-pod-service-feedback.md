# Make Pod Service Outcomes Readable in the World

**Priority:** P2 feature slice

## Problem

Dock labels now communicate incoming wants, but the player still has to infer whether food, shopping, freight, fuel, or repair actually succeeded. The collapsed pod panel protects world space, but it also removes the only persistent progress readout. The ledger proves revenue later, disconnected from the dock that caused it.

## Desired behavior

Keep the world as the primary feedback surface:

- On arrival: a small dock chip shows travelers and requested services.
- During the visit: icons fill/check as each service succeeds; a blocked service shows one short cause.
- On departure: a result chip remains for several seconds with gross revenue, missed service icons, and rating effect.
- Clicking the chip opens the relevant dock inspector, not a global manifest workflow.

Use the existing dock economy feedback layer and berth chips. Do not add another permanent fleet panel.

## Acceptance criteria

- A player watching one pod can name what it wanted, what it received, what failed, and what the station earned.
- Failure copy identifies the actionable bottleneck: no stock, no fixture, no fuel connection, no repair capacity, congestion, or timeout.
- Multiple simultaneous pods aggregate cleanly at normal zoom without overlapping labels.
- Result chips fade and remain optional; the economy ledger retains history.
- Small craft remain automatic and never enter berth contract approval.

## Likely ownership

- `src/render/dock-economy-feedback.ts`
- pod service completion in `src/sim/sim.ts`
- dock/ship label rendering in `src/render/render.ts`
