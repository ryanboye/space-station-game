/**
 * Lightweight in-world economy feedback for pod docks.
 *
 * The simulation owns the data and clock. This layer only retains the latest
 * frame snapshot, so it has no timers and cannot drift from save/load state.
 */

/**
 * Structural mirror of the simulation's economy-event categories.
 *
 * Presentation deliberately owns no simulation state, so this stays a plain
 * string alias rather than importing the sim's union: the sim can add a
 * category without a UI edit, and neither module can drift into disagreement
 * about which categories exist.
 */
export type EconomyEventKind = string;

/** Structural match for the opening-economy EconomyEvent contract. */
export interface DockEconomyEvent {
  id: number;
  at: number;
  kind: EconomyEventKind;
  credits: number;
  costBasis: number;
  label: string;
  sourceId?: number;
  tileIndex?: number;
  siteTag?: string;
}

export type DockFeedbackOutcome = 'success' | 'partial' | 'failed';

export interface DockArrivalDemand {
  /** Stable visit id. This should match the departure visit id. */
  visitId: number | string;
  /** Tile occupied by the pod dock module or its interior access tile. */
  dockTileIndex: number;
  /** Short player-facing demand, for example "2 travelers | food + supplies". */
  demand: string;
  /** Optional terse identity, for example "POD 12" or "courier". */
  label?: string;
}

export interface DockDepartureResult {
  /** Stable visit id. A result replaces a matching arrival chip. */
  visitId: number | string;
  dockTileIndex: number;
  /** Simulation timestamp, not wall-clock time. */
  settledAt: number;
  /** Every relevant action from this one visit. */
  events: readonly DockEconomyEvent[];
  /** Optional service description, for example "meals 2 | supplies 1". */
  serviceSummary?: string;
  /** A missed demand makes an otherwise successful trip read as partial. */
  missedOpportunity?: string;
  /** Explicit failures win over the calculated outcome. */
  outcome?: DockFeedbackOutcome;
}

