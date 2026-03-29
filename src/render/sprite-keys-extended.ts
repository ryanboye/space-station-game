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
  incidentTrespass: 'fx.incident_trespass'
} as const;

export const DOCK_OVERLAY_SPRITE_KEYS = {
  north: {
    solo: 'overlay.dock.facade.north.solo',
    start: 'overlay.dock.facade.north.start',
    middle: 'overlay.dock.facade.north.middle',
    end: 'overlay.dock.facade.north.end'
  },
  east: {
    solo: 'overlay.dock.facade.east.solo',
    start: 'overlay.dock.facade.east.start',
    middle: 'overlay.dock.facade.east.middle',
    end: 'overlay.dock.facade.east.end'
  },
  south: {
    solo: 'overlay.dock.facade.south.solo',
    start: 'overlay.dock.facade.south.start',
    middle: 'overlay.dock.facade.south.middle',
    end: 'overlay.dock.facade.south.end'
  },
  west: {
    solo: 'overlay.dock.facade.west.solo',
    start: 'overlay.dock.facade.west.start',
    middle: 'overlay.dock.facade.west.middle',
    end: 'overlay.dock.facade.west.end'
  }
} as const;

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

export const EXTERIOR_WALL_OVERLAY_SPRITE_KEYS = {
  straight1: 'overlay.wall.exterior.1',
  straight2: 'overlay.wall.exterior.2',
  straight3: 'overlay.wall.exterior.3',
  corner1: 'overlay.wall.exterior.corner.1',
  end1: 'overlay.wall.exterior.end.1'
} as const;
