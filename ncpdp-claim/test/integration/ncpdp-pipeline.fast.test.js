// @ts-check
// Integration, fast slice: synthetic NCPDP Telecom requests from @cosyte/synth, round-tripped through
// @cosyte/ncpdp, then de-identified by @cosyte/deid and read back.
import assert from "node:assert/strict";
import { test } from "node:test";
import { TRANSACTION_KINDS, checkDeid, checkRoundTrip, seedRange } from "./support.js";

const SEEDS = seedRange(1, 2);

for (const [kind, generate] of Object.entries(TRANSACTION_KINDS)) {
  test(`${kind}: parse then serialize gives back the same text`, () => {
    for (const seed of SEEDS) checkRoundTrip(generate(seed), `${kind} seed ${seed}`);
  });

  test(`${kind}: de-identified, it keeps no patient or cardholder identifier and still parses`, () => {
    for (const seed of SEEDS) checkDeid(generate(seed), `${kind} seed ${seed}`);
  });
}

test("a billing request carries the patient and cardholder fields the de-identification check looks for", () => {
  // A reversal carries no patient segment, so this guards the check against passing on empty input.
  assert.ok(checkDeid(TRANSACTION_KINDS["B1 billing"](SEEDS[0]), "B1") >= 6);
});