export interface DockEconomyViewport {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DockEconomyFeedbackFrame {
  now: number;
  gridWidth: number;
  gridHeight: number;
  tileSize: number;
  arrivals: readonly DockArrivalDemand[];
  departures: readonly DockDepartureResult[];
  viewport?: DockEconomyViewport | null;
}

export interface DockEconomyFeedbackOptions {
  /** Seconds a departure result remains in the world. Default: 8. */
  resultLifetime?: number;
  /** Limit active world chips to keep dense docks legible. Default: 18. */
  maxVisibleChips?: number;
}

export interface DockEconomyFeedbackStats {
  arrivals: number;
  departures: number;
  visible: number;
}

type ChipTone = 'arrival' | DockFeedbackOutcome;

type Chip = {
  key: string;
  dockTileIndex: number;
  topLine: string;
  bottomLine: string;
  tone: ChipTone;
  alpha: number;
  priority: number;
  expiresAt: number | null;
};

type ChipRect = {
  x: number;
  y: number;
  w: number;
  h: number;
};

const TONES: Record<ChipTone, { accent: string; fill: string }> = {
  arrival: { accent: '#72bff2', fill: 'rgba(5, 14, 25, 0.92)' },
  success: { accent: '#71e5a0', fill: 'rgba(5, 19, 17, 0.94)' },
  partial: { accent: '#ffd36a', fill: 'rgba(25, 19, 6, 0.94)' },
  failed: { accent: '#ff7a76', fill: 'rgba(29, 8, 10, 0.95)' }
};

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function totalCredits(events: readonly DockEconomyEvent[]): number {
  return events.reduce((total, event) => total + event.credits, 0);
}

function resultOutcome(result: DockDepartureResult): DockFeedbackOutcome {
  if (result.outcome) return result.outcome;
  if (result.missedOpportunity) return 'partial';
  if (result.events.some((event) => event.credits < 0 && event.kind !== 'supplier-purchase')) return 'failed';
  return 'success';
}

function formatCredits(credits: number): string {
  const rounded = Math.round(credits);
  return rounded === 0 ? '0c' : `${rounded > 0 ? '+' : '-'}${Math.abs(rounded)}c`;
}

function resultTopLine(result: DockDepartureResult): string {
  const credits = totalCredits(result.events);
  return credits === 0 ? 'SERVICE COMPLETE' : formatCredits(credits);
}

function resultBottomLine(result: DockDepartureResult): string {
  if (result.missedOpportunity) return `MISSED ${result.missedOpportunity}`;
  if (result.serviceSummary) return result.serviceSummary;
  const labels = [...new Set(result.events.map((event) => event.label).filter(Boolean))];
  if (labels.length > 0) return labels.slice(0, 2).join(' | ');
  return resultOutcome(result) === 'failed' ? 'SERVICE FAILED' : 'DEPARTED';
}

function rectsOverlap(a: ChipRect, b: ChipRect, gap: number): boolean {
  return a.x < b.x + b.w + gap && a.x + a.w + gap > b.x && a.y < b.y + b.h + gap && a.y + a.h + gap > b.y;
}

function tileCenter(tileIndex: number, gridWidth: number, tileSize: number): { x: number; y: number } {
  const x = tileIndex % gridWidth;
  const y = Math.floor(tileIndex / gridWidth);
  return { x: (x + 0.5) * tileSize, y: (y + 0.5) * tileSize };
}

function chipRectForDock(
  tileIndex: number,
  width: number,
  height: number,
  frame: DockEconomyFeedbackFrame,
  occupied: ChipRect[]
): ChipRect | null {
  const { tileSize, gridWidth, gridHeight } = frame;
  const worldWidth = gridWidth * tileSize;
  const worldHeight = gridHeight * tileSize;
  const center = tileCenter(tileIndex, gridWidth, tileSize);
  const gap = Math.max(3, tileSize * 0.16);
  const offset = tileSize * 0.7;
  const candidates: ChipRect[] = [
    { x: center.x - width * 0.5, y: center.y - offset - height, w: width, h: height },
    { x: center.x - width * 0.5, y: center.y + offset, w: width, h: height },
    { x: center.x + offset, y: center.y - height * 0.5, w: width, h: height },
    { x: center.x - offset - width, y: center.y - height * 0.5, w: width, h: height }
  ];
  for (let step = 1; step <= 5; step++) {
    candidates.push({
      x: center.x - width * 0.5,
      y: center.y - offset - height - step * (height + gap),
      w: width,
      h: height
    });
    candidates.push({
      x: center.x - width * 0.5,
      y: center.y + offset + step * (height + gap),
      w: width,
      h: height
    });
  }

  for (const candidate of candidates) {
    candidate.x = Math.max(gap, Math.min(worldWidth - candidate.w - gap, candidate.x));
    candidate.y = Math.max(gap, Math.min(worldHeight - candidate.h - gap, candidate.y));
    if (frame.viewport && (
      candidate.x + candidate.w < frame.viewport.x ||
      candidate.x > frame.viewport.x + frame.viewport.width ||
      candidate.y + candidate.h < frame.viewport.y ||
      candidate.y > frame.viewport.y + frame.viewport.height
    )) {
      continue;
    }
    if (!occupied.some((entry) => rectsOverlap(candidate, entry, gap))) {
      occupied.push(candidate);
      return candidate;
    }
  }
  return null;
}

/**
 * Canvas-only controller. Call update once from the render frame, then render.
 * It never starts timers; fade timing is entirely controlled by frame.now.
 */
export class DockEconomyFeedbackLayer {
  private frame: DockEconomyFeedbackFrame | null = null;
  private chips: Chip[] = [];
  private readonly resultLifetime: number;
  private readonly maxVisibleChips: number;

  constructor(options: DockEconomyFeedbackOptions = {}) {
    this.resultLifetime = Math.max(1, options.resultLifetime ?? 8);
    this.maxVisibleChips = Math.max(1, Math.floor(options.maxVisibleChips ?? 18));
  }

