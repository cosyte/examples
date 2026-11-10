// @ts-check
// Integration, fast slice: every HL7 v2 message kind @cosyte/synth generates, parsed by @cosyte/hl7
// and de-identified by @cosyte/deid under the Safe Harbor policy.
import { test } from "node:test";
import { MESSAGE_KINDS, checkDeid, seedRange } from "./support.js";

const SEEDS = seedRange(1, 2);

for (const [kind, generate] of Object.entries(MESSAGE_KINDS)) {
  test(`${kind}: de-identified with no PID identifier left, nothing blocked, and the output parses back`, () => {
    for (const seed of SEEDS) checkDeid(generate(seed), `${kind} seed ${seed}`);
  });
}
