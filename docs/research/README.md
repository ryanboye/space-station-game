# Design Research Corpus (July 2026)

The full working research behind the 2026-07-18 direction decision. **`../../DESIGN.md` is the distilled source of truth** — read it first; come here when you need the reasoning, the scores, the receipts, or the deferred options. Consult this corpus before proposing new systems: most ideas have already been evaluated and scored.

| Doc | One line |
|---|---|
| `ASSESSMENT-SYNTHESIS.md` | **THE decision map (v3)** — the tracks-and-identity assessment we aligned on: the two gaps (actuator/variance), the 7 player-behavior loops, our positioning, the six paths (A/B/C/D/G/F) scored side by side, the mechanics catalog, the master question. Start here. |
| `AUDIT-A-CODE-INVENTORY.md` | Line-by-line code autopsy of pre-port-ops `main`: every system verdicted SUBSTANTIVE/LATENT/DECORATIVE; the "sensors + displays but no actuators" reframe; the 7 cheap wires ranked. |
| `AUDIT-B-GENRE-TAXONOMY.md` | The genre research — 22 management/colony/base-building games analyzed for loops, variance sources, and why-build-where. |
| `TAXONOMY-REVIEW.md` | Peer review that re-sliced the taxonomy into the 7 player-behavior loops (adopted in SYNTHESIS v3) and repositioned our game. |
| `SPACE-STATION-DESIGN-SYNTHESIS.md` | Finn's design synthesis — the "commitment engine" framing, direction slate, randomness rules, presentation principles. |
| `SPACE-STATION-INTEGRATED-SLICE-SPEC.md` | Finn's port-ops slice spec — the milestone-gated plan the shipped slice was built from (admission, turnaround, bound economy, staffing, earned automation). |
| `SPACEGAME-DETERMINISM-RX.md` | The determinism law — why adding rules to a deterministic optimization doesn't create choice; the six frozen variety axes; the wiki-test razor. |
| `SPACEGAME-DEEP-RX.md` | The dead-rating-bus finding — quality signals route to a meter with no consumer — and the literal keystone fix. |
| `SPACEGAME-COREloop-RX.md` | Core-loop prescription pass 2 — "109 incidents, zero drama"; making consequences visible. |
| `SPACEGAME-COREloop-SPEC.md` | "The crowd is the game" SPEC v4 — measured dossier (extinction bug, dock zones, fake sliders) + the crowd-first slice that preceded port-ops. |
| `SPACEGAME-COLONY-REVIEW.md` | The first colony-sim design review — built-systems-without-consequence diagnosis; legibility strengths and lies. |

These are point-in-time working documents; line numbers and measurements refer to pre-port-ops commits (mostly `origin/main` @ `171816b` and earlier). The port-ops slice has since changed admission, docking, the economy, staffing, and progression — trust `DESIGN.md` and the code for current behavior.
