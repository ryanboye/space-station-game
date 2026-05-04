// actor-inspectors.ts — extracted from sim.ts.
//
// Owns the visitor / resident / crew inspector derivations used by
// main.ts and render/ to populate the agent inspector panels. Pure
// read-only — never mutates state, never calls state.rng().
//
// Public API: getVisitorInspectorById, getResidentInspectorById,
// getCrewInspectorById are re-exported from sim.ts so existing import
// sites keep working.

import {
  CREW_BLADDER_TOILET_THRESHOLD,
  CREW_CLEAN_HYGIENE_THRESHOLD,
  CREW_REST_ENERGY_THRESHOLD,
  CREW_THIRST_DRINK_THRESHOLD,
  DORM_SEEK_ENERGY_THRESHOLD,
  actorReservationSummary,
  airQualityAt,
  providerTargetLabelFromTile,
  residentConfrontationActive,
  visitorVisitAge
} from './sim';
import {
  type CrewDesire,
  type CrewInspector,
  type CrewMember,
  ModuleType,
  type Resident,
  type ResidentDesire,
  type ResidentDominantNeed,
  type ResidentInspector,
  ResidentState,
  RoomType,
  type StationState,
  type Visitor,
  type VisitorDesire,
  type VisitorInspector,
  VisitorState
} from './types';

function visitorInspectorDesire(state: StationState, visitor: Visitor): VisitorDesire {
  if (visitor.state === VisitorState.ToDock) return 'exit_station';
  if (!visitor.servedMeal || visitor.carryingMeal || visitor.state === VisitorState.ToCafeteria || visitor.state === VisitorState.Queueing) {
    return 'eat';
  }
  if (visitor.state === VisitorState.ToLeisure || visitor.state === VisitorState.Leisure) {
    return visitorLeisureNeedLabel(state, visitor);
  }
  return visitor.servedMeal ? 'exit_station' : 'eat';
}

function visitorLeisureNeedLabel(state: StationState, visitor: Visitor): VisitorDesire {
  const target = visitor.reservedTargetTile ?? visitor.tileIndex;
  if (target >= 0 && target < state.rooms.length && state.rooms[target] === RoomType.Hygiene) return 'toilet';
  if (visitor.state === VisitorState.ToLeisure || visitor.state === VisitorState.Leisure) return 'leisure';
  return visitor.servedMeal ? 'exit_station' : 'eat';
}

function visitorInspectorTargetTile(visitor: Visitor): number | null {
  if (!visitor.carryingMeal && visitor.reservedServingTile !== null) return visitor.reservedServingTile;
  if (visitor.reservedTargetTile !== null) return visitor.reservedTargetTile;
  if (visitor.path.length > 0) return visitor.path[visitor.path.length - 1];
  return null;
}

