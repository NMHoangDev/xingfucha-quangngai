import { REWARDS } from "./rewards";
import { simulateDistribution } from "./reward.service";

function pct(n: number) {
  return `${(n * 100).toFixed(2)}%`;
}

/**
 * Simulation (10,000 spins)
 * Run with: `npx tsx lib/rewards/reward.test.ts`
 */
function main() {
  const spins = 10_000;
  const seed = "demo-seed";

  const { expected, observed } = simulateDistribution({
    spins,
    seed,
    rewards: REWARDS,
  });

  const keys = Object.keys(expected);
  keys.sort((a, b) => (expected[b] ?? 0) - (expected[a] ?? 0));

  console.log(`Spins: ${spins} (seed: ${seed})`);
  console.log("Reward distribution (expected vs observed):");

  for (const k of keys) {
    console.log(
      `${k.padEnd(22)} expected=${pct(expected[k] ?? 0)}  observed=${pct(observed[k] ?? 0)}`,
    );
  }
}

main();
