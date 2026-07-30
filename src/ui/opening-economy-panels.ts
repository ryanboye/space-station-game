// Opening-economy presentation surface. This module deliberately owns no
// simulation state: the caller supplies a compact view model and handles every
// decision through semantic callbacks.

export type MarketPricingPolicy = 'budget' | 'standard' | 'premium';
export type RetailAssortmentMix = 'essentials' | 'gifts' | 'technical';

/**
 * Structural mirror of the simulation's economy-event categories.
 *
 * Presentation deliberately owns no simulation state, so this stays a plain
 * string alias rather than importing the sim's union: the sim can add a
 * category without a UI edit, and neither module can drift into disagreement
 * about which categories exist.
 */
export type EconomyEventKind = string;

export interface OpeningEconomyEvent {
  id: number;
  at: number;
  kind: EconomyEventKind;
  credits: number;
  costBasis: number;
  label: string;
  detail?: string;
}

export interface OperatingLedgerView {
  credits: number;
  windowLabel: string;
  revenue: number;
  expenses: number;
  net: number;
  groups?: Array<{
    label: string;
    credits: number;
    tone?: 'good' | 'neutral' | 'warn';
  }>;
  events: OpeningEconomyEvent[];
}

/** Which consumable a supplier panel is buying. Fuel and retail stock share the panel. */
export type SupplierShopKind = 'travel-supplies' | 'fuel';

export interface TravelSuppliesShopView {
  /** Defaults to travel supplies so existing callers and checks stay valid. */
  kind?: SupplierShopKind;
  /** Panel heading, e.g. "Travel Supplies Shop" or "Fuel Depot". */
  title?: string;
  /** Plural noun for the thing being bought, e.g. "supplies", "fuel". */
  unitNoun?: string;
  stock: number;
  capacity: number;
  wholesaleUnitCost: number;
  saleUnitPrice: number;
  recentUnitsSold: number;
  recentMargin: number;
  demandLabel: string;
  demandDetail?: string;
  /** Retail-only. Omitted for fuel, which has no shelf pricing policy. */
  pricingPolicy?: MarketPricingPolicy;
  canOrderStock: boolean;
  orderLabel?: string;
  orderCost?: number;
  emptyStockMessage?: string;
  /**
   * Player-chosen order size. Present whenever the panel offers a quantity
   * control; absent falls back to a single fixed-batch button.
   */
  order?: {
    units: number;
    /** Increment for the -/+ controls, normally one supplier batch. */
    step: number;
    /** Ceiling from remaining storage capacity. */
    maxUnits: number;
    /** Largest order the current credit balance covers, for the "Max" control. */
    affordableUnits: number;
    /** Site-adjusted landed cost per unit. */
    unitCost: number;
    /** How local costs move the price, e.g. "96% wholesale at this site". */
    priceBasis?: string;
  };
  /** Present only when the panel is anchored to an assortment-bearing display. */
  assortment?: {
    fixtureLabel: string;
    mix: RetailAssortmentMix;
    options: Array<{
      mix: RetailAssortmentMix;
      label: string;
      appealPercent: number;
      marginPercent: number;
      satisfies: string;
    }>;
  };
}

export interface SiteBriefView {
  title?: string;
  primary: string;
  secondary?: string;
  /** Expected ship mix, present only when the forecast knew the SystemMap. */
  composition?: string;
  traits: Array<{
    label: string;
    detail: string;
    tone?: 'good' | 'neutral' | 'warn';
  }>;
}

export interface ProjectConditionView {
  label: string;
  current: number;
  target: number;
}

export interface ProjectView {
  id: string;
  title: string;
  description: string;
  state: 'available' | 'active' | 'complete';
  advance?: number;
  reward?: number;
  conditions: ProjectConditionView[];
}

export interface ProjectsView {
  maxActive: number;
  activeCount: number;
  projects: ProjectView[];
}

export interface OpeningEconomyPanelView {
  ledger: OperatingLedgerView;
  shop?: TravelSuppliesShopView;
  siteBrief?: SiteBriefView;
  projects?: ProjectsView;
}

export type OpeningEconomyPanelAction =
  | { type: 'order-stock' }
  | { type: 'set-order-units'; units: number }
  | { type: 'set-pricing-policy'; policy: MarketPricingPolicy }
  | { type: 'set-shelf-mix'; mix: RetailAssortmentMix }
  | { type: 'accept-project'; projectId: string }
  | { type: 'open-ledger' }
  | { type: 'open-shop' }
  | { type: 'open-projects' }
  | { type: 'close-panel'; panel: OpeningEconomyPanelName };

export type OpeningEconomyPanelName = 'ledger' | 'shop' | 'projects';

/**
 * Viewport-space point a panel should hang off, in client pixels.
 *
 * Operations belong at the thing they operate on, so a panel opened from a
 * physical fixture is placed beside that fixture instead of in the middle of
 * the screen. The caller owns the world-to-screen conversion and re-supplies
 * the point whenever the camera moves; this module only does the placement and
 * the viewport clamp.
 */
