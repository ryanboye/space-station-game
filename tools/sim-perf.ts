import { createInitialState, expandMap, tick } from '../src/sim/sim';
import type { CardinalDirection, StationState } from '../src/sim/types';

type BenchmarkResult = {
  label: string;
  avgMsPerTick: number;
};

function assertCondition(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function setupState(expansions: CardinalDirection[]): StationState {
  const state = createInitialState({ seed: 1337 });
  state.metrics.credits = 1_000_000;
  state.controls.paused = false;
  state.controls.simSpeed = 1;
  state.controls.shipsPerCycle = 0;
  for (const direction of expansions) {
    const result = expandMap(state, direction);
    assertCondition(result.ok, `Expansion failed for ${direction}`);
  }
  return state;
}

function runBenchmark(label: string, expansions: CardinalDirection[], ticksToMeasure = 1200): BenchmarkResult {
  const state = setupState(expansions);
  const warmupTicks = 240;
  for (let i = 0; i < warmupTicks; i++) tick(state, 0.25);
  const started = performance.now();
  for (let i = 0; i < ticksToMeasure; i++) tick(state, 0.25);
  const elapsedMs = performance.now() - started;
  return {
    label,
    avgMsPerTick: elapsedMs / ticksToMeasure
  };
}

function format(result: BenchmarkResult): string {
  return `${result.label}: ${result.avgMsPerTick.toFixed(3)}ms/tick`;
}

function main(): void {
  const base = runBenchmark('base 60x40', []);
  const oneExpansion = runBenchmark('expanded 60x80 (south)', ['south']);
  const twoExpansion = runBenchmark('expanded 100x80 (south+east)', ['south', 'east']);
  const oneSlope = oneExpansion.avgMsPerTick / Math.max(0.0001, base.avgMsPerTick);
  const twoSlope = twoExpansion.avgMsPerTick / Math.max(0.0001, oneExpansion.avgMsPerTick);

  const lines = [
    format(base),
    format(oneExpansion),
    format(twoExpansion),
    `slope base->one: ${oneSlope.toFixed(3)}x`,
    `slope one->two: ${twoSlope.toFixed(3)}x`
  ];
  // eslint-disable-next-line no-console
  console.log(lines.join('\n'));

  // Guardrail thresholds to catch future performance regressions.
  assertCondition(oneSlope <= 1.80, `Perf regression: base->one slope ${oneSlope.toFixed(3)}x exceeds 1.80x`);
  assertCondition(twoSlope <= 1.80, `Perf regression: one->two slope ${twoSlope.toFixed(3)}x exceeds 1.80x`);
}

main();