function visitorInspectorAction(state: StationState, visitor: Visitor): { currentAction: string; actionReason: string } {
  if (visitor.state === VisitorState.ToCafeteria) {
    if (!visitor.carryingMeal) {
      return {
        currentAction: 'heading to serving station',
        actionReason:
          visitor.reservedServingTile !== null
            ? `meal pickup reserved at tile ${visitor.reservedServingTile}`
            : 'seeking meal service'
      };
    }
    return {
      currentAction: 'heading to table',
      actionReason:
        visitor.reservedTargetTile !== null
          ? `table reserved at tile ${visitor.reservedTargetTile}`
          : 'carrying a meal and searching for a seat'
    };
  }
  if (visitor.state === VisitorState.Queueing) {
    return {
      currentAction: 'waiting in cafeteria queue',
      actionReason: visitor.reservedServingTile !== null ? 'waiting for stock at reserved serving node' : 'no meal stock available yet'
    };
  }
  if (visitor.state === VisitorState.Eating) {
    return {
      currentAction: 'eating',
      actionReason: `meal timer ${visitor.eatTimer.toFixed(1)}s remaining`
    };
  }
  if (visitor.state === VisitorState.ToLeisure) {
    const need = visitorLeisureNeedLabel(state, visitor);
    const target = visitor.reservedTargetTile ?? -1;
    const targetRoom = target >= 0 && target < state.rooms.length ? state.rooms[target] : RoomType.None;
    const destLabel =
      targetRoom === RoomType.Market ? 'market' :
      targetRoom === RoomType.Lounge ? 'lounge' :
      targetRoom === RoomType.RecHall ? 'rec hall' :
      targetRoom === RoomType.Cantina ? 'cantina' :
      targetRoom === RoomType.Observatory ? 'observatory' :
      targetRoom === RoomType.Hygiene ? 'hygiene' : 'leisure';
    const legSuffix = visitor.leisureLegsPlanned > 1
      ? ` · leg ${visitor.leisureLegsPlanned - visitor.leisureLegsRemaining + 1}/${visitor.leisureLegsPlanned}`
      : '';
    return {
      currentAction: need === 'toilet' ? 'walking to hygiene' : `walking to ${destLabel}`,
      actionReason:
        need === 'toilet'
          ? `comfort stop after ${visitorVisitAge(state, visitor).toFixed(0)}s visit`
          : `${visitor.archetype} on ${visitor.primaryPreference} circuit${legSuffix}`
    };
  }
  if (visitor.state === VisitorState.Leisure) {
    const need = visitorLeisureNeedLabel(state, visitor);
    const room = state.rooms[visitor.tileIndex];
    const verb =
      need === 'toilet' ? 'using hygiene service' :
      room === RoomType.Market ? 'browsing market stalls' :
      room === RoomType.Lounge ? 'relaxing in lounge' :
      room === RoomType.RecHall ? 'using rec hall' :
      room === RoomType.Cantina ? 'enjoying drinks in cantina' :
      room === RoomType.Observatory ? 'taking in the view' :
      'using leisure service';
    return {
      currentAction: verb,
      actionReason: `${need === 'toilet' ? 'comfort' : 'leisure'} timer ${visitor.eatTimer.toFixed(1)}s remaining${visitor.leisureLegsRemaining > 0 ? ` · ${visitor.leisureLegsRemaining} more stop${visitor.leisureLegsRemaining === 1 ? '' : 's'} planned` : ''}`
    };
  }
  return {
    currentAction: 'heading to dock',
    actionReason: visitor.servedMeal ? 'visit complete, exiting station' : `patience pressure ${visitor.patience.toFixed(1)}`
  };
}

export function getVisitorInspectorById(state: StationState, visitorId: number): VisitorInspector | null {
  const visitor = state.visitors.find((v) => v.id === visitorId);
  if (!visitor) return null;
  const targetTile = visitorInspectorTargetTile(visitor);
  const action = visitorInspectorAction(state, visitor);
  return {
    id: visitor.id,
    kind: 'visitor',
    state: visitor.state,
    tileIndex: visitor.tileIndex,
    x: visitor.x,
    y: visitor.y,
    healthState: visitor.healthState,
    blockedTicks: visitor.blockedTicks,
    pathLength: visitor.path.length,
    targetTile,
    currentAction: action.currentAction,
    actionReason: action.actionReason,
    localAir: airQualityAt(state, visitor.tileIndex),
    airExposureSec: visitor.airExposureSec,
    reservationSummary: actorReservationSummary(state, 'visitor', visitor.id),
    providerTarget: providerTargetLabelFromTile(state, targetTile),
    blockedReason: visitor.blockedTicks > 4 ? 'path blocked or provider congested' : null,
    archetype: visitor.archetype,
    primaryPreference: visitor.primaryPreference,
    patience: visitor.patience,
    servedMeal: visitor.servedMeal,
    carryingMeal: visitor.carryingMeal,
    reservedServingTile: visitor.reservedServingTile,
    reservedTargetTile: visitor.reservedTargetTile,
    desire: visitorInspectorDesire(state, visitor)
  };
}

function residentInspectorTargetTile(resident: Resident): number | null {
  if (resident.reservedTargetTile !== null) return resident.reservedTargetTile;
  if (resident.path.length > 0) return resident.path[resident.path.length - 1];
  return null;
}

function residentInspectorDominantNeed(resident: Resident): ResidentDominantNeed {
  const deficits: Array<{ key: ResidentDominantNeed; value: number }> = [
    { key: 'hunger', value: 100 - resident.hunger },
    { key: 'energy', value: 100 - resident.energy },
    { key: 'hygiene', value: 100 - resident.hygiene }
  ];
  deficits.sort((a, b) => b.value - a.value);
  return deficits[0].value < 10 ? 'none' : deficits[0].key;
}

