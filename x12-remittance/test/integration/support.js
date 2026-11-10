// @ts-check
// Shared by the integration tests: synthetic X12 claims and remittances, read element by element, and
// the checks a round trip and a de-identification pass must meet.
import assert from "node:assert/strict";
import { deidentifyX12 } from "@cosyte/deid/x12";
import { generate835, generate837D, generate837I, generate837P } from "@cosyte/synth/x12";
import { parseX12, serializeX12 } from "@cosyte/x12";

/**
 * One generator per transaction set, each returning X12 wire text. The same seed gives the same bytes
 * on every machine, and every value comes from @cosyte/synth's synthetic pools.
 *
 * @type {Readonly<Record<string, (seed: number) => string>>}
 */
export const TRANSACTION_KINDS = Object.freeze({
  "835 remittance": (seed) => serializeX12(generate835({ seed })),
  "837P professional claim": (seed) => serializeX12(generate837P({ seed })),
  "837I institutional claim": (seed) => serializeX12(generate837I({ seed })),
  "837D dental claim": (seed) => serializeX12(generate837D({ seed })),
});

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
 * Assert that no value in `values` occurs in `text`. The failure message names where and which
 * position in the list, never the value, so a failing run prints no identifier.
 *
 * @param {string} text
 * @param {readonly string[]} values
 * @param {string} where
 */
export function assertAbsent(text, values, where) {
  values.forEach((value, index) => {
    assert.ok(!text.includes(value), `identifier ${index} of ${values.length} reached ${where}`);
  });
}

/**
 * The segments of an interchange as arrays of elements, split by hand with the delimiters the parser
 * read from the ISA, so every value has a second route that does not go through the typed readers.
 *
 * @param {string} wire
 * @returns {string[][]}
 */
export function rawSegments(wire) {
  const { element, segment } = parseX12(wire).delimiters;
  return wire
    .split(segment)
    .map((text) => text.trim())
    .filter(Boolean)
    .map((text) => text.split(element));
}

/** NM1-01 entity codes that name the patient or the subscriber: IL insured, QC patient. */
const PERSON_ENTITIES = new Set(["IL", "QC"]);

/**
 * The values in an interchange that identify the patient or the subscriber: their names and member
 * IDs (NM1 IL and QC), every street line and city (N3, N4), the patient control number (CLM-01,
 * CLP-01) and a Social Security number (REF SY).
 *
 * @param {string} wire
 * @returns {string[]}
 */
export function identifyingValues(wire) {
  /** @type {(string | undefined)[]} */
  const values = [];
  /** @type {(string | undefined)[]} */
  const parties = [];
  for (const [id, ...elements] of rawSegments(wire)) {
    if (id === "NM1") (PERSON_ENTITIES.has(elements[0]) ? values : parties).push(elements[2], elements[3], elements[8]);
    if (id === "N3") values.push(...elements);
    if (id === "N4") values.push(elements[0]);
    if (id === "CLM" || id === "CLP") values.push(elements[0]);
    if (id === "REF" && elements[0] === "SY") values.push(elements[1]);
  }
  // A provider's or a payer's name is kept by design. The synthetic name pools are small, so a
  // provider can share a name with the patient; such a name is checked by position instead.
  return values.filter((value) => typeof value === "string" && value !== "" && !parties.includes(value));
}

/**
 * The name and ID elements (NM1-03, NM1-04, NM1-09) of each patient or subscriber NM1 segment.
 *
 * @param {string} wire
 * @returns {string[]}
 */
export function personNameElements(wire) {
  return rawSegments(wire)
    .filter(([id, entity]) => id === "NM1" && PERSON_ENTITIES.has(entity))
    .flatMap((elements) => [3, 4, 9].map((index) => [elements[index]].join("")));
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
  assert.equal(serializeX12(parseX12(serializeX12(interchange))), wire, `${label}: a second round trip changed it`);
}

/**
 * De-identify an interchange under the Safe Harbor policy and assert what the pass promises: the
 * output parses with no warning and round-trips, keeps the same segment sequence, keeps no
 * identifying value, keeps at most three ZIP digits, and the manifest and residual list carry no value.
 *
 * @param {string} wire
 * @param {string} label
 */
export function checkDeid(wire, label) {
  const values = identifyingValues(wire);
  assert.ok(values.length >= 6, `${label}: the synthetic interchange carries identifiers`);

  const { x12, manifest, unexaminedResiduals } = deidentifyX12(parseX12(wire));
  checkRoundTrip(x12, `${label}, de-identified`);
  const ids = (/** @type {string} */ text) => rawSegments(text).map(([id]) => id);
  assert.deepEqual(ids(x12), ids(wire), `${label}: the output lost or gained a segment`);

  assert.ok(manifest.length > 0, `${label}: the pass acted on nothing`);
  // Compared element by element: a short synthetic name can be part of a longer one a provider has.
  const kept = new Set(rawSegments(x12).flatMap((elements) => elements.flatMap((element) => element.split(":"))));
  values.forEach((value, index) => {
    assert.ok(!kept.has(value), `${label}: identifier ${index} of ${values.length} reached the output`);
  });
  assertAbsent(JSON.stringify(manifest), values, `${label}: the manifest`);
  assertAbsent(JSON.stringify(unexaminedResiduals), values, `${label}: the residual list`);
  assert.ok(personNameElements(wire).some(Boolean), `${label}: the input names no patient or subscriber`);
  assert.ok(personNameElements(x12).every((value) => value === ""), `${label}: a patient or subscriber name or ID was kept`);
  for (const [id, ...elements] of rawSegments(x12)) {
    if (id === "N4") assert.ok([elements[2]].join("").length <= 3, `${label}: a ZIP code kept more than three digits`);
  }
}
