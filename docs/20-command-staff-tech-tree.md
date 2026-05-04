# 20 Command Staff, Bridge, And Specialty Tech Tree

Last updated: 2026-05-03

Status: product and implementation proposal. This captures the command-staff design discussion after the role-lane dispatcher refactor.

## Goal

Turn progression from a fixed checklist into a station-command layer: the player starts with a Captain and a small Bridge, completes one specialty objective at a time, then chooses which department to unlock next. Each department becomes physical through an officer, a bridge terminal, and downstream staff/rooms/policies.

This should make station identity more replayable:

- One run might rush Sanitation to stabilize hygiene and grime.
- Another might rush Industrial to expand production.
- Another might rush Security or Medical because traffic mix and incidents demand it.
- The station should feel managed by departments, not by one invisible universal worker pool.

## Core Design

### Starter Captain And Bridge

The starter layout should include:

- `Bridge` room.
- `Captain` officer.
- `CaptainConsole` module.

The Captain is the station's command anchor. Basic building, survival, traffic, and hiring remain available, but the Bridge gives those systems a physical home and creates a clear place for future management depth.

Starter bridge behavior:

- Captain is hired by default.
- Captain can staff the Captain's Console.
- Captain enables basic Crew Panel, station alerts, and the specialty tree panel.
- If the Captain is away from the console, do not hard-disable the station; instead degrade advanced command efficiency or show a warning once advanced systems exist.

### Choose-One Specialty Progression

Reuse the existing tier spine, but change what tier completion grants:

1. Player chooses one available specialty branch.
2. That branch becomes the active objective/research track.
3. Player completes its tier objective.
4. Completion unlocks that department's officer and/or terminal.
5. Player may then choose the next specialty branch.

Only one specialty is actively being pursued at a time. This keeps progression readable and creates "choose your own adventure" replay value without turning the game into a giant simultaneous checklist.

Important distinction:

- Tiers are pacing gates.
- Specialties are player choices.
- Officers are the staffed authority layer.
- Terminals are the physical station footprint.
- Staff roles are the labor layer.

### Bridge Terminals

Bridge terminals are top-down modules placed in the Bridge room. A terminal can be built before or after hiring the relevant officer, but the department is only fully active when both exist.

Initial terminal set:

- `CaptainConsole`: command overview, alerts, specialty selection.
- `SanitationTerminal`: sanitation officer station, cleaning policy, sanitation overlay depth.
- `SecurityTerminal`: security officer station, surveillance, incidents, brig policy.
- `IndustrialTerminal`: industrial officer station, workshop production, fabrication policy.
- `MechanicalTerminal`: mechanic/engineering officer station, maintenance, repair, system diagnostics.
- `NavigationTerminal`: navigation/traffic officer station, ship routing, docking, future sector/map systems.
- `CommsTerminal`: communications officer station, contracts/messages/distress hooks.
- `MedicalTerminal`: medical officer station, clinic triage, doctors/nurses.
- `LogisticsTerminal`: cargo/inventory routing policy; this is not a "hauler boss", it governs routes and stock policy.
- Later candidates: research, fleet command, atmosphere control, emergency control, records/AI core.

### Officers

Officers should be unique or near-unique role slots, not generic workers. They unlock management depth and advanced staff, but should not be required for basic survival loops.

Initial officers:

- `Captain`: starter command role.
- `SanitationOfficer`: unlocks janitors/cleaners, sanitation policies, sanitation diagnostics.
- `SecurityOfficer`: unlocks guards, brig/security controls, incident response controls.
- `IndustrialOfficer`: unlocks production queues, workshop specialization, industrial staff.
- `MechanicOfficer`: unlocks maintenance techs, repair policy, engineering diagnostics, later EVA repair.
- `MedicalOfficer`: unlocks doctors/nurses, clinic triage policy.
- `NavigationOfficer`: unlocks traffic/docking policy, advanced ship routing.
- `CommsOfficer`: unlocks contracts/messages/research queue hooks later.

Officer activation rule:

`hired officer + active Bridge + matching terminal + officer can reach terminal = department active`

If inactive:

- Do not erase already-built rooms/modules.
- Do not strand basic jobs.
- Disable or degrade advanced policies, overlays, advanced hiring, and automation belonging to that department.

### Operations Staff

The Crew Panel should move from generic hire/fire toward role hiring.

Repeatable operations staff:

- `Cook`: food preparation and food hauling.
- `Cleaner` / `Janitor`: sanitation cleaning jobs.
- `Technician`: indoor maintenance and utility repairs.
- `Engineer`: heavier mechanical/industrial work.
- `SecurityGuard`: incidents, brig, patrol.
- `Doctor` / `Nurse`: clinic work.
- `Botanist`: hydroponics.
- `EVA Specialist`: exterior build/repair.
- `Assistant`: general low-skill helper for allowed overflow.

Do not add `Flex Crew` or `Hauler` as player-facing roles.