function residentInspectorDesire(resident: Resident): ResidentDesire {
  if (resident.safety < 35) return 'seek_safety';
  if (resident.energy < DORM_SEEK_ENERGY_THRESHOLD) return 'sleep';
  if (resident.hygiene < 45) return 'hygiene';
  if (resident.hunger < 55) return 'eat';
  if (resident.routinePhase === 'socialize' && resident.social < 65) return 'socialize';
  return 'wander';
}

function residentInspectorAction(
  resident: Resident,
  desire: ResidentDesire
): { currentAction: string; actionReason: string } {
  if ((resident.activeIncidentId ?? null) !== null) {
    return {
      currentAction: 'in confrontation',
      actionReason: `incident ${resident.activeIncidentId} awaiting security response`
    };
  }
  if (resident.state === ResidentState.ToCafeteria) {
    return {
      currentAction: 'walking to cafeteria',
      actionReason: `hunger ${resident.hunger.toFixed(1)} under eat threshold 55`
    };
  }
  if (resident.state === ResidentState.Eating) {
    return {
      currentAction: 'eating',
      actionReason: `meal timer ${resident.actionTimer.toFixed(1)}s remaining`
    };
  }
  if (resident.state === ResidentState.ToDorm) {
    return {
      currentAction: 'walking to dorm',
      actionReason: `energy ${resident.energy.toFixed(1)} under rest threshold ${DORM_SEEK_ENERGY_THRESHOLD}`
    };
  }
  if (resident.state === ResidentState.Sleeping) {
    return {
      currentAction: 'sleeping',
      actionReason: `rest timer ${resident.actionTimer.toFixed(1)}s remaining`
    };
  }
  if (resident.state === ResidentState.ToHygiene) {
    return {
      currentAction: 'walking to hygiene',
      actionReason: `hygiene ${resident.hygiene.toFixed(1)} under clean threshold 45`
    };
  }
  if (resident.state === ResidentState.Cleaning) {
    return {
      currentAction: 'cleaning',
      actionReason: `clean timer ${resident.actionTimer.toFixed(1)}s remaining`
    };
  }
  if (resident.state === ResidentState.ToLeisure) {
    return {
      currentAction: 'walking to social space',
      actionReason: `routine ${resident.routinePhase} with social ${resident.social.toFixed(1)}`
    };
  }
  if (resident.state === ResidentState.Leisure) {
    return {
      currentAction: 'socializing',
      actionReason: `social timer ${resident.actionTimer.toFixed(1)}s remaining`
    };
  }
  if (resident.state === ResidentState.ToSecurity) {
    return {
      currentAction: 'seeking safer area',
      actionReason: `safety ${resident.safety.toFixed(1)} below comfort threshold`
    };
  }
  if (resident.state === ResidentState.ToHomeShip) {
    return {
      currentAction: 'settling back into station life',
      actionReason: 'legacy return-home state will reset on the next simulation tick'
    };
  }
  return {
    currentAction: resident.path.length > 0 ? 'wandering' : 'idle',
    actionReason: desire === 'wander' ? 'all immediate needs are above trigger thresholds' : `next desire is ${desire}`
  };
}

export function getResidentInspectorById(state: StationState, residentId: number): ResidentInspector | null {
  const resident = state.residents.find((r) => r.id === residentId);
  if (!resident) return null;
  const desire = residentInspectorDesire(resident);
  const action = residentInspectorAction(resident, desire);
  const agitation = resident.agitation ?? 0;
  const inConfrontation = residentConfrontationActive(state, resident);
  return {
    id: resident.id,
    kind: 'resident',
    state: resident.state,
    tileIndex: resident.tileIndex,
    x: resident.x,
    y: resident.y,
    healthState: resident.healthState,
    blockedTicks: resident.blockedTicks,
    pathLength: resident.path.length,
    targetTile: residentInspectorTargetTile(resident),
    currentAction: action.currentAction,
    actionReason: action.actionReason,
    localAir: airQualityAt(state, resident.tileIndex),
    airExposureSec: resident.airExposureSec,
    reservationSummary: actorReservationSummary(state, 'resident', resident.id),
    providerTarget: providerTargetLabelFromTile(state, residentInspectorTargetTile(resident)),
    blockedReason: resident.blockedTicks > 4 ? 'path blocked or provider congested' : null,
    hunger: resident.hunger,
    energy: resident.energy,
    hygiene: resident.hygiene,
    stress: resident.stress,
    social: resident.social,
    safety: resident.safety,
    routinePhase: resident.routinePhase,
    role: resident.role,
    agitation,
    inConfrontation,
    satisfaction: resident.satisfaction,
    leaveIntent: resident.leaveIntent,
    homeDockId: resident.homeDockId,
    homeShipId: resident.homeShipId,
    housingUnitId: resident.housingUnitId,
    bedModuleId: resident.bedModuleId,
    dominantNeed: residentInspectorDominantNeed(resident),
    desire
  };
}