export interface OpeningEconomyPanelAnchor {
  x: number;
  y: number;
}

export interface OpeningEconomyPanelsOptions {
  /** Host element, typically the game root. */
  host: HTMLElement;
  /** Called for player decisions. The controller never mutates game state. */
  onAction?: (action: OpeningEconomyPanelAction) => void;
  /** Starts with the compact Site Brief visible. Defaults to true. */
  showSiteBrief?: boolean;
  /**
   * Optional container that owns the Site Brief's placement. Pass the game's
   * floating left stack so the brief flows beneath the existing cards instead
   * of being positioned over whatever else occupies that corner.
   */
  siteBriefHost?: HTMLElement | null;
}

export interface OpeningEconomyPanelsController {
  render(view: OpeningEconomyPanelView): void;
  /** Opens centered, or beside `anchor` when the caller has a world fixture. */
  open(panel: OpeningEconomyPanelName, anchor?: OpeningEconomyPanelAnchor | null): void;
  /** Keeps an already-anchored panel pinned while the camera moves. */
  setAnchor(anchor: OpeningEconomyPanelAnchor | null): void;
  /** The panel currently open, so the caller can drop a stale anchor. */
  openPanelName(): OpeningEconomyPanelName | null;
  close(): void;
  setSiteBriefVisible(visible: boolean): void;
  destroy(): void;
}

const STYLE_ID = 'opening-economy-panel-styles';

