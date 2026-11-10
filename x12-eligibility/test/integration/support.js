// @ts-check
// Shared by the integration tests: the round trip a 271 response and the 270 built for it must meet.
import assert from "node:assert/strict";
import { parseX12, serializeX12 } from "@cosyte/x12";
import { inquiryFor, readEligibility, readInquiry, syntheticEligibilityResponse } from "../../src/eligibility.js";

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
 * Parse an interchange, write it back, and assert the text is unchanged and read with no warning.
 *
 * @param {string} wire
 * @param {string} label
 */
export function checkRoundTrip(wire, label) {
  const interchange = parseX12(wire);
  assert.deepEqual(interchange.warnings, [], `${label}: the parser warned`);
  assert.equal(serializeX12(interchange), wire, `${label}: parse then serialize changed the text`);
}

/**
 * The 271 for one seed and the 270 built from it, both round-tripped, and the 270 read back to the same
 * member and trace the 271 answers.
 *
 * @param {number} seed
 */
export function checkEligibilityExchange(seed) {
  const response = syntheticEligibilityResponse(seed);
  checkRoundTrip(response, `271 seed ${seed}`);
  const { interchange, eligibility } = readEligibility(response);
  assert.deepEqual(eligibility.warnings, [], `271 seed ${seed}: the reader warned`);
  const [subscriber] = eligibility.subscribers;
  assert.ok(subscriber, `271 seed ${seed}: no subscriber`);

  const request = inquiryFor(interchange, subscriber);
  checkRoundTrip(request, `270 for seed ${seed}`);
  const { inquiry } = readInquiry(request);
  assert.deepEqual(inquiry.warnings, [], `270 for seed ${seed}: the reader warned`);
  const asked = inquiry.informationSources[0]?.receivers[0]?.subscribers[0];
  assert.equal(asked?.name?.idCode, subscriber.name?.idCode, `270 for seed ${seed}: a different member`);
  assert.deepEqual(
    asked?.traces.map((trace) => trace.referenceId),
    subscriber.traces.map((trace) => trace.referenceId),
    `270 for seed ${seed}: a different trace`,
  );
}
