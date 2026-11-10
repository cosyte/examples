// @ts-check
// Integration, full suite: the fast slice's 271 and 270 round trip over a seed sweep.
import { test } from "node:test";
import { checkEligibilityExchange, seedRange } from "./support.js";

const SEEDS = seedRange(1, 300);

test(`${SEEDS.length} seeds: each 271 and the 270 built for it round-trip and agree on member and trace`, () => {
  for (const seed of SEEDS) checkEligibilityExchange(seed);
});
