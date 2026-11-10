// @ts-check
// Integration, fast slice: synthetic C-CDA documents from @cosyte/synth, round-tripped through
// @cosyte/ccda, their code systems resolved by @cosyte/terminology, and de-identified by @cosyte/deid.
import { test } from "node:test";
import { DOCUMENT_KINDS, checkCodeSystems, checkDeid, checkRoundTrip, seedRange } from "./support.js";

const SEEDS = seedRange(1, 2);

for (const [kind, generate] of Object.entries(DOCUMENT_KINDS)) {
  test(`${kind}: parse then serialize gives back the same XML and the same summary`, () => {
    for (const seed of SEEDS) checkRoundTrip(generate(seed), `${kind} seed ${seed}`);
  });

  test(`${kind}: every code system it names resolves in @cosyte/terminology, but for a stated few`, () => {
    for (const seed of SEEDS) checkCodeSystems(generate(seed), `${kind} seed ${seed}`);
  });

  test(`${kind}: de-identified, it keeps no patient identifier and keeps its clinical codes`, () => {
    for (const seed of SEEDS) checkDeid(generate(seed), `${kind} seed ${seed}`);
  });
}
