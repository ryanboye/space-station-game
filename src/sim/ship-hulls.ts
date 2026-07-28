import type { ShipHullVariant, ShipSize, ShipType } from './types';

export type ShipHullProfile = {
  variant: ShipHullVariant;
  assetStem: string;
  interfaceKind: 'pod' | 'berth';
  compatibleTypes: readonly ShipType[];
  compatibleSizes: readonly ShipSize[];
  /** Native bitmap width / height. Rendering preserves this ratio. */
  nativeAspect: number;
  /** Additional exterior run from the mooring envelope, in whole world tiles. */
  approachDepth: number;
  /** Exterior clearance to either side of the vessel's approach axis. */
  lateralClearance: number;
};

export const SHIP_HULL_VARIANTS: readonly ShipHullVariant[] = [
  'courier-pod',
  'crew-launch',
  'passenger-shuttle',
  'repair-tender',
  'long-freighter',
  'colonist-transport',
  'luxury-liner',
  'corvette'
];

export function isShipHullVariant(value: unknown): value is ShipHullVariant {
  return typeof value === 'string' && (SHIP_HULL_VARIANTS as readonly string[]).includes(value);
}

export const SHIP_HULL_PROFILES: Record<ShipHullVariant, ShipHullProfile> = {
  'courier-pod': {
    variant: 'courier-pod', assetStem: 'ship-pod-courier', interfaceKind: 'pod',
    compatibleTypes: ['tourist', 'trader'], compatibleSizes: ['small'], nativeAspect: 96 / 64,
    approachDepth: 3, lateralClearance: 1
  },
  'crew-launch': {
    variant: 'crew-launch', assetStem: 'ship-pod-crew-launch', interfaceKind: 'pod',
    compatibleTypes: ['industrial', 'military', 'colonist'], compatibleSizes: ['small'], nativeAspect: 112 / 64,
    approachDepth: 4, lateralClearance: 2
  },
  'passenger-shuttle': {
    variant: 'passenger-shuttle', assetStem: 'ship-berth-passenger-shuttle', interfaceKind: 'berth',
    compatibleTypes: ['tourist', 'trader'], compatibleSizes: ['medium'], nativeAspect: 96 / 160,
    // Compact medium craft fit a legacy four-tile berth mouth without extra
    // wing clearance. Broad tenders/transports below deliberately do not.
    approachDepth: 5, lateralClearance: 0
  },
  'repair-tender': {
    variant: 'repair-tender', assetStem: 'ship-berth-repair-tender', interfaceKind: 'berth',
    compatibleTypes: ['industrial'], compatibleSizes: ['medium'], nativeAspect: 128 / 160,
    approachDepth: 6, lateralClearance: 4
  },
  'long-freighter': {
    variant: 'long-freighter', assetStem: 'ship-berth-long-freighter', interfaceKind: 'berth',
    compatibleTypes: ['trader', 'industrial'], compatibleSizes: ['large'], nativeAspect: 96 / 224,
    approachDepth: 12, lateralClearance: 3
  },
  'colonist-transport': {
    variant: 'colonist-transport', assetStem: 'ship-berth-colonist-transport', interfaceKind: 'berth',
    compatibleTypes: ['colonist'], compatibleSizes: ['medium', 'large'], nativeAspect: 128 / 160,
    approachDepth: 7, lateralClearance: 4
  },
  'luxury-liner': {
    variant: 'luxury-liner', assetStem: 'ship-berth-luxury-liner', interfaceKind: 'berth',
    compatibleTypes: ['tourist'], compatibleSizes: ['large'], nativeAspect: 96 / 224,
    approachDepth: 11, lateralClearance: 3
  },
  corvette: {
    variant: 'corvette', assetStem: 'ship-berth-corvette', interfaceKind: 'berth',
    compatibleTypes: ['military'], compatibleSizes: ['medium', 'large'], nativeAspect: 96 / 160,
    approachDepth: 7, lateralClearance: 3
  }
};

function stableHash(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function hullVariantsFor(type: ShipType, size: ShipSize): ShipHullVariant[] {
  return SHIP_HULL_VARIANTS.filter((variant) => {
    const profile = SHIP_HULL_PROFILES[variant];
    return profile.compatibleTypes.includes(type) && profile.compatibleSizes.includes(size);
  });
}

export function isCompatibleShipHullVariant(value: unknown, type: ShipType, size: ShipSize): value is ShipHullVariant {
  return isShipHullVariant(value) && hullVariantsFor(type, size).includes(value);
}

/**
 * Choose from immutable traffic identity, never render timing or mutable RNG.
 * Most current type/size pairs intentionally resolve to one distinct hull; the
 * hash keeps the contract stable when a later content pass adds alternatives.
 */
export function selectShipHullVariant(identity: number | string, type: ShipType, size: ShipSize): ShipHullVariant {
  const compatible = hullVariantsFor(type, size);
  if (compatible.length > 0) return compatible[stableHash(`${identity}|${type}|${size}`) % compatible.length];

  // Old/invalid content should still load to a silhouette compatible with its
  // size rather than letting a renderer silently invent a different craft.
  if (size === 'small') return type === 'tourist' || type === 'trader' ? 'courier-pod' : 'crew-launch';
  if (size === 'large') {
    if (type === 'tourist') return 'luxury-liner';
    if (type === 'colonist') return 'colonist-transport';
    if (type === 'military') return 'corvette';
    return 'long-freighter';
  }
  if (type === 'industrial') return 'repair-tender';
  if (type === 'colonist') return 'colonist-transport';
  if (type === 'military') return 'corvette';
  return 'passenger-shuttle';
}

export function shipHullProfile(variant: ShipHullVariant): ShipHullProfile {
  return SHIP_HULL_PROFILES[variant];
}

export function shipHullAssetPath(variant: ShipHullVariant): string {
  return `assets/ships/${shipHullProfile(variant).assetStem}.png`;
}
