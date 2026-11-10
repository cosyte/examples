// @ts-check
// Integration, fast slice: synthetic X12 835 and 837 interchanges from @cosyte/synth, round-tripped
// through @cosyte/x12, then de-identified by @cosyte/deid and read back.
import assert from "node:assert/strict";
import { test } from "node:test";
import { deidentifyX12 } from "@cosyte/deid/x12";
import { parseX12 } from "@cosyte/x12";
import { readRemittance } from "../../src/remittance.js";
import { TRANSACTION_KINDS, checkDeid, checkRoundTrip, seedRange } from "./support.js";

const SEEDS = seedRange(1, 2);

for (const [kind, generate] of Object.entries(TRANSACTION_KINDS)) {
  test(`${kind}: parse then serialize gives back the same text`, () => {
    for (const seed of SEEDS) checkRoundTrip(generate(seed), `${kind} seed ${seed}`);
  });

  test(`${kind}: de-identified, it keeps no patient or subscriber identifier and still parses`, () => {
    for (const seed of SEEDS) checkDeid(generate(seed), `${kind} seed ${seed}`);
  });
}

test("835: the de-identified remittance still reads as the same payment, claims and balance", () => {
  const wire = TRANSACTION_KINDS["835 remittance"](SEEDS[0]);
  const before = readRemittance(wire).remittance;
  const after = readRemittance(deidentifyX12(parseX12(wire)).x12).remittance;

  assert.equal(after.payment.totalActualPayment?.toString(), before.payment.totalActualPayment?.toString());
  assert.deepEqual(
    after.claims.map((claim) => [claim.claimStatusCode, claim.totalChargeAmount?.toString(), claim.totalPaymentAmount?.toString()]),
    before.claims.map((claim) => [claim.claimStatusCode, claim.totalChargeAmount?.toString(), claim.totalPaymentAmount?.toString()]),
  );
  assert.deepEqual(after.warnings, before.warnings);
});
