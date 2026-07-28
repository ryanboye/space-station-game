import { SHIP_HULL_VARIANTS, shipHullProfile } from './ship-hulls';
import type { ShipHullVariant, ShipSize, SpaceLane } from './types';

export type DockingSlotKind = 'legacy-dock' | 'pod-dock' | 'berth';

export interface WorldRect {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface DockingEnvelope {
  kind: 'ingress' | 'mooring' | 'egress';
  bounds: WorldRect;
  facing: SpaceLane;
  clearance: number;
}

export interface DockingSlotDescriptor {
  id: string;
  kind: DockingSlotKind;
  sourceKey: string | null;
  anchorTile: number | null;
  facing: SpaceLane;
  acceptedSizes: ShipSize[];
  hullTiles: number[];
  accessTiles: number[];
  envelopesBySize: Record<ShipSize, {
    ingress: DockingEnvelope;
    mooring: DockingEnvelope;
    egress: DockingEnvelope;
  }>;
  /** Actual hull envelopes. These drive admission and live traffic. */
  envelopesByHull: Record<ShipHullVariant, {
    ingress: DockingEnvelope;
    mooring: DockingEnvelope;
    egress: DockingEnvelope;
  }>;
}

export interface ApproachConflictGroup {
  id: string;
  slotIds: string[];
  sharedIngress: WorldRect[];
  sharedEgress: WorldRect[];
}

export interface ApproachValidation {
  valid: boolean;
  hardReasons: string[];
  conflictGroupIds: string[];
  descriptor: DockingSlotDescriptor;
}

export interface EnvelopeSlotInput {
  id: string;
  kind: DockingSlotKind;
  sourceKey: string | null;
  anchorTile: number | null;
  facing: SpaceLane;
  acceptedSizes: ShipSize[];
  hullTiles: number[];
  accessTiles: number[];
  /** World tile coordinates at the physical mount/berth centre. */
  anchorWorldX: number;
  anchorWorldY: number;
  /** World-space extents of the parked hull/berth footprint. */
  hullBounds: WorldRect;
}

const SIZE_CLEARANCE: Record<ShipSize, { depth: number; lateral: number }> = {
  small: { depth: 3, lateral: 1 },
  medium: { depth: 5, lateral: 2 },
  large: { depth: 7, lateral: 3 }
};

const LANE_ORDER: SpaceLane[] = ['north', 'east', 'south', 'west'];

export interface ApproachLaneAlignment {
  quarterTurns: 0 | 1 | 2;
  progressMultiplier: number;
  label: 'direct' | 'cross-lane' | 'opposed';
}

/**
 * Ships may route around the station, but an interface pointed toward their
 * arrival lane has a shorter, cleaner approach. This keeps every legal berth
 * useful while making directional frontage a real operating choice.
 */
export function approachLaneAlignment(lane: SpaceLane, facing: SpaceLane): ApproachLaneAlignment {
  const raw = Math.abs(LANE_ORDER.indexOf(lane) - LANE_ORDER.indexOf(facing));
  const quarterTurns = Math.min(raw, 4 - raw) as 0 | 1 | 2;
  if (quarterTurns === 0) return { quarterTurns, progressMultiplier: 1, label: 'direct' };
  if (quarterTurns === 1) return { quarterTurns, progressMultiplier: 0.72, label: 'cross-lane' };
  return { quarterTurns, progressMultiplier: 0.48, label: 'opposed' };
}

export function rectanglesOverlap(a: WorldRect, b: WorldRect): boolean {
  return a.minX < b.maxX && a.maxX > b.minX && a.minY < b.maxY && a.maxY > b.minY;
}

export function unionRect(a: WorldRect, b: WorldRect): WorldRect {
  return {
    minX: Math.min(a.minX, b.minX),
    minY: Math.min(a.minY, b.minY),
    maxX: Math.max(a.maxX, b.maxX),
    maxY: Math.max(a.maxY, b.maxY)
  };
}

function translateAlongFacing(bounds: WorldRect, facing: SpaceLane, distance: number): WorldRect {
  if (facing === 'north') return { ...bounds, minY: bounds.minY - distance, maxY: bounds.maxY - distance };
  if (facing === 'south') return { ...bounds, minY: bounds.minY + distance, maxY: bounds.maxY + distance };
  if (facing === 'east') return { ...bounds, minX: bounds.minX + distance, maxX: bounds.maxX + distance };
  return { ...bounds, minX: bounds.minX - distance, maxX: bounds.maxX - distance };
}

function expandLateral(bounds: WorldRect, facing: SpaceLane, lateral: number): WorldRect {
  return facing === 'north' || facing === 'south'
    ? { ...bounds, minX: bounds.minX - lateral, maxX: bounds.maxX + lateral }
    : { ...bounds, minY: bounds.minY - lateral, maxY: bounds.maxY + lateral };
}

function directionalCorridor(bounds: WorldRect, facing: SpaceLane, depth: number, lateral: number): WorldRect {
  const shifted = translateAlongFacing(bounds, facing, depth);
  return unionRect(expandLateral(bounds, facing, lateral), expandLateral(shifted, facing, lateral));
}

export function buildDockingSlotDescriptor(input: EnvelopeSlotInput): DockingSlotDescriptor {
  const envelopesBySize = {} as DockingSlotDescriptor['envelopesBySize'];
  for (const size of ['small', 'medium', 'large'] as ShipSize[]) {
    const scale = SIZE_CLEARANCE[size];
    const mooring = expandLateral(input.hullBounds, input.facing, scale.lateral);
    // A Berth's room already provides its lateral bay clearance. Free-flying
    // Pod Docks retain a wider merge corridor outside the hull.
    const approachLateral = input.kind === 'berth' ? 0 : scale.lateral;
    const ingress = directionalCorridor(mooring, input.facing, scale.depth, approachLateral);
    // Egress shares the physical corridor today. Keeping a distinct object is
    // intentional: later traffic choreography can give it a separate lane.
    const egress = directionalCorridor(mooring, input.facing, scale.depth, approachLateral);
    envelopesBySize[size] = {
      ingress: { kind: 'ingress', bounds: ingress, facing: input.facing, clearance: scale.lateral },
      mooring: { kind: 'mooring', bounds: mooring, facing: input.facing, clearance: scale.lateral },
      egress: { kind: 'egress', bounds: egress, facing: input.facing, clearance: scale.lateral }
    };
  }
  const envelopesByHull = {} as DockingSlotDescriptor['envelopesByHull'];
  for (const hullVariant of SHIP_HULL_VARIANTS) {
    const profile = shipHullProfile(hullVariant);
    const mooring = expandLateral(input.hullBounds, input.facing, profile.lateralClearance);
    const approachLateral = input.kind === 'berth' ? 0 : profile.lateralClearance;
    const ingress = directionalCorridor(mooring, input.facing, profile.approachDepth, approachLateral);
    const egress = directionalCorridor(mooring, input.facing, profile.approachDepth, approachLateral);
    envelopesByHull[hullVariant] = {
      ingress: { kind: 'ingress', bounds: ingress, facing: input.facing, clearance: profile.lateralClearance },
      mooring: { kind: 'mooring', bounds: mooring, facing: input.facing, clearance: profile.lateralClearance },
      egress: { kind: 'egress', bounds: egress, facing: input.facing, clearance: profile.lateralClearance }
    };
  }
  return {
    id: input.id,
    kind: input.kind,
    sourceKey: input.sourceKey,
    anchorTile: input.anchorTile,
    facing: input.facing,
    acceptedSizes: [...input.acceptedSizes],
    hullTiles: [...input.hullTiles],
    accessTiles: [...input.accessTiles],
    envelopesBySize,
    envelopesByHull
  };
}

export function envelopeForHull(
  descriptor: DockingSlotDescriptor,
  variant: ShipHullVariant
): DockingSlotDescriptor['envelopesByHull'][ShipHullVariant] {
  return descriptor.envelopesByHull[variant];
}

export function deriveApproachConflictGroups(descriptors: DockingSlotDescriptor[]): ApproachConflictGroup[] {
  const groups: ApproachConflictGroup[] = [];
  const ordered = [...descriptors].sort((a, b) => a.id.localeCompare(b.id));
  for (let i = 0; i < ordered.length; i++) {
    for (let j = i + 1; j < ordered.length; j++) {
      const a = ordered[i];
      const b = ordered[j];
      const ingress: WorldRect[] = [];
      const egress: WorldRect[] = [];
      for (const sizeA of a.acceptedSizes) {
        for (const sizeB of b.acceptedSizes) {
          const aEnv = a.envelopesBySize[sizeA];
          const bEnv = b.envelopesBySize[sizeB];
          if (rectanglesOverlap(aEnv.ingress.bounds, bEnv.ingress.bounds)) ingress.push(unionRect(aEnv.ingress.bounds, bEnv.ingress.bounds));
          if (rectanglesOverlap(aEnv.egress.bounds, bEnv.egress.bounds)) egress.push(unionRect(aEnv.egress.bounds, bEnv.egress.bounds));
        }
      }
      if (ingress.length === 0 && egress.length === 0) continue;
      groups.push({
        id: `approach|${a.id}|${b.id}`,
        slotIds: [a.id, b.id],
        sharedIngress: ingress,
        sharedEgress: egress
      });
    }
  }
  return groups;
}

/** Every whole world tile touched by a rectangle. This intentionally accepts out-of-bounds space. */
export function tilesInWorldRect(bounds: WorldRect): Array<{ x: number; y: number }> {
  const tiles: Array<{ x: number; y: number }> = [];
  for (let y = Math.floor(bounds.minY); y < Math.ceil(bounds.maxY); y++) {
    for (let x = Math.floor(bounds.minX); x < Math.ceil(bounds.maxX); x++) tiles.push({ x, y });
  }
  return tiles;
}
