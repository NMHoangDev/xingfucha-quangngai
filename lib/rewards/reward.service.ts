import { REWARDS, type Reward } from "./rewards";

export type Rng = () => number; // [0, 1)

export type RewardSelection = {
  reward: Reward;
  index: number; // index in the original rewards array
};

export type SelectRewardOptions = {
  rewards?: ReadonlyArray<Reward>;
  /** Optional seed for deterministic selection (useful for tests/simulation). */
  seed?: string | number;
  /** Optional injected RNG. If provided, seed is ignored. */
  rng?: Rng;
  /** Fallback index if misconfigured (e.g., all weights <= 0). Default: 0. */
  fallbackIndex?: number;
};

function xmur3(str: string) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return function () {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return h >>> 0;
  };
}

function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createSeededRng(seed: string | number): Rng {
  const seedStr = String(seed);
  const seedFn = xmur3(seedStr);
  return mulberry32(seedFn());
}

export function createDefaultRng(): Rng {
  return () => Math.random();
}

type Candidate = { reward: Reward; index: number; weight: number };

export function selectWeightedReward(
  options: SelectRewardOptions = {},
): RewardSelection {
  const rewards = (options.rewards ?? REWARDS) as ReadonlyArray<Reward>;
  const fallbackIndex =
    typeof options.fallbackIndex === "number" ? options.fallbackIndex : 0;

  if (!rewards.length) {
    throw new Error("Reward list is empty");
  }

  const rng: Rng =
    options.rng ??
    (options.seed != null ? createSeededRng(options.seed) : createDefaultRng());

  const candidates: Candidate[] = rewards
    .map((reward, index) => ({ reward, index, weight: reward.weight }))
    .filter((c) => Number.isFinite(c.weight) && c.weight > 0);

  // Filter out invalid rewards (weight <= 0)
  if (!candidates.length) {
    // Fallback logic: deterministic and safe.
    const safeIndex =
      fallbackIndex >= 0 && fallbackIndex < rewards.length ? fallbackIndex : 0;
    return { reward: rewards[safeIndex]!, index: safeIndex };
  }

  const totalWeight = candidates.reduce((sum, c) => sum + c.weight, 0);
  if (!(totalWeight > 0)) {
    const safeIndex =
      fallbackIndex >= 0 && fallbackIndex < rewards.length ? fallbackIndex : 0;
    return { reward: rewards[safeIndex]!, index: safeIndex };
  }

  // Weighted selection
  const roll = rng() * totalWeight;
  let cumulative = 0;
  for (const c of candidates) {
    cumulative += c.weight;
    if (roll < cumulative) {
      return { reward: c.reward, index: c.index };
    }
  }

  // Fallback if numeric edge case occurs (e.g., roll ~= totalWeight)
  const last = candidates[candidates.length - 1]!;
  return { reward: last.reward, index: last.index };
}

export function simulateDistribution(params: {
  spins: number;
  seed?: string | number;
  rewards?: ReadonlyArray<Reward>;
}): {
  spins: number;
  expected: Record<string, number>;
  observed: Record<string, number>;
} {
  const rewards = (params.rewards ?? REWARDS) as ReadonlyArray<Reward>;
  const spins = Math.max(0, Math.floor(params.spins));
  const rng =
    params.seed != null ? createSeededRng(params.seed) : createDefaultRng();

  const candidates = rewards.filter(
    (r) => Number.isFinite(r.weight) && r.weight > 0,
  );
  const totalWeight = candidates.reduce((s, r) => s + r.weight, 0);

  const expected: Record<string, number> = {};
  for (const r of rewards) {
    expected[`${r.id}:${r.label}`] =
      r.weight > 0 && totalWeight > 0 ? r.weight / totalWeight : 0;
  }

  const counts: Record<string, number> = {};
  for (const r of rewards) counts[`${r.id}:${r.label}`] = 0;

  for (let i = 0; i < spins; i++) {
    const sel = selectWeightedReward({ rewards, rng });
    const key = `${sel.reward.id}:${sel.reward.label}`;
    counts[key] = (counts[key] ?? 0) + 1;
  }

  const observed: Record<string, number> = {};
  for (const [k, v] of Object.entries(counts)) {
    observed[k] = spins > 0 ? v / spins : 0;
  }

  return { spins, expected, observed };
}
