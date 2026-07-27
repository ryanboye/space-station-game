import type {
  ApproachInterfaceKind,
  ApproachInterfaceSummary,
  TrafficOffer,
  TrafficOfferPreview
} from './types';

export interface ApproachPreviewInput {
  offer: TrafficOffer;
  interfaces: ApproachInterfaceSummary[];
  now: number;
}

function roundedRange(value: number, spread: number, minimum = 0): { min: number; max: number } {
  const safe = Math.max(minimum, Math.round(value));
  const delta = Math.max(1, Math.round(safe * spread));
  return { min: Math.max(minimum, safe - delta), max: safe + delta };
}

function serviceCuesFor(offer: TrafficOffer): string[] {
  const cues: string[] = [];
  const hospitality = offer.hospitalityDemand;
  if ((hospitality?.meal ?? 0) > 0) cues.push('Meals');
  if ((hospitality?.drink ?? 0) > 0) cues.push('Drinks');
  if ((hospitality?.leisure ?? 0) > 0) cues.push('Leisure');
  if ((hospitality?.hygiene ?? 0) > 0 || (hospitality?.restroom ?? 0) > 0) cues.push('Hygiene');
  if ((hospitality?.comfort ?? 0) > 0) cues.push('Comfort');
  if (offer.inboundCargo.rawMaterial + offer.inboundCargo.rawMeal + offer.inboundCargo.tradeGood > 0) cues.push('Unload cargo');
  if (offer.outboundRequest.rawMaterial + offer.outboundRequest.meal + offer.outboundRequest.tradeGood > 0) cues.push('Load cargo');
  if ((offer.fuelSupply ?? 0) > 0) cues.push('Fuel delivery');
  if ((offer.fuelRequest ?? 0) > 0) cues.push('Refuel');
  return cues.length > 0 ? cues : ['Short turnaround'];
}

/**
 * Pure presentation-facing admission summary. The simulation retains the
 * authoritative validity checks, while this model lets UI show the trade-off
 * without manifest-sized bookkeeping.
 */
export function previewTrafficOffer(input: ApproachPreviewInput): TrafficOfferPreview {
  const { offer, interfaces, now } = input;
  const kind: ApproachInterfaceKind = offer.size === 'small' ? 'pod-dock' : 'berth';
  const matching = interfaces.filter((entry) => entry.kind === kind && entry.compatible);
  const free = matching.filter((entry) => entry.available);
  const reserved = matching.filter((entry) => !entry.available);
  const hospitality = offer.hospitalityDemand;
  const staySeconds = Math.max(1, offer.berthTimeSec);
  const mealDemand = Math.max(0, hospitality?.meal ?? 0);
  const hygieneDemand = Math.max(0, (hospitality?.hygiene ?? 0) + (hospitality?.restroom ?? 0));
  const needsBed = offer.size !== 'small' && staySeconds >= 240 && offer.passengersTotal > 0;
  const berthSeconds = kind === 'berth' ? staySeconds : 0;
  const staffMinutes = Math.ceil(
    offer.passengersTotal * 0.45 +
    (offer.inboundCargo.rawMaterial + offer.inboundCargo.rawMeal + offer.inboundCargo.tradeGood) * 0.08 +
    (offer.outboundRequest.rawMaterial + offer.outboundRequest.meal + offer.outboundRequest.tradeGood) * 0.1 +
    ((offer.fuelSupply ?? 0) + (offer.fuelRequest ?? 0)) * 0.06
  );
  const revenue = Math.max(0, offer.dockingFee + offer.projectedSpend);
  const canHold = offer.status !== 'cleared' && !offer.holdUsed && now >= offer.arrivesAt && now < offer.expiresAt;
  return {
    offerId: offer.id,
    shipClass: kind === 'pod-dock' ? 'pod' : 'berth',
    partySize: roundedRange(offer.passengersTotal, 0.2),
    staySeconds: roundedRange(staySeconds, 0.15, 1),
    serviceCues: serviceCuesFor(offer),
    compatibleInterface: {
      kind,
      compatibleCount: matching.length,
      freeCount: free.length,
      reservedCount: reserved.length,
      interfaces: matching
    },
    expectedRevenue: roundedRange(revenue, 0.18),
    committedLoad: {
      berthSeconds,
      bedNights: needsBed ? Math.max(1, Math.ceil(offer.passengersTotal * staySeconds / 86_400)) : 0,
      meals: mealDemand,
      hygieneVisits: hygieneDemand,
      staffMinutes
    },
    canAccept: offer.status !== 'cleared' && free.length > 0,
    acceptReason: offer.status === 'cleared'
      ? 'Already committed to a physical interface.'
      : free.length > 0
        ? null
        : matching.length > 0
          ? `All compatible ${kind === 'pod-dock' ? 'Pod Docks' : 'berths'} are committed.`
          : `No compatible ${kind === 'pod-dock' ? 'Pod Dock' : 'berth'} is available.`,
    canHold,
    canPass: offer.status !== 'cleared'
  };
}
