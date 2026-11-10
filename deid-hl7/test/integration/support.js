// @ts-check
// Shared by the integration tests: synthetic messages of every kind @cosyte/synth generates, and the
// checks one de-identification pass must meet.
import assert from "node:assert/strict";
import { parseHL7 } from "@cosyte/hl7";
import { generateAdt, generateOrm, generateOru, generateSiu, generateVxu } from "@cosyte/synth/hl7";
import { deidentifyMessage } from "../../src/deid.js";

/**
 * One generator per message kind, each returning HL7 v2 wire text. The same seed gives the same bytes
 * on every machine, and every value comes from @cosyte/synth's synthetic pools.
 *
 * @type {Readonly<Record<string, (seed: number) => string>>}
 */
export const MESSAGE_KINDS = Object.freeze({
  "ADT^A01": (seed) => generateAdt({ seed, trigger: "A01" }).toString(),
  "ADT^A04": (seed) => generateAdt({ seed, trigger: "A04" }).toString(),
  "ADT^A08": (seed) => generateAdt({ seed, trigger: "A08" }).toString(),
  "ORU^R01": (seed) => generateOru({ seed }).toString(),
  "ORM^O01": (seed) => generateOrm({ seed }).toString(),
  "SIU^S12": (seed) => generateSiu({ seed }).toString(),
  "VXU^V04": (seed) => generateVxu({ seed }).toString(),
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

/** The PID positions that carry a patient identifier in the synthetic messages. */
export const PID_IDENTIFIERS = Object.freeze(["PID.3.1", "PID.5.1", "PID.5.2", "PID.7", "PID.11.1", "PID.11.3", "PID.13", "PID.19"]);

/** The placer and filler order numbers, in the order and observation-request segments. */
export const ORDER_NUMBERS = Object.freeze(["ORC.2", "ORC.3", "OBR.2", "OBR.3"]);

/**
 * De-identify one message under the Safe Harbor policy and assert what the pass promises: the output
 * parses back with the same segments, no PID identifier or order number survives in it, in the
 * manifest or in the residual list, every blocked locus is left empty, and the message and birth
 * dates keep only their year.
 *
 * @param {string} wire
 * @param {string} label
 */
export function checkDeid(wire, label) {
  const { input, output, manifest, residuals } = deidentifyMessage(wire);
  const present = (/** @type {readonly string[]} */ paths) =>
    paths.map((path) => input.get(path)).filter((value) => typeof value === "string" && value !== "");
  const values = present(PID_IDENTIFIERS);
  assert.ok(values.length >= 6, `${label}: the synthetic PID carries identifiers`);
  // Placer and filler order numbers are unique identifiers too, and the policy blocks them.
  values.push(...present(ORDER_NUMBERS));

  const text = output.toString();
  const reparsed = parseHL7(text);
  assert.equal(reparsed.toString(), text, `${label}: the output does not parse back to itself`);
  const names = (/** @type {string} */ wireText) => wireText.split("\r").filter(Boolean).map((segment) => segment.slice(0, 3));
  assert.deepEqual(names(text), names(wire), `${label}: the output lost or gained a segment`);
  assert.equal(reparsed.meta.controlId, input.meta.controlId, `${label}: MSH-10 changed`);

  assert.ok(manifest.length > 0, `${label}: the pass acted on nothing`);
  // A blocked locus is one the policy will not pass in any form: the pass leaves it empty.
  for (const { locus } of manifest.filter((entry) => entry.disposition === "blocked")) {
    const match = /^([A-Z][A-Z0-9]{2})-(\d+)$/.exec(locus);
    assert.ok(match, `${label}: a blocked locus is not a whole field`);
    assert.equal(reparsed.get(`${match[1]}.${match[2]}`) ?? "", "", `${label}: blocked ${locus} is not empty`);
  }
  assertAbsent(text, values, `${label}: the output`);
  assertAbsent(JSON.stringify(manifest), values, `${label}: the manifest`);
  assertAbsent(JSON.stringify(residuals), values, `${label}: the residual list`);

  for (const path of ["MSH.7", "PID.7"]) {
    assert.equal(reparsed.get(path), String(input.get(path)).slice(0, 4), `${label}: ${path} keeps more than its year`);
  }
}
