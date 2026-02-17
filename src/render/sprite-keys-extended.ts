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
