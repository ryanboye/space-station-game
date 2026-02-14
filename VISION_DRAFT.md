# Expanse Station Sim — Vision Draft

## 1) Vision
A systemic station-management sim where the player designs a living orbital habitat, balances interdependent infrastructure, and survives complexity growth.  
The fun comes from elegant planning under pressure: stable systems early, compounding fragility later, recoverable but costly cascades.

## 2) Design Pillars
- Systems over scripts: outcomes emerge from connected simulation, not random disasters.
- Logistics matters: items, services, and people physically move through space.
- Capacity is local, not just global: bottlenecks happen at doors, corridors, queues, and staffing points.
- Every room has purpose: each building consumes and/or produces something meaningful.
- Failure is legible: players can see why a system failed and how to fix it.
- Expansion creates new classes of risk, not just bigger numbers.

## 3) Core Gameplay Loop
1. Build hull, corridors, zones, and room network.
2. Add furniture/modules to activate room functions.
3. Hire and assign crew; admit residents; receive visitors.
4. Run logistics chains that convert raw inputs into survivability and profit.
5. Handle incidents, shortages, and local overload.
6. Expand station footprint and specialization while maintaining resilience.

## 4) Simulation Layers
- People layer: crew, residents, visitors, detainees/patients.
- Service layer: food, oxygen, sanitation, security, healthcare, recreation.
- Logistics layer: hauling jobs, storage buffers, queueing, route congestion.
- Utility layer: power, atmosphere, water, waste, heat.
- Economy layer: credits, payroll, imports, exports, market demand.
- Governance layer: zoning, access, policy sliders, staffing priorities.

## 5) Population Model
- Crew are employees with roles, wages, fatigue, and needs.
- Residents are persistent inhabitants with routines and long-term satisfaction.
- Visitors are transient demand spikes and revenue opportunities.
- Hiring requires available private quarters capacity (bed + hygiene access).
- Severe unmet needs can cause injury, crime, desertion, or death.
- Dead bodies become logistics entities and must be moved to morgue.

## 6) Needs and Consequences
Needs per person: hunger, rest, hygiene, oxygen, safety, morale.

Consequences:
- Hunger low: productivity drop, aggression rise.
- Rest low: slower work, mistakes, absenteeism.
- Hygiene low: disease chance, morale decline.
- Oxygen low: blackened sprite state, then death.
- Safety low: fights/theft probability rises.
- Morale low: churn, sabotage, refusal behavior.

## 7) Room and Building Network (Ideal Set)
Every room has activation requirements, staffing profile, utility dependency, and I/O or effect.

| Room | Inputs | Outputs/Effect | Key Requirements |
|---|---|---|---|
| Dock | Ship traffic | Visitors, imports/exports | Dock area, access path |
| Cargo Bay | Imports | Stored goods | Powered storage racks |
| Storage | Any goods | Buffering, route efficiency | Shelves/racks |
| Hydroponics | Water, power | Raw food, bio-waste | Hydro trays, tech staff |
| Kitchen | Raw food, water, power | Meals | Stoves/workstations, cooks |
| Cafeteria | Meals | Hunger relief, visitor revenue | Tables/seats, service access |
| Dormitory | Crew assignment | Rest recovery, hire capacity | Beds (1 per person) |
| Hygiene | Water, power | Hygiene recovery | Showers/toilets |
| Life Support | Power, filters | Atmosphere distribution quality | Duct nodes, technicians |
| Oxygen Plant | Water, power | Oxygen generation | O2 processors |
| Water Recycler | Waste water, power | Clean water | Recycling units |
| Reactor | Fuel/maintenance, staff | Power | Control consoles |
| Battery Room | Power | Buffer against spikes | Battery banks |
| Security Office | Staff | Patrol coverage, response speed | Desks/monitoring |
| Brig | Security throughput | Crime containment | Cells, secure doors |
| Medbay | Med supplies, power, staff | Injury/disease treatment | Beds, med stations |
| Morgue | Corpses | Sanitation/stability | Cold storage |
| Market Hall | Trade goods, visitors | Credits, morale | Stalls, access/public zone |
| Workshop | Materials, power | Parts/trade goods/tools | Benches, workers |
| Recreation | Power | Morale stabilization | Leisure furniture |

## 8) Furniture/Modules (Prison Architect-style depth)
Rooms are activated by module requirements.
- Dorm: beds, locker (optional morale buff).
- Kitchen: stove + prep station + sink.
- Cafeteria: table seating capacity.
- Hydroponics: grow trays.
- Security: patrol terminal.
- Medbay: treatment beds.
- Workshop: benches.
- Market: stalls.

Rule: room exists as painted zone; room functions only when required modules exist and are reachable.

## 9) Logistics Economy Chains
Primary chains:
- Water -> Hydroponics -> Raw Food -> Kitchen -> Meals -> Cafeteria -> Hunger resolved.
- Water/Waste -> Recycler -> Clean Water -> Hydro/Hygiene/O2.
- Materials -> Workshop -> Trade Goods -> Market -> Credits.
- Credits -> Imports (food, parts, meds, fuel) -> survivability and growth.
- Death/Injury -> Transporter job -> Morgue/Medbay -> morale/sanitation stability.

Buffers:
- Storage quality and placement determine resilience against spikes.
- No buffer means oscillation and frequent local collapse.

## 10) Crew Roles and Priority Control
Roles:
- Logistics, Cook, Grower, Engineer, Security, Medic, Janitor, Technician.

