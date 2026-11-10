// @ts-check
// Integration, full suite: the fast slice's de-identification checks over a seed sweep.
import { test } from "node:test";
import { MESSAGE_KINDS, checkDeid, seedRange } from "./support.js";

const SEEDS = seedRange(1, 250);

for (const [kind, generate] of Object.entries(MESSAGE_KINDS)) {
  test(`${kind}, ${SEEDS.length} seeds: no PID identifier left, nothing blocked, and the output parses back`, () => {
    for (const seed of SEEDS) checkDeid(generate(seed), `${kind} seed ${seed}`);
  });
}
