# 20-1 Specialty Progression Reconciliation Checklist

Last updated: 2026-05-03

Status: implementation checklist. This file tracks the correction pass for `20-command-staff-tech-tree.md`, specifically the drift where old tier progression remained player-facing beside the new Specialty/Department system.

## Goal

Reconcile progression around the roadmap's existing language:

- Specialties / specialty branches are the player-facing choice layer.
- Departments are the functional ownership layer.
- Officers are unique authority roles.
- Bridge terminals are the physical station footprint.
- Tiers remain internal pacing/save compatibility scaffolding where needed, but should not compete as a second visible roadmap.

## Product Checklist

- [x] Progress button opens a `Specialties` panel, not the old `Station Progression` tier roadmap.
- [x] Remove `Next Tier Unlocks` from the Progress modal.
- [x] Remove `Tier Roadmap` from the Progress modal.
- [x] Show active specialty branch at the top of the panel.
- [x] Show completed specialties in the panel.
- [x] Show available next specialty choices.
- [x] Show future/locked specialty choices with branch requirements using roadmap language, not tier-roadmap language.
- [x] Keep the Crew panel as hire/fire only for currently available staff.
- [x] Hide granular/deferred roles from the Crew panel until they have distinct gameplay.
- [x] Keep deferred roles internal for save/sprite compatibility unless removing them is safer later.

## Simulation Checklist

- [ ] Add department state derived from specialty progress, officers, bridge rooms, and terminals.
- [ ] Track department active/inactive status and reason.
- [ ] Implement officer activation rule: hired officer + active Bridge + matching terminal + reachable officer.
- [x] Stop using `unlockTier` as the player-facing specialty requirement.
- [x] Replace specialty availability with branch-order rules.
- [x] Keep only one active specialty at a time.
- [x] Keep old tier state for save compatibility and existing progression counters during this correction pass.
- [ ] Move room/module availability toward specialty/department ownership.
- [ ] Keep Command/basic survival content always available.
- [ ] Keep existing saves from crashing and infer sensible command/specialty state.

## Role Cleanup Checklist

- [x] Keep surfaced core roles: Captain, Cook, Botanist, Assistant.
- [x] Keep surfaced branch roles when unlocked: Sanitation Officer, Janitor, Security Officer, Security Guard, Industrial Officer, Mechanic Officer, Technician, Engineer, Medical Officer, Doctor, Navigation Officer, Comms Officer.
- [x] Defer/hide `Cleaner` until distinct from Janitor.
- [x] Defer/hide `Mechanic` until distinct from Technician/Engineer.
- [x] Defer/hide `Welder` until exterior/hull repair is distinct.
- [x] Defer/hide `Nurse` until medical triage has role separation.
- [x] Defer/hide `EVA Engineer` until distinct from Engineer/EVA Specialist.
- [x] Defer/hide `Flight Controller` until traffic terminal work is concrete.
- [x] Defer/hide `Docking Officer` until distinct from Navigation Officer.

## First Branch Checklist - Sanitation

- [x] Sanitation branch card communicates terminal, officer, staff, and objective.
- [x] Sanitation branch unlocks Sanitation Officer and Janitor hiring.
- [x] Sanitation branch does not show Cleaner in Crew panel yet.
- [x] Sanitation branch completion is not just a timer if a branch objective can be safely added.
- [ ] Sanitation department active state checks officer + bridge + terminal + reachability.
- [ ] Sanitation overlay/policy copy points to the Sanitation department rather than tiers.

## UI/Copy Checklist

- [x] Replace `Requires Tier N` specialty copy with branch requirements.
- [ ] Replace build/tool lock copy where practical with department requirements.
- [x] Remove visible tier-roadmap copy from the progression modal.
- [ ] Keep quest/task strip compatible, but prefer active specialty language when a specialty is selected.
- [x] Crew Hiring panel uses personnel-card layout instead of flat text blocks.
- [x] Crew Hiring role cards show role sprites from the command staff atlas.
- [x] Move Crew Hiring out of a modal and into the right-side palette.
- [x] Hire buttons arm a placement tool instead of immediately spawning staff.
- [x] Clicking a valid station tile places the hired crew member there.
- [x] Fire buttons remain immediate roster actions in the Crew palette.
- [x] Specialty cards cost credits before research begins.
- [x] Specialty branches require hiring the department officer before unlocking deeper branch choices.
- [x] Do not introduce new labels like `Directive`.

## Test Checklist

- [x] `npm run build` passes.
- [x] `npm run test:sim` passes.
- [x] Browser reload shows `Specialties` panel without `Next Tier Unlocks`.
- [x] Browser reload shows `Specialties` panel without `Tier Roadmap`.
- [x] Browser Crew panel hides deferred locked roles.
- [x] Browser Crew panel shows only currently hireable roles.
- [x] Selecting a specialty keeps other branches unavailable while active.
- [ ] Completing a specialty reopens next branch choice.

## Implementation Notes

- Preferred first pass: correct visible UI and role surfacing before deeper content-gate migration.
- Use existing `SpecialtyId`, `StaffRole`, and command state where possible.
- Do not delete old tier compatibility state in this pass.
- Do not rename to `Directive`.