const STYLE_TEXT = `
.oe-panels {
  --oe-surface: #111c26;
  --oe-surface-strong: #172635;
  --oe-line: #34506a;
  --oe-text: #e3edf0;
  --oe-muted: #94a8b6;
  --oe-good: #70d99e;
  --oe-warn: #f2bf65;
  --oe-danger: #ee7777;
  position: fixed;
  inset: 0;
  z-index: 46;
  pointer-events: none;
  color: var(--oe-text);
  font-family: Consolas, Menlo, Monaco, monospace;
}
.oe-site-brief {
  position: fixed;
  top: 104px;
  right: 350px;
  width: min(302px, calc(100vw - 20px));
  box-sizing: border-box;
  padding: 9px 10px 10px;
  border: 1px solid rgba(113, 151, 173, 0.68);
  border-radius: 4px;
  background: rgba(8, 16, 24, 0.88);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.25);
  pointer-events: auto;
}
.ui-panels-hidden .oe-site-brief { right: 10px; }
/* Placed by a host stack: flow with its siblings instead of over them. */
.oe-site-brief-stacked,
.ui-panels-hidden .oe-site-brief-stacked {
  position: static;
  top: auto;
  right: auto;
  width: min(320px, calc(100vw - 36px));
}
.oe-site-kicker, .oe-panel-kicker, .oe-metric-label, .oe-event-time {
  display: block;
  color: var(--oe-muted);
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0;
  line-height: 1.25;
  text-transform: uppercase;
}
.oe-site-title {
  display: block;
  margin-top: 3px;
  color: #f0f6f8;
  font-size: 13px;
  line-height: 1.25;
}
.oe-site-detail {
  margin: 4px 0 0;
  color: #a7bac6;
  font-size: 10px;
  line-height: 1.35;
}
.oe-traits {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 8px;
}
.oe-trait {
  max-width: 100%;
  padding: 3px 5px;
  border: 1px solid rgba(99, 132, 151, 0.48);
  border-radius: 3px;
  color: #bbcad0;
  font-size: 9px;
  line-height: 1.3;
}
.oe-trait strong { color: #e4edf0; font-weight: 700; }
.oe-trait.good { border-color: rgba(89, 190, 137, 0.58); color: #a5dbbe; }
.oe-trait.warn { border-color: rgba(232, 174, 73, 0.65); color: #edca8a; }
.oe-site-actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 5px;
  margin-top: 8px;
}
.oe-site-actions-single { grid-template-columns: 1fr; }
.oe-site-action {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 6px;
  min-height: 31px;
  padding: 5px 7px;
  border: 1px solid rgba(105, 145, 169, 0.62);
  border-radius: 3px;
  background: rgba(19, 39, 55, 0.82);
  color: #dceaf0;
  cursor: pointer;
  font: 10px Consolas, Menlo, Monaco, monospace;
  text-align: left;
}
.oe-site-action:hover,
.oe-site-action:focus-visible { border-color: #a7cfdf; background: rgba(31, 61, 80, 0.92); }
.oe-site-action b { color: #82d9a8; font-size: 9px; font-weight: 700; white-space: nowrap; }
.oe-site-action.warn b { color: #efc36f; }
.oe-panel-layer {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  padding: 16px;
  background: rgba(3, 8, 13, 0.5);
  pointer-events: auto;
}
.oe-panel-layer[hidden], .oe-site-brief[hidden] { display: none; }
/* Anchored to a world fixture: no dimming scrim, and the layer stops eating
   clicks so the station stays operable behind the panel. */
.oe-panel-layer.is-anchored {
  display: block;
  padding: 0;
  background: none;
  pointer-events: none;
}
.oe-panel {
  width: min(440px, 100%);
  max-height: min(680px, calc(100vh - 32px));
  overflow: auto;
  border: 1px solid #49677d;
  border-radius: 5px;
  background: linear-gradient(180deg, #182735 0%, #101a24 100%);
  box-shadow: 0 22px 60px rgba(0, 0, 0, 0.52);
}
.oe-panel-layer.is-anchored .oe-panel {
  position: absolute;
  width: min(376px, calc(100vw - 20px));
  max-height: min(520px, calc(100vh - 24px));
  border-color: #6ba9c4;
  box-shadow: 0 14px 38px rgba(0, 0, 0, 0.62);
  pointer-events: auto;
}
/* Leader mark back toward the fixture the panel was opened from. */
.oe-panel-layer.is-anchored .oe-panel::before {
  content: '';
  position: absolute;
  top: 12px;
  left: -5px;
  width: 9px;
  height: 9px;
  border-left: 1px solid #6ba9c4;
  border-bottom: 1px solid #6ba9c4;
  background: #182735;
  transform: rotate(45deg);
}
.oe-panel-layer.is-anchored .oe-panel.anchor-right::before { left: auto; right: -5px; transform: rotate(225deg); }
.oe-panel-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 14px 10px;
  border-bottom: 1px solid rgba(98, 137, 159, 0.42);
}
.oe-panel-head h2 { margin: 3px 0 0; font-size: 16px; line-height: 1.2; }
.oe-close {
  width: 28px;
  min-width: 28px;
  height: 28px;
  padding: 0;
  border: 1px solid #49677d;
  border-radius: 3px;
  background: #132230;
  color: #c5d7e1;
  cursor: pointer;
  font: 20px/1 Arial, sans-serif;
}
.oe-close:hover, .oe-close:focus-visible { border-color: #b5d0dd; background: #21384a; }
.oe-panel-body { padding: 12px 14px 14px; }
.oe-summary-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 7px; }
.oe-metric {
  min-width: 0;
  padding: 8px;
  border-left: 2px solid #4e6f85;
  background: rgba(8, 17, 25, 0.42);
}
.oe-metric strong { display: block; margin-top: 3px; font-size: 15px; line-height: 1.1; }
.oe-metric.good { border-left-color: var(--oe-good); }
.oe-metric.warn { border-left-color: var(--oe-warn); }
.oe-metric .good { color: var(--oe-good); }
.oe-metric .warn { color: var(--oe-warn); }
.oe-section-title { margin: 16px 0 7px; color: #c3d5dd; font-size: 10px; letter-spacing: 0; text-transform: uppercase; }
.oe-group-list, .oe-event-list, .oe-project-list { display: grid; gap: 5px; }
.oe-group, .oe-event {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
  padding: 7px 8px;
  border-bottom: 1px solid rgba(98, 137, 159, 0.24);
  background: rgba(6, 13, 19, 0.24);
  color: #bed0d8;
  font-size: 11px;
}
.oe-group:last-child, .oe-event:last-child { border-bottom: 0; }
.oe-amount { color: #dbe8ed; font-weight: 700; white-space: nowrap; }
.oe-amount.good { color: var(--oe-good); }
.oe-amount.warn { color: var(--oe-warn); }
.oe-amount.expense { color: #e89191; }
.oe-event-copy { min-width: 0; }
.oe-event-copy strong { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #dbe8ed; font-size: 11px; }
.oe-event-copy small { display: block; margin-top: 2px; color: #889eab; font-size: 9px; line-height: 1.25; }
.oe-empty { margin: 0; color: #91a5b0; font-size: 11px; line-height: 1.45; }
.oe-shop-hero {
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: 14px;
  padding-bottom: 11px;
  border-bottom: 1px solid rgba(98, 137, 159, 0.36);
}
.oe-stock { color: #f2f6f7; font-size: 25px; font-weight: 700; line-height: 1; }
.oe-stock small { color: #93a8b5; font-size: 11px; font-weight: 400; }
.oe-demand { max-width: 200px; color: #bad4c7; font-size: 11px; line-height: 1.35; text-align: right; }
.oe-demand small { display: block; margin-top: 3px; color: #879fac; font-size: 9px; }
.oe-shop-stats { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 7px; margin-top: 11px; }
.oe-shop-stat { min-width: 0; padding: 8px; border: 1px solid rgba(98, 137, 159, 0.32); background: rgba(6, 13, 19, 0.28); }
.oe-shop-stat strong { display: block; margin-top: 3px; font-size: 13px; line-height: 1.2; }
.oe-policy-label { margin: 15px 0 6px; color: #bacbd3; font-size: 10px; letter-spacing: 0; text-transform: uppercase; }
.oe-policy-row { display: grid; grid-template-columns: repeat(3, 1fr); gap: 5px; }
.oe-policy {
  min-height: 38px;
  padding: 6px;
  border: 1px solid #49677d;
  border-radius: 3px;
  background: #122131;
  color: #b8cad2;
  cursor: pointer;
  font: 10px Consolas, Menlo, Monaco, monospace;
}
.oe-policy:hover, .oe-policy:focus-visible { border-color: #a8cbd6; background: #1d3445; }

.oe-qty-row { display: flex; align-items: stretch; gap: 6px; margin-top: 5px; }
.oe-qty-step, .oe-qty-preset {
  flex: 0 0 auto;
  min-width: 32px;
  padding: 6px 9px;
  color: #cfe3ec;
  background: #16293a;
  border: 1px solid #49677d;
  border-radius: 3px;
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}
.oe-qty-preset { font-size: 11px; letter-spacing: 0.04em; text-transform: uppercase; }
.oe-qty-step:hover:not(:disabled), .oe-qty-preset:hover,
.oe-qty-step:focus-visible, .oe-qty-preset:focus-visible { border-color: #a8cbd6; background: #1d3445; }
.oe-qty-step:disabled { opacity: 0.4; cursor: default; }
.oe-qty-value { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.oe-qty-value input {
  width: 100%;
  box-sizing: border-box;
  padding: 6px 8px;
  color: #eff7ff;
  background: rgba(6, 13, 19, 0.62);
  border: 1px solid #49677d;
  border-radius: 3px;
  font: inherit;
  font-size: 13px;
  text-align: center;
}
.oe-qty-value input:focus-visible { border-color: #a8cbd6; outline: none; }
.oe-qty-value small { color: #8fadbd; font-size: 10px; text-align: center; }
.oe-policy.active { border-color: #dfb75f; background: rgba(92, 66, 22, 0.48); color: #f4d78e; }
.oe-primary-action {
  width: 100%;
  min-height: 41px;
  margin-top: 13px;
  padding: 8px 10px;
  border: 1px solid #6ec79a;
  border-radius: 3px;
  background: rgba(32, 93, 67, 0.48);
  color: #d6f0e2;
  cursor: pointer;
  font: 11px Consolas, Menlo, Monaco, monospace;
}
.oe-primary-action:hover, .oe-primary-action:focus-visible { border-color: #b2edcf; background: rgba(47, 122, 88, 0.64); }
.oe-primary-action:disabled { border-color: #485a64; background: #142029; color: #73878f; cursor: default; }
.oe-stockout { margin: 9px 0 0; color: #f0c579; font-size: 10px; line-height: 1.35; }
.oe-project {
  padding: 10px;
  border: 1px solid rgba(98, 137, 159, 0.42);
  background: rgba(6, 13, 19, 0.26);
}
.oe-project-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; }
.oe-project h3 { margin: 0; color: #e4edf0; font-size: 12px; line-height: 1.25; }
.oe-project-state { color: #9ab6c4; font-size: 9px; letter-spacing: 0; text-transform: uppercase; white-space: nowrap; }
.oe-project.complete .oe-project-state { color: var(--oe-good); }
.oe-project p { margin: 5px 0 0; color: #94aab5; font-size: 10px; line-height: 1.4; }
.oe-project-terms { display: flex; flex-wrap: wrap; gap: 5px 10px; margin-top: 8px; color: #e3c77f; font-size: 10px; }
.oe-progress-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 7px; align-items: center; margin-top: 6px; color: #bacbd2; font-size: 10px; }
.oe-progress-track { grid-column: 1 / -1; height: 4px; overflow: hidden; background: #0b141d; }
.oe-progress-track i { display: block; height: 100%; background: #70c7a1; }
.oe-project-action { margin-top: 10px; min-height: 32px; padding: 5px 8px; border: 1px solid #6284a0; border-radius: 3px; background: #173048; color: #dbeaf0; cursor: pointer; font: 10px Consolas, Menlo, Monaco, monospace; }
.oe-project-action:hover, .oe-project-action:focus-visible { border-color: #b8d6e4; background: #244762; }
.oe-project-action:disabled { border-color: #435560; background: #152029; color: #788992; cursor: default; }
@media (max-width: 600px) {
  .oe-site-brief { top: 6px; right: 6px; width: min(270px, calc(100vw - 12px)); }
  .oe-summary-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .oe-shop-stats { grid-template-columns: 1fr; }
  .oe-panel-layer { padding: 8px; }
  .oe-panel { max-height: calc(100vh - 16px); }
}
`;