function crewInspectorDesire(crew: CrewMember): CrewDesire {
  if (crew.resting) return 'rest';
  if (crew.toileting) return 'toilet';
  if (crew.drinking) return 'drink';
  if (crew.cleaning) return 'clean';
  if (crew.leisure) return 'social';
  if (crew.activeJobId !== null) return 'logistics';
  if (crew.bladder <= CREW_BLADDER_TOILET_THRESHOLD) return 'toilet';
  if (crew.thirst <= CREW_THIRST_DRINK_THRESHOLD) return 'drink';
  if (crew.energy <= CREW_REST_ENERGY_THRESHOLD) return 'rest';
  if (crew.hygiene <= CREW_CLEAN_HYGIENE_THRESHOLD) return 'clean';
  return 'idle';
}

function crewInspectorTargetTile(state: StationState, crew: CrewMember): number | null {
  if (crew.activeJobId !== null) {
    const job = state.jobs.find((j) => j.id === crew.activeJobId);
    if (job) return crew.carryingItemType !== null || job.state === 'in_progress' ? job.toTile : job.fromTile;
  }
  if (crew.targetTile !== null) return crew.targetTile;
  if (crew.path.length > 0) return crew.path[crew.path.length - 1];
  return null;
}

function crewInspectorAction(
  state: StationState,
  crew: CrewMember,
  desire: CrewDesire
): { currentAction: string; actionReason: string; stateLabel: string } {
  if (crew.activeJobId !== null) {
    const job = state.jobs.find((j) => j.id === crew.activeJobId);
    if (job) {
      if (job.type === 'cook') {
        const at = crew.tileIndex === job.fromTile;
        const progress = job.workProgress ?? 0;
        const required = job.workRequired ?? job.amount;
        const stall = job.blockedReason ?? (job.stallReason && job.stallReason !== 'none' ? job.stallReason : '');
        return {
          currentAction: at ? 'cooking meal batch' : 'walking to stove',
          actionReason: `job #${job.id} ${job.state} | batch ${job.amount.toFixed(1)} | ${progress.toFixed(1)}/${required.toFixed(1)}${stall ? ` | ${stall}` : ''}`,
          stateLabel: 'cooking'
        };
      }
      if (job.type === 'repair') {
        const at = crew.tileIndex === job.fromTile;
        const sys = job.repairSystem ?? 'system';
        const stall = job.blockedReason
          ? ` | ${job.blockedReason}`
          : job.stallReason && job.stallReason !== 'none' ? ` | ${job.stallReason}` : '';
        return {
          currentAction: at ? `repairing ${sys}` : `walking to repair ${sys}`,
          actionReason: `job #${job.id} ${job.state} | progress ${(job.repairProgress ?? 0).toFixed(1)}/${job.amount.toFixed(1)}${stall}`,
          stateLabel: 'repair'
        };
      }
      if (job.type === 'extinguish') {
        const fire = state.effects.fires.find((f) => f.anchorTile === job.fromTile);
        const inProgress = job.state === 'in_progress';
        return {
          currentAction: inProgress ? 'extinguishing fire' : 'rushing to fire',
          actionReason: fire
            ? `fire at ${job.fromTile} | intensity ${fire.intensity.toFixed(0)}`
            : `fire job #${job.id} ${job.state}`,
          stateLabel: 'firefighting'
        };
      }
      if (job.type === 'sanitize') {
        const at = crew.tileIndex === job.fromTile;
        const dirt = state.dirtByTile[job.fromTile] ?? 0;
        const stall = job.stallReason && job.stallReason !== 'none' ? ` | ${job.stallReason}` : '';
        return {
          currentAction: at ? 'sanitizing room' : 'walking to sanitation job',
          actionReason: `job #${job.id} ${job.state} | dirt ${dirt.toFixed(0)}% | source ${job.sanitationSource ?? 'mixed'}${stall}`,
          stateLabel: 'sanitation'
        };
      }
      const carrying = crew.carryingItemType !== null || job.pickedUpAmount > 0;
      const currentAction = carrying ? `delivering ${job.itemType}` : `walking to ${job.itemType} pickup`;
      const stall = job.stallReason && job.stallReason !== 'none' ? ` | ${job.stallReason}` : '';
      return {
        currentAction,
        actionReason: `job #${job.id} ${job.state} | ${job.fromTile}->${job.toTile} | ${job.pickedUpAmount.toFixed(1)}/${job.amount.toFixed(1)}${stall}`,
        stateLabel: 'logistics'
      };
    }
    return {
      currentAction: 'logistics assignment missing',
      actionReason: `active job #${crew.activeJobId} no longer exists`,
      stateLabel: 'logistics'
    };
  }
  if (crew.resting) {
    return {
      currentAction: 'resting',
      actionReason: `energy ${crew.energy.toFixed(1)} recovering before returning to duty`,
      stateLabel: 'resting'
    };
  }
  if (crew.toileting) {
    return {
      currentAction: crew.path.length > 0 ? 'walking to hygiene' : 'using restroom',
      actionReason: `bladder ${crew.bladder.toFixed(0)} (toilet at <${CREW_BLADDER_TOILET_THRESHOLD})`,
      stateLabel: 'toilet'
    };
  }
  if (crew.drinking) {
    const atCantina = state.rooms[crew.tileIndex] === RoomType.Cantina;
    const atFountain = state.modules[crew.tileIndex] === ModuleType.WaterFountain;
    return {
      currentAction:
        atCantina ? 'drinking at the bar' :
        atFountain ? 'sipping water' :
        crew.path.length > 0 ? 'walking to drink' : 'looking for a drink',
      actionReason: `thirst ${crew.thirst.toFixed(0)} (drink at <${CREW_THIRST_DRINK_THRESHOLD})`,
      stateLabel: 'drink'
    };
  }
  if (crew.cleaning) {
    return {
      currentAction: 'cleaning up',
      actionReason: `hygiene ${crew.hygiene.toFixed(1)} below comfort threshold`,
      stateLabel: 'cleaning'
    };
  }
  if (crew.leisure) {
    return {
      currentAction: crew.path.length > 0 ? 'walking to social space' : 'taking leisure time',
      actionReason: crew.leisureSessionActive
        ? `off-duty recovery ${Math.max(0, crew.leisureUntil - state.now).toFixed(1)}s remaining`
        : 'off-duty social recovery before returning to work',
      stateLabel: 'leisure'
    };
  }
  return {
    currentAction: crew.path.length > 0 ? 'walking' : 'idle',
    actionReason: desire === 'idle' ? crew.idleReason : `next desire is ${desire}`,
    stateLabel: 'idle'
  };
}

