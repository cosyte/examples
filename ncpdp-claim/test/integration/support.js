// @ts-check
// Shared by the integration tests: synthetic NCPDP Telecom requests, and the checks a round trip and a
// de-identification pass must meet.
import assert from "node:assert/strict";
import { deidentifyTelecom } from "@cosyte/deid/ncpdp";
import { fieldValue, findSegment, parseTelecom, serializeTelecom } from "@cosyte/ncpdp/telecom";
import { generateB1, generateB2, generateB3 } from "@cosyte/synth/ncpdp";
import { syntheticClaim } from "../../src/claim.js";

/**
 * One generator per transaction, each returning Telecom D.0 wire text. The same seed gives the same
 * bytes on every machine, and every identifier comes from synthetic ranges.
 *
 * @type {Readonly<Record<string, (seed: number) => string>>}
 */
export const TRANSACTION_KINDS = Object.freeze({
  "B1 billing": (seed) => generateB1({ seed }),
  "B2 reversal": (seed) => generateB2({ seed }),
  "B3 rebill": (seed) => generateB3({ seed }),
  "B1 billing with the starter's pricing": (seed) => syntheticClaim(seed),
});

/**
 * The fields that identify the patient or the cardholder: in Patient (01) the date of birth (C4),
 * first and last name (CA, CB), street (CM), phone (CQ) and patient ID (CY); in Insurance (04) the
 * cardholder ID (C2).
 */
export const IDENTIFYING_FIELDS = Object.freeze([
  ["01", "C4"],
  ["01", "CA"],
  ["01", "CB"],
  ["01", "CM"],
  ["01", "CQ"],
  ["01", "CY"],
  ["04", "C2"],
]);

/**
 * The seeds from `first` to `first + count - 1`.
 *
 * @param {number} first
 * @param {number} count
 * @returns {number[]}
 */
export function seedRange(first, count) {
  return Array.from({ length: count }, (_, index) => first + index);
}

/**
 * Every field value of a parsed transaction, in order.
 *
 * @param {import("@cosyte/ncpdp/telecom").TelecomTransaction} transaction
 * @returns {string[]}
 */
export function fieldValues(transaction) {
  return transaction.segments.flatMap((segment) => segment.fields.map((field) => field.value));
}

/**
 * Parse a request, write it back, and assert the text is unchanged and read with no warning.
 *
 * @param {string} wire
 * @param {string} label
 */
export function checkRoundTrip(wire, label) {
  const transaction = parseTelecom(wire);
  assert.deepEqual(transaction.warnings, [], `${label}: the parser warned`);
  assert.equal(serializeTelecom(transaction), wire, `${label}: parse then serialize changed the text`);
}

/**
 * De-identify a request under the Safe Harbor policy and assert what the pass promises: the output
 * parses and round-trips with the same segments, no identifying field value survives in any field,
 * the birth date keeps only its year, and the manifest and residual list carry no value.
 *
 * @param {string} wire
 * @param {string} label
 */
export function checkDeid(wire, label) {
  const input = parseTelecom(wire);
  const values = IDENTIFYING_FIELDS.map(([segment, field]) => fieldValue(findSegment(input.segments, segment), field)).filter(
    (value) => typeof value === "string" && value !== "",
  );

  const { telecom, manifest, unexaminedResiduals } = deidentifyTelecom(input);
  checkRoundTrip(telecom, `${label}, de-identified`);
  const output = parseTelecom(telecom);
  const ids = (/** @type {import("@cosyte/ncpdp/telecom").TelecomTransaction} */ t) => t.segments.map((s) => s.segmentId);
  assert.deepEqual(ids(output), ids(input), `${label}: the output lost or gained a segment`);

  const kept = new Set(fieldValues(output));
  values.forEach((value, index) => {
    assert.ok(!kept.has(value), `${label}: identifier ${index} of ${values.length} reached the output`);
    assert.ok(!JSON.stringify(manifest).includes(value), `${label}: identifier ${index} reached the manifest`);
    assert.ok(!JSON.stringify(unexaminedResiduals).includes(value), `${label}: identifier ${index} reached the residual list`);
  });
  const birthDate = fieldValue(findSegment(input.segments, "01"), "C4");
  if (birthDate !== undefined) {
    assert.equal(fieldValue(findSegment(output.segments, "01"), "C4"), birthDate.slice(0, 4), `${label}: C4 keeps more than its year`);
  }
  return values.length;
}
