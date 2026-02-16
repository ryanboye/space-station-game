import type { ResidentRole } from '../types';

export const RESIDENT_ROLE_WEIGHTS: Record<ResidentRole, number> = {
  none: 0,
  market_helper: 0.34,
  hydro_assist: 0.34,
  civic_watch: 0.32
};

export const RESIDENT_WORK_BONUS = {
  marketUseMultiplier: 1.16,
  hydroOutputMultiplier: 1.12,
  securitySuppressionMultiplier: 1.18
} as const;
