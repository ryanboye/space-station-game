# Engineering And Ship Services Portfolio

Status: partial; pod hardware and infrastructure exist, operation needs depth

## Player Promise

Build a fuel stop into a repair yard. The player trades capital, skilled labor,
hazard, berth time and spare parts for high-value ship service revenue.

## Current Inventory

- Pod Dock Fuel Coupler, Freight Locker and Maintenance Socket;
- Maintenance room and 2x2 Fuel Tank with visible fill state;
- pipe underlay reused for water/fuel network connectivity;
- berth Fuel Pump and Cargo Arm;
- Workshop and Workbench;
- fuel, raw material, item nodes and hauling;
- Mechanics, Technicians, Engineers, Welders and EVA roles;
- module condition, repairs, fire, external damage and EVA targets;
- charter repair/fuel demand modifiers.

The current Maintenance room requiring a Fuel Tank means it is effectively a fuel
plant room, not a general maintenance shop. Revisit naming or room requirements when
the repair facility recipe is implemented.

## E1. Pod Refueling

Required build:

- Pod Dock;
- adjacent same-face Fuel Coupler;
- Maintenance/fuel room with Fuel Tank;
- connected pipe network;
- located purchased fuel;
- power and working coupler condition.

Operation:

- eligible craft requests a bounded fuel quantity before arrival;
- dock reserves available tank fuel;
- transfer begins after docking and runs concurrently with passenger activity;
- pipe throughput, coupler condition and power determine rate;
- tank gauge and dock chip show reserved, transferred and remaining units;
- completed units emit fuel-sale revenue and cost basis;
- no fuel, pipe break, unpowered coupler or full reservation completes zero units.

Initial balancing: one refuel is more valuable than access alone but stock cost and
equipment investment prevent free passive profit.

## E2. Pod Repair

Required build:

- Pod Dock with Maintenance Socket;
- Workshop, 10+ tiles;
- Workbench;
- parts/raw-material storage;
- Mechanic with reachable work path;
- power and safe exterior access when EVA is required.

Operation:

```text
diagnose -> quote/accept -> reserve dock time and parts -> mechanic work
  -> optional EVA stage -> quality check -> bill -> release
```

Minor repairs use the socket. The actor physically alternates between Workshop/parts
and service position only when the job stage requires it. Repair progress never ticks
without required staff, tools and parts.

Add modules:

- Diagnostic Console: identifies fault and required part;
- Parts Cabinet: local high-priority repair buffer;
- Tool Crib: supports concurrent mechanic sessions;
- Scrap Bin: receives removed material and salvage value.

## E3. Berth Fuel Terminal

Required build:

- valid medium/large Berth with Control and clamps;
- Fuel Pump mounted in berth;
- fuel pipe from one or more Fuel Tanks;
- sufficient tank reserve and pump power;
- fire suppression and controlled access;
- Mechanic/Engineer coverage at larger scale.

Large ships request more fuel than a pod tank buffer. The player chooses storage
reserve, transfer speed and berth exposure. Refueling may happen in parallel with
passenger/cargo work, but blocks departure until accepted work completes or is aborted.

Later additions:

- multiple fuel grades;
- pump manifolds and redundant pipe;
- tanker deliveries and fuel supplier concessions;
- leak detection, isolation valves and spill/fire response;
- price policy or carrier supply contracts.

## E4. Heavy Repair And Dry Dock - New

Minimum repair berth:

- large Berth and heavy clamp capacity;
- Maintenance Gantry or Repair Gantry modules;
- diagnostic post;
- Workshop connected to parts warehouse;
- EVA staging/airlock;
- Mechanic, Engineer and Welder coverage;
- power reserve and safe closure perimeter.

Work packages:

- inspection/basic maintenance;
- hull patch/EVA repair;
- drive or system replacement;
- cleaning/decontamination;
- overhaul/refit.

Each package states expected berth time, labor, parts, risk and gross payment. The
player does not click through a manifest minigame; contracts select acceptable classes
and the yard visibly processes jobs under policy.

## E5. Salvage And Waste - Later

- damaged/abandoned ships create salvage opportunities;
- towing or recovery requires strategic/EVA capability;
- salvage produces typed parts/material and hazardous waste;
- the player chooses resale, reuse or disposal;
- poorly managed waste creates fire, contamination and rating risk.

## Strategic Choices

- fuel volume versus repair margin;
- customer jobs versus station preventive maintenance;
- keep a berth open for quick calls or occupy it with a long overhaul;
- bulk parts inventory versus emergency procurement;
- safe low utilization versus overtime and equipment wear;
- station-operated yard versus tenant repair concession;
- general repair capability versus specialized premium service.

## Failure And Recovery

- fuel stockout: emergency order, suspend advertising, divert ships;
- pipe leak: isolate valve, close berth, repair and clean;
- missing parts: wait, substitute at quality risk, or abort/refund;
- exhausted Mechanic: reschedule, recall, hire or contract work;
- failing gantry/clamp: reduce supported ship class and repair locally;
- docked disabled ship: tow/recovery contract or extended berth occupation;
- fire: cut fuel, evacuate, suppress and inspect adjacent equipment.

## Acceptance Scenario

Run a passenger pod refuel, minor repair and medium-ship refuel:

- each consumes the correct located stock and physical capacity;
- removing pipe connectivity stops only fuel transfer;
- removing parts stops repair with a specific diagnosis;
- one Mechanic cannot perform two exclusive sessions simultaneously;
- passenger activity proceeds concurrently when routes and capacity allow;
- utilization causes visible wear and maintenance pressure;
- economic events show gross sale, stock/parts cost, labor exposure and net effect.
