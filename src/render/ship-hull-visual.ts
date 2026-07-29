import { shipHullProfile } from '../sim/ship-hulls';
import type { ShipHullVariant, SpaceLane } from '../sim/types';

/**
 * Runtime ship bitmaps have two deliberate native axes:
 *
 * - pod hulls are authored nose-east;
 * - berth hulls are authored nose-north.
 *
 * Keep this conversion shared by docked, approaching, and queued rendering so
 * the same physical craft cannot turn ninety degrees when its state changes.
 */
export function shipHullLaneRotationDegrees(hullVariant: ShipHullVariant, lane: SpaceLane): 0 | 90 | 180 | 270 {
  if (shipHullProfile(hullVariant).interfaceKind === 'berth') {
    if (lane === 'north') return 0;
    if (lane === 'east') return 90;
    if (lane === 'south') return 180;
    return 270;
  }

  if (lane === 'east') return 0;
  if (lane === 'south') return 90;
  if (lane === 'west') return 180;
  return 270;
}

export function shipHullLaneAngleRad(hullVariant: ShipHullVariant, lane: SpaceLane): number {
  return shipHullLaneRotationDegrees(hullVariant, lane) * Math.PI / 180;
}