export function getCrewInspectorById(state: StationState, crewId: number): CrewInspector | null {
  const crew = state.crewMembers.find((c) => c.id === crewId);
  if (!crew) return null;
  const desire = crewInspectorDesire(crew);
  const action = crewInspectorAction(state, crew, desire);
  return {
    id: crew.id,
    kind: 'crew',
    state: action.stateLabel,
    tileIndex: crew.tileIndex,
    x: crew.x,
    y: crew.y,
    healthState: crew.healthState,
    blockedTicks: crew.blockedTicks,
    pathLength: crew.path.length,
    targetTile: crewInspectorTargetTile(state, crew),
    currentAction: action.currentAction,
    actionReason: action.actionReason,
    localAir: airQualityAt(state, crew.tileIndex),
    airExposureSec: crew.airExposureSec,
    reservationSummary: actorReservationSummary(state, 'crew', crew.id),
    providerTarget: providerTargetLabelFromTile(state, crewInspectorTargetTile(state, crew)),
    blockedReason: crew.blockedTicks > 4 ? crew.idleReason : null,
    role: crew.role,
    staffRole: crew.staffRole,
    assignedSystem: crew.assignedSystem,
    lastSystem: crew.lastSystem,
    energy: crew.energy,
    hygiene: crew.hygiene,
    bladder: crew.bladder,
    thirst: crew.thirst,
    resting: crew.resting,
    cleaning: crew.cleaning,
    toileting: crew.toileting,
    drinking: crew.drinking,
    leisure: crew.leisure,
    activeJobId: crew.activeJobId,
    carryingItemType: crew.carryingItemType,
    carryingAmount: crew.carryingAmount,
    idleReason: crew.idleReason,
    desire
  };
}