Priority model:
- Player sets global and per-room priorities.
- Crew assignment respects skills, proximity, urgency, fatigue.
- Manual focus modes: Balanced, Food, Utilities, Security, Health, Trade.
- Shift scheduling can be added later for day/night staffing rhythms.

## 11) Security and Incident System
Incident seeds:
- Theft, fights, trespass, contraband flow, vandalism.

Pipeline:
- Detection -> dispatch -> intervention -> resolution (warn, escort, detain, treat).

Modifiers:
- Security coverage radius, staffing, line-of-sight, door permissions.
- Overcrowding and unmet needs increase incident rates.
- Repeat offenders and hotspots emerge by layout and policy.

## 12) Atmosphere and Survival
- Atmosphere is room-network based, not just global percent.
- Hull breaches and bad dooring create decompression sectors.
- Oxygen plant produces; life support distributes; leaks consume.
- Low oxygen causes visible distress and death timers.
- Corpses/sanitation neglect amplify disease and morale penalties.

## 13) Zoning and Access
- Public, Private, Staff-Only, Secure, Quarantine zones.
- Visitors should never route through private staff quarters by default.
- Access doors can enforce badge levels.
- Bad zoning creates queue pressure, trespass, and service starvation.

## 14) Economy and Demand
Revenue:
- Visitor taxes/fees, market trade, contracts, exports.

Costs:
- Payroll, imports, maintenance, fuel, medical, incident damage.

Demand dynamics:
- Ship arrivals create variable but bounded demand shocks.
- Market demand fluctuates by station reputation and specialization.
- Reputation linked to safety, service quality, and throughput reliability.

## 15) Station Identity Paths
- Trade Hub: market/workshop/logistics optimized.
- Civic Habitat: resident welfare, low unrest, high stability.
- Security Outpost: strict access, high enforcement, detention throughput.
- Frontier Survival: scarce imports, heavy self-sufficiency.

Each identity changes multipliers, contracts, visitor mix, and strategic pressure.

## 16) Failure Cascades (Desired)
Example cascade:
1. Hydro bottleneck reduces raw food.
2. Kitchen starvation reduces meal output.
3. Cafeteria queues explode.
4. Hunger lowers morale and raises fights.
5. Security overload delays response.
6. Injuries fill medbay, morgue backlog grows.
7. Credits fall due to poor visitor service and damage costs.
8. Imports stop, utility reliability drops, survival risk escalates.

Recovery should be possible via clear levers:
- Emergency imports, policy throttles, priority reassignment, temporary closures, zone reroutes.

## 17) Information Design (Player Clarity)
- Per-system health bars: Food, Air, Water, Power, Security, Health, Economy.
- Tooltips with causal explanation: "Kitchen inactive: no cook, no power."
- Heatmaps: congestion, crime risk, oxygen deficit, service reach.
- Throughput panel: queue lengths, wait times, conversion rates, exits/min.
- Alert feed grouped by root cause, not symptom spam.

## 18) AI Behavior Targets
- Agents reserve destinations to reduce clumping.
- Separate queue nodes from service nodes.
- Soft collision + occupancy caps + reroute behavior.
- Patience and fallback state machines to prevent eternal deadlocks.
- Job system uses pull-based tasks with expiration and reassignment.

## 19) Win/Lose Philosophy
- No hard "you lose" from a single event.
- Failure is prolonged systemic decline unless corrected.
- Success is sustained operation at scale under volatile demand.
- Late game should feel like orchestration under constant tradeoffs.

## 20) Art, Sprites, and Placeholder Asset Plan

### 20.1 Goals
- Keep readability first, aesthetics second.
- Ensure every gameplay-critical object is visually legible at a glance.
- Support immediate prototyping with placeholders, then seamless upgrade to final art.

### 20.2 Visual Layers (render order)
1. Base tile (space/floor/wall/door/dock)
2. Room tint overlay
3. Furniture/module sprite (or fallback marker)
4. Zone/access overlay (optional toggle)
5. Agents (crew/residents/visitors)
6. FX overlays (alerts, low oxygen, blocked path, incident highlights)

### 20.3 Furniture Representation Strategy
Phase A (immediate): no-sprite module markers
- Draw a centered mini-plate and a letter code.
- Examples: Bed `B`, Table `T`, Stove `K`, Grow Tray `G`, Locker `L`, Terminal `M`, Med Bed `+`.
- Inactive/invalid module marker tints red.

Phase B (placeholder sprites)
- Replace letter markers with small atlas sprites while keeping same module IDs.
- Marker fallback remains available via debug toggle.

Phase C (final art)
- Swap placeholder atlas with production atlas using identical sprite keys.

### 20.4 Placeholder Asset Sourcing
Preferred sources:
- Kenney (CC0)
- OpenGameArt (CC0/compatible packs only)
- itch.io free pixel packs with explicit permissive license

Asset ingestion rules:
- All imported art stored under `/public/assets/placeholders`.
- Add `/public/assets/placeholders/LICENSES.md` with:
  - source URL
  - author
  - license
  - attribution requirement status

### 20.5 Sprite Specs
- Tile size: 16x16 (authoring standard)
- Agent sprites: 8x8 to 12x12 readable dots/mini sprites
- Atlas format: single PNG + JSON map (or hardcoded grid map)
- Palette: limited station palette to keep style coherent
- Directional variants optional (N/E/S/W) for key entities later