function ensureStyles(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = STYLE_TEXT;
  document.head.appendChild(style);
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;'
  })[character] ?? character);
}

function credits(value: number): string {
  const prefix = value > 0 ? '+' : value < 0 ? '-' : '';
  return `${prefix}${Math.abs(Math.round(value))}c`;
}

function eventTime(value: number): string {
  if (!Number.isFinite(value) || value < 0) return 'recent';
  const seconds = Math.max(0, Math.floor(value));
  if (seconds < 60) return `${seconds}s ago`;
  return `${Math.floor(seconds / 60)}m ago`;
}

function amountClass(value: number): string {
  if (value > 0) return 'good';
  if (value < 0) return 'expense';
  return '';
}

function safeRatio(current: number, target: number): number {
  if (target <= 0) return current > 0 ? 1 : 0;
  return Math.max(0, Math.min(1, current / target));
}

function renderLedger(view: OperatingLedgerView): string {
  const groups = view.groups ?? [];
  const events = view.events.slice(0, 12);
  return `
    <section class="oe-panel" role="dialog" aria-modal="true" aria-labelledby="oe-ledger-title">
      <header class="oe-panel-head">
        <div><span class="oe-panel-kicker">Operating ledger</span><h2 id="oe-ledger-title">Credits and cash flow</h2></div>
        <button class="oe-close" type="button" data-oe-close="ledger" aria-label="Close credits ledger" title="Close">&times;</button>
      </header>
      <div class="oe-panel-body">
        <div class="oe-summary-grid">
          <div class="oe-metric"><span class="oe-metric-label">Credits</span><strong>${credits(view.credits)}</strong></div>
          <div class="oe-metric good"><span class="oe-metric-label">Revenue</span><strong class="good">${credits(view.revenue)}</strong></div>
          <div class="oe-metric warn"><span class="oe-metric-label">Expenses</span><strong class="warn">${credits(-Math.abs(view.expenses))}</strong></div>
          <div class="oe-metric ${view.net >= 0 ? 'good' : 'warn'}"><span class="oe-metric-label">Net</span><strong class="${view.net >= 0 ? 'good' : 'warn'}">${credits(view.net)}</strong></div>
        </div>
        <h3 class="oe-section-title">${escapeHtml(view.windowLabel)}</h3>
        ${groups.length > 0 ? `<div class="oe-group-list">${groups.map((group) => `<div class="oe-group"><span>${escapeHtml(group.label)}</span><span class="oe-amount ${group.tone === 'warn' ? 'warn' : group.credits < 0 ? 'expense' : group.tone === 'good' || group.credits > 0 ? 'good' : ''}">${credits(group.credits)}</span></div>`).join('')}</div>` : '<p class="oe-empty">Transactions will collect here as the station begins trading.</p>'}
        <h3 class="oe-section-title">Recent transactions</h3>
        ${events.length > 0 ? `<div class="oe-event-list">${events.map((event) => `<div class="oe-event"><div class="oe-event-copy"><strong>${escapeHtml(event.label)}</strong>${event.detail ? `<small>${escapeHtml(event.detail)}</small>` : ''}</div><div><span class="oe-event-time">${eventTime(event.at)}</span><span class="oe-amount ${amountClass(event.credits)}">${credits(event.credits)}</span></div></div>`).join('')}</div>` : '<p class="oe-empty">No completed transactions in this operating window.</p>'}
      </div>
    </section>`;
}

