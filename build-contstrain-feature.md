# Directional Docking & Structural Expansion – MVP Specification

## Overview

This feature introduces directional economic pressure and distance-based structural cost to create meaningful layout decisions.

Goals:
- Make expansion direction strategically meaningful.
- Support early-game specialization by ship/visitor type.
- Keep implementation lightweight (grid rules + simple math).
- Avoid complex physics systems.

---

# 1. Station Core & Distance Cost

## Core Tile

- The station contains a single **Core** tile.
- This core is the reactor of the vessel, and is the structural center of the ship
- All built tiles must remain connected to the Core
- This tile is placed at the center of the starting grid, is a 3x3 of walls and doors with a center yellow tile that crew can service. 

## Distance-Based Build Cost

Building cost increases with Manhattan distance from the Core.

Formula:

distance = abs(tile.x - core.x) + abs(tile.y - core.y)
finalCost = baseCost + (distance * distanceMultiplier)

Where:
- `distanceMultiplier` is configurable in code, but please make it small for now so that building is forgiving
- Applies to all material costs

### Design Intent

- Compact builds are cheaper.
- Expanding toward map edges becomes increasingly expensive.
- Reaching lucrative traffic lanes creates meaningful economic tradeoffs.

---

# 2. Space Lanes (Directional Traffic)

## Concept

Each map edge (North, East, South, West) has a seeded traffic distribution for the entire run.

Example:

North:
  Traders: 0.6
  Tourists: 0.2
  Industrial: 0.1
  Military: 0.1

West:
  Tourists: 0.5
  Traders: 0.2
  Military: 0.2
  Industrial: 0.1

- These weights are generated at game start.
- They remain stable for the duration of the run.

### Design Intent

- Each direction becomes economically distinct.
- Different seeds create different optimal expansion strategies.
- Players adapt to geography rather than building the same layout every run.

---

# 3. Dock System

## Dock Placement Rules

Docks must:

- Be placed on an outer hull tile (adjacent to vacuum).
- Have an orientation (facing outward).
- Have a clear approach lane in front of them. Must not be blocked by other rooms (ships must have a clear path, or else they abort)

Approach Lane Requirements:

- A configurable number of vacuum tiles (`approachLength`, e.g., 3–6) directly in front of the dock.
- No station tiles may occupy these tiles.
- If obstructed, placement is invalid.

Dock is assigned to a space lane based on which edge it faces (N/E/S/W).

## Dock Type Filtering

Each dock has an "Allowed Ship Types" checklist.

- Only ships of enabled types may dock there.
- Default can be empty or one preselected type.
- Player can modify allowed types at any time (MVP: no cooldown required).
- This should be done by clicking on the dock and selecting in a popup which ships are allowed

### Design Intent

- Player can specialize early (e.g., Traders only).
- Supports focused station builds.
- Enables economic identity per dock cluster.

---

# 4. Ship Spawning

## Spawn Logic

When spawning a ship:

1. Select an edge (uniform or weighted by `trafficVolume`).
2. Randomly select a ship type using that edge’s traffic weights.
3. Find an eligible dock on that edge that allows that type.
4. If found, assign ship.
5. If no dock found:
   - Ship skips
6. if found but all eligible docks are full
    - ship queues for a maximum amount of time, near edge of screen, and either gets the chance to dock on its own if a spot opens up, or will leave if no docks available when the timer expires.
    - if a ship has to leave, apply a station rating penalty

## Dock Capacity

- Each dock can service one ship at a time.
- Additional ships queue in space.

Rating penalty:
- As noted above, eligible Ships leaving due to lack of dock reduce reputation or score slightly.

---

# 5. Visitor & Service Differentiation

Each ship type expects specific station services.

Example mapping:

- Traders → Market, Storage, Cafeteria
- Tourists → Lounge, Cafeteria
- Industrial → [storage, industrial facility, - to be implemented]
- Military → [ mechanic shop, barracks, cantina, - to be implemented]

If required services are missing or insufficient:
- Visitor happiness decreases.
- Payments or rewards are reduced.

### Early Specialization Requirement

It must be viable to:
- Enable only one ship type (by only allowing a certain type in the docks).
- Build only the services required for that type.
- Operate sustainably in early game.

---

# 6. Walk Distance Dissatisfaction

Visitors lose happiness if they walk too far from dock to target service.

Rule:

if pathLength > comfortThreshold:
    happiness -= (pathLength - comfortThreshold) * penaltyRate

Where:
- `comfortThreshold` and `penaltyRate` are configurable.

### Design Intent

- Encourages intelligent zoning.
- Rewards placing service clusters near docks.
- Discourages inefficient sprawling layouts.

---

# 7. UI Requirements

## Dock Panel

Each dock shows:
- Orientation (N/E/S/W)
- Assigned lane
- Allowed ship types checklist
- Current ship / queue length (optional)

## Placement Preview

Dock placement must:
- Show valid/invalid state.
- Highlight required approach tiles.
- Display error if blocked.

## Optional Lane Info Panel

At game start:
- Display lane traffic weights for each edge.
- Helps player plan specialization.

---

# 8. Configuration Parameters

- distanceMultiplier
- approachLength
- comfortThreshold
- penaltyRate
- maxQueueTime
- Per-edge trafficWeights[type]
- Per-edge trafficVolume (optional)

---

# 9. Acceptance Criteria

- Two different seeds produce noticeably different optimal expansion directions.
- Player can specialize in one ship type early and succeed.
- Distance from Core increases construction cost in a visible way.
- Dock placement cannot be buried inside station.
- Long walk distances measurably reduce visitor happiness.
- Lack of appropriate dock capacity results in ship queueing and possible penalties.

---

# 10. Non-Goals (MVP Scope)

- No advanced physics simulation.
- No complex oxygen diffusion changes.
- No dynamic traffic weight changes mid-run.
- No structural stress simulation beyond distance-based cost.