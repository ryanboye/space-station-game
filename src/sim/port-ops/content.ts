import type {
  PortOfferKind,
  HospitalityDemand,
  ShipServiceTag,
  ShipSize,
  ShipType,
  VisitorArchetype
} from '../types';

export interface PortOfferTemplate {
  id: 'passenger-shuttle' | 'freight-relay' | 'mixed-trader';
  offerKind: PortOfferKind;
  shipType: ShipType;
  size: ShipSize;
  passengersTotal: number;
  manifestDemand: { cafeteria: number; market: number; lounge: number };
  manifestMix: Record<VisitorArchetype, number>;
  hospitalityDemand: HospitalityDemand;
  inboundCargo: { rawMaterial: number; rawMeal: number; tradeGood: number };
  outboundRequest: { rawMaterial: number; meal: number; tradeGood: number };
  requestedServices: ShipServiceTag[];
  forecastSec: number;
  berthTimeSec: number;
  dockingFee: number;
  projectedSpend: number;
  riskLabel: 'low' | 'guarded' | 'high';
}

export const PORT_ONBOARDING_OFFERS: readonly PortOfferTemplate[] = [
  {
    id: 'passenger-shuttle',
    offerKind: 'passenger',
    shipType: 'tourist',
    size: 'medium',
    passengersTotal: 10,
    manifestDemand: { cafeteria: 1, market: 0, lounge: 0 },
    manifestMix: { diner: 0.55, shopper: 0.1, lounger: 0.1, rusher: 0.25 },
    hospitalityDemand: { meal: 8, drink: 0, leisure: 0, restroom: 5, hygiene: 0, comfort: 0 },
    inboundCargo: { rawMaterial: 0, rawMeal: 0, tradeGood: 0 },
    outboundRequest: { rawMaterial: 0, meal: 0, tradeGood: 0 },
    requestedServices: ['cafeteria'],
    forecastSec: 18,
    berthTimeSec: 82,
    dockingFee: 70,
    projectedSpend: 150,
    riskLabel: 'low'
  },
  {
    id: 'freight-relay',
    offerKind: 'freight',
    shipType: 'industrial',
    size: 'medium',
    passengersTotal: 0,
    manifestDemand: { cafeteria: 0, market: 0, lounge: 0 },
    manifestMix: { diner: 0.25, shopper: 0.25, lounger: 0.25, rusher: 0.25 },
    hospitalityDemand: { meal: 0, drink: 0, leisure: 0, restroom: 0, hygiene: 0, comfort: 0 },
    inboundCargo: { rawMaterial: 48, rawMeal: 0, tradeGood: 0 },
    outboundRequest: { rawMaterial: 18, meal: 0, tradeGood: 0 },
    requestedServices: [],
    forecastSec: 26,
    berthTimeSec: 112,
    dockingFee: 115,
    projectedSpend: 0,
    riskLabel: 'guarded'
  },
  {
    id: 'mixed-trader',
    offerKind: 'mixed',
    shipType: 'trader',
    size: 'medium',
    passengersTotal: 6,
    manifestDemand: { cafeteria: 0.75, market: 0.25, lounge: 0 },
    manifestMix: { diner: 0.25, shopper: 0.45, lounger: 0.05, rusher: 0.25 },
    hospitalityDemand: { meal: 4, drink: 4, leisure: 3, restroom: 2, hygiene: 0, comfort: 1 },
    inboundCargo: { rawMaterial: 24, rawMeal: 0, tradeGood: 0 },
    outboundRequest: { rawMaterial: 8, meal: 4, tradeGood: 0 },
    requestedServices: ['cafeteria'],
    forecastSec: 34,
    berthTimeSec: 102,
    dockingFee: 95,
    projectedSpend: 78,
    riskLabel: 'guarded'
  }
];

export function onboardingOfferTemplate(index: number): PortOfferTemplate | null {
  return PORT_ONBOARDING_OFFERS[index] ?? null;
}