Hauling should be handled as task affinity:

- Food hauling belongs first to cooks/botanists/food staff.
- Industrial hauling belongs first to industrial staff/engineers.
- Medical hauling belongs first to medical staff if medical supplies exist later.
- Generic cargo/supply hauling can be performed by any free eligible worker, with priority influenced by their department and current idle state.
- Logistics officer/terminal controls stock policy, route rules, and cargo priority; it does not imply a dedicated hauler caste.

This preserves readable job identity without returning to the old single master queue.

## Specialty Branches

### Captain / Command

Starting branch. Provides the baseline command layer.

Unlocks:

- Bridge room.
- Captain's Console.
- Captain.
- Crew Panel v1.
- Specialty selection panel.
- Basic alerts and Station Ops.

### Sanitation

Purpose: Make entropy manageable through a dedicated department.

Requires:

- Completed prior tier.
- Sanitation Terminal researched/built.
- Sanitation Officer hired and active.

Unlocks:

- Cleaner / Janitor hiring.
- Sanitation overlay and detailed diagnostics.
- Cleaning policy controls.
- Cleaning priority by room or severity.
- Future sanitation upgrades like better tools, waste handling, automated scrubbers.

### Security

Purpose: Make incidents and access control a chosen specialization.

Requires:

- Security Terminal.
- Security Officer.

Unlocks:

- Security Guard hiring.
- Brig/security controls.
- Incident response policy.
- Patrol/coverage diagnostics.
- Later security bots, surveillance, controlled doors.

### Industrial

Purpose: Make production and economy a branch rather than a flat tier unlock.

Requires:

- Industrial Terminal.
- Industrial Officer.

Unlocks:

- Workshop depth.
- Industrial staff/engineers.
- Production queue policy.
- Trade-good throughput controls.
- Future fabrication chains and resource processing.

### Mechanical / Engineering

Purpose: Own station wear, repairs, life-support/reactor maintenance, and later exterior maintenance.

Requires:

- Mechanical Terminal.
- Mechanic Officer.

Unlocks:

- Technician / Maintenance Tech hiring.
- Maintenance overlay depth.
- Repair policies.
- Advanced system diagnostics.
- Later EVA maintenance, debris response, component replacement.

### Medical

Purpose: Make health and permanent habitation a staffed department.

Requires:

- Medical Terminal.
- Medical Officer.

Unlocks:

- Doctor / Nurse hiring.
- Clinic triage policy.
- Patient diagnostics.
- Resident health systems and later epidemics/injury care.

### Navigation / Traffic

Purpose: Make ship flow and station approach a specialization.

Requires:

- Navigation or Traffic Control Terminal.
- Navigation Officer or Docking Officer.

Unlocks:

- Advanced dock/berth policies.
- Traffic routing controls.
- Ship-family scheduling.
- Future starmap/course plotting and station expansion route pressure.

### Comms / Trade / Contracts

Purpose: Give the player external goals without turning the game into a pure contract board.

Requires:

- Comms Terminal or Logistics Terminal.
- Comms Officer or Trade Officer.

Unlocks:

- Contract/message panel.
- Import/export policies.
- Distress/beacon hooks.
- Future diplomacy, faction messages, special visitors.

## Crew Panel UX

Replace the simple `Hire Crew` surface with a panel organized by department.

Panel sections:

- Command Staff: Captain and officers.
- Food & Service: cooks, bartenders, botanists, cleaners/janitors.
- Security & Medical: guards, doctors, nurses.
- Engineering & EVA: technicians, engineers, mechanics, EVA specialists.
- Hiring Queue / Payroll: current hires, salary, role counts, vacancies.

Each role card should show:

- Role name.
- Hire cost.
- Payroll.
- Current count.
- Unlock requirement.
- Primary work lane/task affinities.
- If locked, show the missing officer/terminal/tier.

No visible "flex" or "hauler" role. Free workers can still accept generic hauling as overflow, but the UI should describe this as "free staff may assist with cargo" inside policy/diagnostics rather than as a role identity.

## Tech Tree UX

Add a `Specialties` or `Directives` panel accessible from:

- Captain's Console / Bridge.
- Progression button.
- Station Ops once Captain exists.

Panel behavior:

- Shows current active specialty.
- Shows completed specialties.
- Shows available next choices after current completion.
- Shows locked future choices with requirements.
- Shows required officer/terminal/staff.
- Shows research progress if the branch is in progress.

Research model:

- Research progresses while the Captain or relevant officer is working at the matching Bridge terminal.
- Research can cost credits/supplies/time.
- The active specialty objective can combine research and gameplay proof.

Example:

`Choose Sanitation -> build Sanitation Terminal -> Captain researches Sanitation Operations -> hire Sanitation Officer -> clean X dirty tiles / maintain avg dirt below Y -> Sanitation branch complete -> choose next branch`

## Simulation Model

Add persistent department state:

