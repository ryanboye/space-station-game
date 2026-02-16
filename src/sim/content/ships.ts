import type { ShipProfile, ShipType } from '../types';

export const SHIP_PROFILES: Record<ShipType, ShipProfile> = {
  tourist: {
    type: 'tourist',
    serviceTags: ['cafeteria', 'lounge'],
    manifestBaseline: { cafeteria: 0.42, market: 0.36, lounge: 0.22 },
    militaryPenaltyWeight: 0,
    conversionChanceMultiplier: 1
  },
  trader: {
    type: 'trader',
    serviceTags: ['market', 'cafeteria'],
    manifestBaseline: { cafeteria: 0.35, market: 0.5, lounge: 0.15 },
    militaryPenaltyWeight: 0,
    conversionChanceMultiplier: 0.9
  },
  industrial: {
    type: 'industrial',
    serviceTags: ['workshop', 'market', 'cafeteria'],
    manifestBaseline: { cafeteria: 0.22, market: 0.58, lounge: 0.2 },
    militaryPenaltyWeight: 0,
    conversionChanceMultiplier: 0.7
  },
  military: {
    type: 'military',
    serviceTags: ['security', 'cafeteria', 'hygiene'],
    manifestBaseline: { cafeteria: 0.46, market: 0.28, lounge: 0.26 },
    militaryPenaltyWeight: 1.25,
    conversionChanceMultiplier: 0.55
  },
  colonist: {
    type: 'colonist',
    serviceTags: ['housing', 'hygiene', 'cafeteria', 'lounge'],
    manifestBaseline: { cafeteria: 0.44, market: 0.16, lounge: 0.4 },
    militaryPenaltyWeight: 0,
    conversionChanceMultiplier: 2.1
  }
};
