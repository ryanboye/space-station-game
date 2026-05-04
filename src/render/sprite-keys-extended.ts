// Forward-looking contract for agent and FX sprite expansion.
// Legacy single keys (kept for reference, unused by render).
export const AGENT_SPRITE_KEYS = {
  visitor: 'agent.visitor',
  resident: 'agent.resident',
  crew: 'agent.crew'
} as const;

export const AGENT_SPRITE_VARIANTS = {
  visitor: [
    'agent.visitor.1', 'agent.visitor.2', 'agent.visitor.3',
    'agent.visitor.4', 'agent.visitor.5', 'agent.visitor.6'
  ],
  resident: [
    'agent.resident.1', 'agent.resident.2', 'agent.resident.3',
    'agent.resident.4', 'agent.resident.5', 'agent.resident.6'
  ],
  crew: [
    'agent.crew.1', 'agent.crew.2', 'agent.crew.3',
    'agent.crew.4', 'agent.crew.5', 'agent.crew.6'
  ]
} as const;

export const AGENT_EVA_SUIT_SPRITE_KEY = 'agent.crew.eva_suit';

export const STAFF_ROLE_SPRITE_KEYS = {
  captain: 'agent.crew.captain',
  'sanitation-officer': 'agent.crew.sanitation_officer',
  'security-officer': 'agent.crew.security_officer',
  'mechanic-officer': 'agent.crew.mechanic_officer',
  'industrial-officer': 'agent.crew.industrial_officer',
  'navigation-officer': 'agent.crew.navigation_officer',
  'comms-officer': 'agent.crew.comms_officer',
  'medical-officer': 'agent.crew.medical_officer',
  cook: 'agent.crew.cook',
  cleaner: 'agent.crew.cleaner',
  janitor: 'agent.crew.janitor',
  botanist: 'agent.crew.botanist',
  technician: 'agent.crew.technician',
  engineer: 'agent.crew.engineer',
  mechanic: 'agent.crew.mechanic',
  welder: 'agent.crew.welder',
  doctor: 'agent.crew.doctor',
  nurse: 'agent.crew.nurse',
  'security-guard': 'agent.crew.security_guard',
  assistant: 'agent.crew.assistant',
  'eva-specialist': 'agent.crew.eva_specialist',
  'eva-engineer': 'agent.crew.eva_engineer',
  'flight-controller': 'agent.crew.flight_controller',
  'docking-officer': 'agent.crew.docking_officer'
} as const;

export const AGENT_OVERLAY_SPRITE_KEYS = {
  distressed: 'overlay.agent.distressed',
  critical: 'overlay.agent.critical',
  agitated: 'overlay.agent.agitated',
  confrontation: 'overlay.agent.confrontation'
} as const;

export const FX_SPRITE_KEYS = {
  blockedPath: 'fx.blocked_path',
  lowOxygen: 'fx.low_oxygen',
  incidentFight: 'fx.incident_fight',
  incidentTrespass: 'fx.incident_trespass',
  repairSpark: 'fx.repair.spark'
} as const;

export const SPACE_BACKDROP_SPRITE_KEYS = [
  'space.planet.rocky.1',
  'space.asteroid.cluster.1',
  'space.debris.metal.1',
  'space.debris.ice.1'
] as const;

export const HULL_WEAR_SPRITE_KEYS = [
  'overlay.wall.hull_wear.1',
  'overlay.wall.hull_wear.2'
] as const;

// Dock facade is 4 canonical sprites (authored in NORTH orientation).
// East/south/west render-time-rotated from the same set. seb's review pass
// caught that the gen pipeline silently duplicated 14 of 16 direction-specific
// sprites — collapsing to 4 + rotation eliminates that surface area.
export const DOCK_OVERLAY_SPRITE_KEYS = {
  solo: 'overlay.dock.facade.north.solo',
  start: 'overlay.dock.facade.north.start',
  middle: 'overlay.dock.facade.north.middle',
  end: 'overlay.dock.facade.north.end'
} as const;

export const DOCK_FACADE_ROTATION: Record<'north' | 'east' | 'south' | 'west', 0 | 90 | 180 | 270> = {
  north: 0,
  east: 90,
  south: 180,
  west: 270
};

export const FLOOR_GRIME_SPRITE_KEYS = [
  'overlay.floor.grime.1',
  'overlay.floor.grime.2',
  'overlay.floor.grime.3',
  'overlay.floor.grime.4',
  'overlay.floor.grime.5',
  'overlay.floor.grime.6'
] as const;

export const FLOOR_WEAR_SPRITE_KEYS = [
  'overlay.floor.wear.1',
  'overlay.floor.wear.2',
  'overlay.floor.wear.3',
  'overlay.floor.wear.4'
] as const;

// EXTERIOR_WALL_OVERLAY_SPRITE_KEYS removed 2026-04-23 — seb + bmo
// verified no renderer ever called it. Art was 5 near-duplicate
// placeholder sprites eating atlas space. If decorative wall-exteriors
// are wanted later, re-add with proper render integration + per-tile
// rotation (don't ship 4 direction-specific sprites per decoration).