- `officers`: hired officer role, actor id, active terminal, active/inactive status.
- `departments`: unlocked, researched, active, completed, selected order.
- `activeSpecialtyId`: current branch being pursued.
- `researchProgressBySpecialty`.
- `staffRole` on crew members, separate from transient work lane.

Relationship to the role-lane dispatcher:

- `staffRole` is durable employment identity.
- Work lanes are scheduling categories.
- A role maps to preferred lanes and allowed fallback tasks.
- Free eligible staff may help generic hauling when their primary work is empty.

Example mappings:

- Cook -> food lane; can haul raw meals/meals; may assist generic cargo if food work is empty.
- Janitor -> sanitation lane; may assist generic cargo if no sanitation work is reachable.
- Technician -> engineering lane; can repair/maintain; may assist construction material hauling.
- Security Guard -> security/incident work; may assist emergency evacuation or generic tasks only when no incident/patrol duty exists.
- Assistant -> broad low-skill helper; useful as generic overflow without being a "hauler" role.

## Implementation Slices

### Slice 1: Data Spine And Starter Bridge

- Add `Bridge` room type.
- Add `CaptainConsole` module.
- Add `Captain` staff role and starter Captain spawn.
- Update starter scenario/layout to include a tiny Bridge.
- Add save/load defaults for departments/officers/staffRole.
- Add inspector/room activation for Bridge.

Acceptance:

- New games start with Captain + Bridge.
- Existing saves migrate with no crash and can infer/create command state safely.
- Bridge appears in room/module UI.

### Slice 2: Crew Panel Role Hiring

- Replace/extend simple hire controls with department role cards.
- Add staff role counts, hire costs, payroll, and locked reasons.
- Support hiring cooks, janitors, technicians, guards, doctors/nurses, engineers/EVA roles as data even if some remain locked.
- Feed `staffRole` into dispatcher lane preference.

Acceptance:

- Player can hire specific unlocked roles.
- Role counts affect work assignment.
- No player-facing flex/hauler role exists.
- Generic hauling can still be picked up by free eligible staff.

### Slice 3: Specialty Selection And Research

- Add specialty definitions.
- Add active specialty selection after tier completion.
- Add Bridge-terminal research progress.
- Add Captain Console UI for active specialty.
- Rework current tier checklist to show chosen branch objective.

Acceptance:

- Player completes one specialty at a time.
- Completing a specialty unlocks the next choice.
- Research requires active command staff/terminal.
- Existing tier progress remains compatible.

### Slice 4: First Department - Sanitation

- Add Sanitation Terminal.
- Add Sanitation Officer.
- Gate advanced sanitation hiring/policies behind active department.
- Keep basic dirt/cleaning functional enough that existing saves do not brick.

Acceptance:

- Hiring Sanitation Officer unlocks janitor/cleaner hiring and sanitation policy controls.
- Janitors preferentially clean.
- Cooks do not become janitors unless explicitly allowed by fallback rules.

### Slice 5: Expand Departments

Implement additional departments one by one:

- Security.
- Industrial.
- Mechanical/Engineering.
- Medical.
- Navigation/Traffic.
- Comms/Trade.

Each department should ship with:

- Officer.
- Terminal.
- Staff role unlocks.
- At least one real policy/control or diagnostic.
- Scenario tests.

## Testing

Core tests:

- New game starts with Bridge, Captain, and Captain Console.
- Existing saves load and initialize command state.
- Bridge room activates only with required terminal and path/pressurization.
- Officer is active only when hired and reachable to terminal.
- Completing one specialty unlocks the next selection.
- Only one specialty can be active at a time.
- Role hiring respects locked requirements.
- Staff role maps to dispatcher lanes correctly.
- Food hauling is handled by food staff before generic helpers.
- Generic cargo can be handled by free eligible staff even without a hauler role.
- Sanitation staff clean while cooks keep food chain work.

Browser QA:

- Start new game and verify Captain/Bridge visible.
- Open Crew Panel and verify role cards/locked reasons.
- Open Specialties panel and choose first branch.
- Build required terminal and watch research progress.
- Hire unlocked officer/staff.
- Confirm Station Ops workforce/department diagnostics match visible behavior.

## Open Design Questions

- Exact first set of selectable branches after starter Captain.
- Whether Captain alone can research the first officer, or each branch requires building its terminal first.
- Whether officer absence should pause advanced policies or merely reduce efficiency.
- Whether officers should have names/portraits and personality later.
- Which branch owns Logistics Terminal versus Comms/Trade; avoid making it a hidden hauler department.

## Firm Decisions From Current Discussion

- Captain and Bridge are part of the starting layout.
- Tier completion allows choosing the next specialty branch.
- Player completes one active specialty at a time.
- Research through bridge terminals is desirable.
- No player-facing `Flex Crew` role.
- No dedicated `Hauler` role for now.
- Hauling is either role-affine or generic overflow work for free eligible staff.
- Officers unlock management depth; basic survival should not hard-fail without every specialist.