/** Pure markup seam used by focused UI checks as well as the mounted panel. */
export function renderTravelSuppliesShop(view: TravelSuppliesShopView): string {
  const isFuel = view.kind === 'fuel';
  const title = view.title ?? (isFuel ? 'Fuel Depot' : 'Travel Supplies Shop');
  const kicker = isFuel ? 'Ship services' : 'Station retail';
  const noun = view.unitNoun ?? (isFuel ? 'fuel' : 'supplies');
  const orderText = view.orderLabel ?? 'Order stock';
  const orderCost = view.orderCost === undefined ? '' : ` (${credits(-Math.abs(view.orderCost))})`;
  const stockout = view.stock <= 0
    ? `<p class="oe-stockout">${escapeHtml(view.emptyStockMessage ?? (isFuel
        ? 'No fuel in the tanks. Order a supplier pod or ships cannot refuel.'
        : 'The shop is out of stock. Travelers cannot buy supplies until a delivery arrives.'))}</p>`
    : '';
  // Quantity control. The order size is the player's decision, so the panel
  // shows the landed unit cost, the running total, and what the local site does
  // to the price rather than committing a hidden fixed batch.
  const order = view.order;
  const quantity = order
    ? `
        <div class="oe-policy-label">Order size${order.priceBasis ? ` <small>${escapeHtml(order.priceBasis)}</small>` : ''}</div>
        <div class="oe-qty-row" aria-label="Order quantity">
          <button type="button" class="oe-qty-step" data-oe-order-units="${Math.max(1, order.units - order.step)}" ${order.units <= 1 ? 'disabled' : ''} aria-label="Decrease order by ${order.step}">&minus;</button>
          <label class="oe-qty-value">
            <input type="number" inputmode="numeric" min="1" max="${Math.max(1, order.maxUnits)}" step="1" value="${order.units}" data-oe-order-input aria-label="Units of ${escapeHtml(noun)} to order">
            <small>${escapeHtml(noun)} &middot; ${credits(order.unitCost)}/unit</small>
          </label>
          <button type="button" class="oe-qty-step" data-oe-order-units="${Math.min(order.maxUnits, order.units + order.step)}" ${order.units >= order.maxUnits ? 'disabled' : ''} aria-label="Increase order by ${order.step}">+</button>
          <button type="button" class="oe-qty-preset" data-oe-order-units="${Math.max(1, Math.min(order.maxUnits, order.affordableUnits))}" title="Largest order your credits cover">Max</button>
          <button type="button" class="oe-qty-preset" data-oe-order-units="${Math.max(1, order.maxUnits)}" title="Fill remaining storage">Fill</button>
        </div>`
    : '';
  return `
    <section class="oe-panel" role="dialog" aria-modal="true" aria-labelledby="oe-shop-title">
      <header class="oe-panel-head">
        <div><span class="oe-panel-kicker">${escapeHtml(kicker)}</span><h2 id="oe-shop-title">${escapeHtml(title)}</h2></div>
        <button class="oe-close" type="button" data-oe-close="shop" aria-label="Close ${escapeHtml(title)}" title="Close">&times;</button>
      </header>
      <div class="oe-panel-body">
        <div class="oe-shop-hero">
          <div><span class="oe-metric-label">Stock on hand</span><div class="oe-stock">${Math.max(0, Math.round(view.stock))}<small> / ${Math.max(0, Math.round(view.capacity))} units</small></div></div>
          <div class="oe-demand">${escapeHtml(view.demandLabel)}${view.demandDetail ? `<small>${escapeHtml(view.demandDetail)}</small>` : ''}</div>
        </div>
        <div class="oe-shop-stats">
          <div class="oe-shop-stat"><span class="oe-metric-label">Wholesale</span><strong>${credits(view.wholesaleUnitCost)} / unit</strong></div>
          <div class="oe-shop-stat"><span class="oe-metric-label">Baseline sale</span><strong class="good">${credits(view.saleUnitPrice)} / unit</strong></div>
          <div class="oe-shop-stat"><span class="oe-metric-label">Recent margin</span><strong class="${view.recentMargin >= 0 ? 'good' : 'warn'}">${credits(view.recentMargin)} <small>(${Math.max(0, Math.round(view.recentUnitsSold))} sold)</small></strong></div>
        </div>
        ${quantity}
        ${view.pricingPolicy ? `
        <div class="oe-policy-label">Pricing policy</div>
        <div class="oe-policy-row" aria-label="Travel supplies pricing policy">
          ${(['budget', 'standard', 'premium'] as const).map((policy) => `<button type="button" class="oe-policy${view.pricingPolicy === policy ? ' active' : ''}" data-oe-policy="${policy}" aria-pressed="${view.pricingPolicy === policy}">${policy[0].toUpperCase()}${policy.slice(1)}</button>`).join('')}
        </div>
        ` : ''}
        ${view.assortment ? `
          <div class="oe-policy-label">${escapeHtml(view.assortment.fixtureLabel)} assortment</div>
          <div class="oe-policy-row" aria-label="Fixture goods category">
            ${view.assortment.options.map((option) => `<button type="button" class="oe-policy${view.assortment!.mix === option.mix ? ' active' : ''}" data-oe-shelf-mix="${option.mix}" aria-pressed="${view.assortment!.mix === option.mix}" title="${option.appealPercent}% appeal · ${option.marginPercent}% margin · suits ${escapeHtml(option.satisfies)}">${escapeHtml(option.label)}</button>`).join('')}
          </div>
        ` : ''}
        <button class="oe-primary-action" type="button" data-oe-order-stock ${view.canOrderStock ? '' : 'disabled'}>${escapeHtml(orderText)}${orderCost}</button>
        ${stockout}
      </div>
    </section>`;
}

