// @ts-check
// Integration, full suite: the fast slice's round trip, terminology and de-identification checks over
// a seed sweep.
import { test } from "node:test";
import { DOCUMENT_KINDS, checkCodeSystems, checkDeid, checkRoundTrip, seedRange } from "./support.js";

const SEEDS = seedRange(1, 150);

for (const [kind, generate] of Object.entries(DOCUMENT_KINDS)) {
  test(`${kind}, ${SEEDS.length} seeds: round-trips, resolves its code systems, and de-identifies`, () => {
    for (const seed of SEEDS) {
      const xml = generate(seed);
      checkRoundTrip(xml, `${kind} seed ${seed}`);
      checkCodeSystems(xml, `${kind} seed ${seed}`);
      checkDeid(xml, `${kind} seed ${seed}`);
    }
  });
}
