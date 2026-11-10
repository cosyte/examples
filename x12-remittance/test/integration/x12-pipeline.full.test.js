// @ts-check
// Integration, full suite: the fast slice's round trip and de-identification over a seed sweep.
import { test } from "node:test";
import { TRANSACTION_KINDS, checkDeid, checkRoundTrip, seedRange } from "./support.js";

const SEEDS = seedRange(1, 250);

for (const [kind, generate] of Object.entries(TRANSACTION_KINDS)) {
  test(`${kind}, ${SEEDS.length} seeds: round-trips, and de-identifies with no identifier left`, () => {
    for (const seed of SEEDS) {
      const wire = generate(seed);
      checkRoundTrip(wire, `${kind} seed ${seed}`);
      checkDeid(wire, `${kind} seed ${seed}`);
    }
  });
}
