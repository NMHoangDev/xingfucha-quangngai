import { REWARDS, type Reward } from "./rewards";
import { createSeededRng, createDefaultRng, type Rng } from "./reward.service";

type SelectionOptions = {
  seed?: string | number;
  rng?: Rng;
};

export function selectRewardForSpinFlow(options: SelectionOptions = {}): {
  reward: Reward;
  index: number;
} {
  const rng =
    options.rng ??
    (options.seed != null ? createSeededRng(options.seed) : createDefaultRng());

  const index = Math.floor(rng() * REWARDS.length);
  const reward = REWARDS[Math.max(0, Math.min(index, REWARDS.length - 1))]!;

  return { reward, index: reward.id };
}