  update(frame: DockEconomyFeedbackFrame): DockEconomyFeedbackStats {
    const departures = new Map<string, DockDepartureResult>();
    for (const result of frame.departures) {
      if (result.dockTileIndex < 0 || result.dockTileIndex >= frame.gridWidth * frame.gridHeight) continue;
      if (frame.now < result.settledAt || frame.now - result.settledAt >= this.resultLifetime) continue;
      const key = String(result.visitId);
      const existing = departures.get(key);
      if (!existing || result.settledAt > existing.settledAt) departures.set(key, result);
    }

    const chips: Chip[] = [];
    for (const arrival of frame.arrivals) {
      if (arrival.dockTileIndex < 0 || arrival.dockTileIndex >= frame.gridWidth * frame.gridHeight) continue;
      if (departures.has(String(arrival.visitId))) continue;
      chips.push({
        key: `arrival:${arrival.visitId}`,
        dockTileIndex: arrival.dockTileIndex,
        topLine: arrival.label?.toUpperCase() ?? 'DOCKED POD',
        bottomLine: arrival.demand,
        tone: 'arrival',
        alpha: 0.96,
        priority: 1,
        expiresAt: null
      });
    }

    for (const result of departures.values()) {
      const age = Math.max(0, frame.now - result.settledAt);
      const remaining = clamp01((this.resultLifetime - age) / Math.min(2, this.resultLifetime));
      chips.push({
        key: `departure:${result.visitId}:${result.settledAt}`,
        dockTileIndex: result.dockTileIndex,
        topLine: resultTopLine(result),
        bottomLine: resultBottomLine(result),
        tone: resultOutcome(result),
        alpha: remaining,
        priority: 2,
        expiresAt: result.settledAt + this.resultLifetime
      });
    }

    this.frame = frame;
    this.chips = chips
      .sort((a, b) => b.priority - a.priority || a.dockTileIndex - b.dockTileIndex || a.key.localeCompare(b.key))
      .slice(0, this.maxVisibleChips);

    return {
      arrivals: chips.filter((chip) => chip.tone === 'arrival').length,
      departures: chips.filter((chip) => chip.tone !== 'arrival').length,
      visible: this.chips.length
    };
  }

  /** Remove expired state after a caller stops supplying a frame. */
  cleanup(now: number): void {
    if (!this.frame) return;
    if (now < this.frame.now) return;
    this.chips = this.chips.filter((chip) => chip.expiresAt === null || now < chip.expiresAt);
    if (this.chips.length === 0) this.frame = null;
  }

  render(ctx: CanvasRenderingContext2D): void {
    if (!this.frame || this.chips.length === 0) return;
    const { tileSize } = this.frame;
    const fontSize = Math.max(7, Math.round(tileSize * 0.3));
    const chipHeight = Math.max(20, Math.round(tileSize * 0.9));
    const horizontalPadding = Math.max(10, Math.round(tileSize * 0.48));
    const occupied: ChipRect[] = [];

    ctx.save();
    ctx.font = `bold ${fontSize}px monospace`;
    for (const chip of this.chips) {
      if (chip.alpha <= 0) continue;
      const widestLine = Math.max(ctx.measureText(chip.topLine).width, ctx.measureText(chip.bottomLine).width);
      const width = Math.max(tileSize * 3.4, Math.min(tileSize * 8.4, widestLine + horizontalPadding));
      const rect = chipRectForDock(chip.dockTileIndex, width, chipHeight, this.frame, occupied);
      if (!rect) continue;
      const tone = TONES[chip.tone];
      ctx.save();
      ctx.globalAlpha = chip.alpha;
      ctx.fillStyle = tone.fill;
      ctx.strokeStyle = tone.accent;
      ctx.lineWidth = Math.max(1, Math.round(tileSize * 0.045));
      ctx.beginPath();
      ctx.roundRect(rect.x, rect.y, rect.w, rect.h, Math.max(2, Math.round(tileSize * 0.12)));
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = tone.accent;
      ctx.fillRect(rect.x, rect.y, Math.max(2, Math.round(tileSize * 0.12)), rect.h);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      const x = rect.x + Math.max(5, Math.round(tileSize * 0.28));
      ctx.font = `bold ${fontSize}px monospace`;
      ctx.fillStyle = '#eff7ff';
      ctx.fillText(chip.topLine, x, rect.y + rect.h * 0.32);
      ctx.font = `${Math.max(7, Math.round(tileSize * 0.26))}px monospace`;
      ctx.fillStyle = tone.accent;
      ctx.fillText(chip.bottomLine, x, rect.y + rect.h * 0.72);
      ctx.restore();
    }
    ctx.restore();
  }

  clear(): void {
    this.frame = null;
    this.chips = [];
  }

  dispose(): void {
    this.clear();
  }
}