function projectTerms(project: ProjectView): string {
  const terms: string[] = [];
  if (project.advance && project.advance > 0) terms.push(`Advance ${credits(project.advance)}`);
  if (project.reward && project.reward > 0) terms.push(`Award ${credits(project.reward)}`);
  return terms.map((term) => `<span>${escapeHtml(term)}</span>`).join('');
}

function renderProjects(view: ProjectsView): string {
  return `
    <section class="oe-panel" role="dialog" aria-modal="true" aria-labelledby="oe-projects-title">
      <header class="oe-panel-head">
        <div><span class="oe-panel-kicker">Optional capital</span><h2 id="oe-projects-title">Projects <span class="oe-event-time">${view.activeCount}/${view.maxActive} active</span></h2></div>
        <button class="oe-close" type="button" data-oe-close="projects" aria-label="Close projects" title="Close">&times;</button>
      </header>
      <div class="oe-panel-body">
        <div class="oe-project-list">
          ${view.projects.map((project) => {
            const canAccept = project.state === 'available' && view.activeCount < view.maxActive;
            return `<article class="oe-project ${project.state}"><div class="oe-project-head"><h3>${escapeHtml(project.title)}</h3><span class="oe-project-state">${escapeHtml(project.state)}</span></div><p>${escapeHtml(project.description)}</p>${projectTerms(project) ? `<div class="oe-project-terms">${projectTerms(project)}</div>` : ''}<div>${project.conditions.map((condition) => { const percent = safeRatio(condition.current, condition.target) * 100; return `<div class="oe-progress-row"><span>${escapeHtml(condition.label)}</span><span>${Math.min(condition.current, condition.target)}/${condition.target}</span><span class="oe-progress-track"><i style="width:${percent}%"></i></span></div>`; }).join('')}</div>${project.state === 'available' ? `<button type="button" class="oe-project-action" data-oe-accept-project="${escapeHtml(project.id)}" ${canAccept ? '' : 'disabled'}>${canAccept ? 'Accept project' : 'Project slots full'}</button>` : ''}</article>`;
          }).join('') || '<p class="oe-empty">No capital projects are currently available.</p>'}
        </div>
      </div>
    </section>`;
}

export function mountOpeningEconomyPanels(options: OpeningEconomyPanelsOptions): OpeningEconomyPanelsController {
  ensureStyles();

  const root = document.createElement('div');
  root.className = 'oe-panels';
  root.innerHTML = `
    <aside class="oe-site-brief" aria-label="Site brief"></aside>
    <div class="oe-panel-layer" hidden></div>`;
  options.host.appendChild(root);

  const siteBrief = root.querySelector<HTMLElement>('.oe-site-brief');
  const layer = root.querySelector<HTMLElement>('.oe-panel-layer');
  if (!siteBrief || !layer) throw new Error('Opening economy panel mount failed');

  if (options.siteBriefHost) {
    siteBrief.classList.add('oe-site-brief-stacked');
    options.siteBriefHost.appendChild(siteBrief);
  }

  let currentView: OpeningEconomyPanelView | null = null;
  let openPanel: OpeningEconomyPanelName | null = null;
  let panelAnchor: OpeningEconomyPanelAnchor | null = null;
  let siteBriefVisible = options.showSiteBrief ?? true;
  let renderedSiteBrief = '';
  let renderedPanel = '';

  const emit = (action: OpeningEconomyPanelAction): void => options.onAction?.(action);

  /**
   * Place the open panel beside its fixture and keep it inside the viewport.
   *
   * The fixture usually sits left of centre, so the panel prefers the right
   * side and flips only when it would run off the edge. Measured after layout
   * so the clamp uses the panel's real size rather than the CSS maximum.
   */
  const applyAnchorPlacement = (): void => {
    const panel = layer.querySelector<HTMLElement>('.oe-panel');
    layer.classList.toggle('is-anchored', panelAnchor !== null);
    if (!panel) return;
    if (!panelAnchor) {
      panel.classList.remove('anchor-right');
      panel.style.left = '';
      panel.style.top = '';
      return;
    }
    const gap = 18;
    const margin = 10;
    const width = panel.offsetWidth;
    const height = panel.offsetHeight;
    const flip = panelAnchor.x + gap + width + margin > window.innerWidth;
    const left = flip ? panelAnchor.x - gap - width : panelAnchor.x + gap;
    panel.classList.toggle('anchor-right', flip);
    panel.style.left = `${Math.round(Math.max(margin, Math.min(left, window.innerWidth - width - margin)))}px`;
    panel.style.top = `${Math.round(Math.max(margin, Math.min(panelAnchor.y - 22, window.innerHeight - height - margin)))}px`;
  };

  const renderSiteBrief = (force = false): void => {
    const brief = currentView?.siteBrief;
    siteBrief.hidden = !brief || !siteBriefVisible;
    if (!brief || !siteBriefVisible) {
      renderedSiteBrief = '';
      return;
    }
    // The shop deliberately has no launcher here. Retail is an operation, and
    // operations belong at the fixture they run on: the caller opens the shop
    // from the Market Stall, Shelf Aisle, or Checkout Bank in the world.
    // Capital projects have no physical fixture to click, so they keep theirs.
    const projects = currentView?.projects;
    const actions = projects
      ? `<div class="oe-site-actions oe-site-actions-single">
          <button type="button" class="oe-site-action" data-oe-open-projects><span>Capital projects</span><b>${projects.activeCount}/${projects.maxActive} active</b></button>
        </div>`
      : '';
    const content = `<span class="oe-site-kicker">${escapeHtml(brief.title ?? 'Site brief')}</span><strong class="oe-site-title">${escapeHtml(brief.primary)}</strong>${brief.secondary ? `<p class="oe-site-detail">${escapeHtml(brief.secondary)}</p>` : ''}${brief.composition ? `<p class="oe-site-detail oe-site-composition">${escapeHtml(brief.composition)}</p>` : ''}<div class="oe-traits">${brief.traits.map((trait) => `<span class="oe-trait ${trait.tone ?? 'neutral'}"><strong>${escapeHtml(trait.label)}</strong> ${escapeHtml(trait.detail)}</span>`).join('')}</div>${actions}`;
    if (content === renderedSiteBrief) return;
    // Replacing a hovered button between pointerdown and click makes the
    // control flash and drops the click. Defer live-value refreshes until the
    // pointer leaves; the next regular render catches up immediately.
    if (!force && siteBrief.matches(':hover')) return;
    siteBrief.innerHTML = content;
    renderedSiteBrief = content;
  };

  const renderOpenPanel = (force = false): void => {
    const clear = (): void => {
      panelAnchor = null;
      layer.classList.remove('is-anchored');
      layer.hidden = true;
      if (renderedPanel !== '') layer.innerHTML = '';
      renderedPanel = '';
    };
    if (!currentView || !openPanel) {
      clear();
      return;
    }
    if (openPanel === 'shop' && !currentView.shop) {
      openPanel = null;
      clear();
      return;
    }
    if (openPanel === 'projects' && !currentView.projects) {
      openPanel = null;
      clear();
      return;
    }
    const previousPanel = layer.querySelector<HTMLElement>('.oe-panel');
    const previousScrollTop = previousPanel?.scrollTop ?? 0;
    const content = openPanel === 'ledger'
      ? renderLedger(currentView.ledger)
      : openPanel === 'shop'
        ? renderTravelSuppliesShop(currentView.shop!)
        : renderProjects(currentView.projects!);
    layer.hidden = false;
    const signature = `${openPanel}\n${content}`;
    if (signature === renderedPanel) {
      applyAnchorPlacement();
      return;
    }
    const hoveredPanel = layer.querySelector<HTMLElement>('.oe-panel');
    if (!force && hoveredPanel?.matches(':hover')) return;
    layer.innerHTML = content;
    renderedPanel = signature;
    const nextPanel = layer.querySelector<HTMLElement>('.oe-panel');
    if (nextPanel && previousScrollTop > 0) nextPanel.scrollTop = previousScrollTop;
    applyAnchorPlacement();
  };

  // The brief may be reparented into the game's left HUD stack, outside this
  // controller's root. Give its compact launch button its own listener.
  const handleSiteBriefClick = (event: Event): void => {
    const target = event.target as Element | null;
    if (!target) return;
    if (target.closest('[data-oe-open-projects]') && currentView?.projects) {
      openPanel = 'projects';
      panelAnchor = null;
      renderOpenPanel();
      emit({ type: 'open-projects' });
    }
  };
  siteBrief.addEventListener('click', handleSiteBriefClick);

  root.addEventListener('click', (event) => {
    const target = event.target as Element | null;
    if (!target) return;
    const close = target.closest<HTMLButtonElement>('[data-oe-close]');
    if (close) {
      const panel = close.dataset.oeClose as OpeningEconomyPanelName;
      openPanel = null;
      panelAnchor = null;
      renderOpenPanel();
      emit({ type: 'close-panel', panel });
      return;
    }
    const policy = target.closest<HTMLButtonElement>('[data-oe-policy]')?.dataset.oePolicy as MarketPricingPolicy | undefined;
    if (policy) {
      emit({ type: 'set-pricing-policy', policy });
      return;
    }
    const mix = target.closest<HTMLButtonElement>('[data-oe-shelf-mix]')?.dataset.oeShelfMix as RetailAssortmentMix | undefined;
    if (mix) {
      emit({ type: 'set-shelf-mix', mix });
      return;
    }
    const orderUnits = target.closest<HTMLButtonElement>('[data-oe-order-units]')?.dataset.oeOrderUnits;
    if (orderUnits !== undefined) {
      const units = Number.parseInt(orderUnits, 10);
      if (Number.isFinite(units)) emit({ type: 'set-order-units', units });
      return;
    }
    if (target.closest('[data-oe-order-stock]')) {
      emit({ type: 'order-stock' });
      return;
    }
    const projectId = target.closest<HTMLButtonElement>('[data-oe-accept-project]')?.dataset.oeAcceptProject;
    if (projectId) emit({ type: 'accept-project', projectId });
  });

  // Typed quantities commit on change rather than per keystroke, so a partially
  // typed number never re-renders the panel out from under the caret.
  root.addEventListener('change', (event: Event) => {
    const input = (event.target as HTMLElement | null)?.closest<HTMLInputElement>('[data-oe-order-input]');
    if (!input) return;
    const units = Number.parseInt(input.value, 10);
    if (Number.isFinite(units)) emit({ type: 'set-order-units', units });
  });

  return {
    render(view): void {
      currentView = view;
      renderSiteBrief();
      renderOpenPanel();
    },
    open(panel, anchor): void {
      if (!currentView || (panel === 'shop' && !currentView.shop) || (panel === 'projects' && !currentView.projects)) return;
      openPanel = panel;
      panelAnchor = anchor ?? null;
      renderOpenPanel(true);
      if (panel === 'ledger') emit({ type: 'open-ledger' });
      if (panel === 'shop') emit({ type: 'open-shop' });
      if (panel === 'projects') emit({ type: 'open-projects' });
    },
    setAnchor(anchor): void {
      if (!openPanel) return;
      panelAnchor = anchor;
      applyAnchorPlacement();
    },
    openPanelName(): OpeningEconomyPanelName | null {
      return openPanel;
    },
    close(): void {
      if (!openPanel) return;
      const panel = openPanel;
      openPanel = null;
      panelAnchor = null;
      renderOpenPanel();
      emit({ type: 'close-panel', panel });
    },
    setSiteBriefVisible(visible): void {
      siteBriefVisible = visible;
      renderSiteBrief();
    },
    destroy(): void {
      siteBrief.removeEventListener('click', handleSiteBriefClick);
      if (siteBrief.parentElement !== root) siteBrief.remove();
      root.remove();
    }
  };
}
