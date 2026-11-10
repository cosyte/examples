// @ts-check
// Shared by the integration tests: synthetic C-CDA documents, and the checks a round trip, a
// terminology pass and a de-identification pass must meet.
import assert from "node:assert/strict";
import { parseCcda, serializeCcda } from "@cosyte/ccda";
import { deidentifyCcda } from "@cosyte/deid/ccda";
import { generateCcd, generateReferralNote } from "@cosyte/synth/ccda";
import { isUnknownSystem, resolveSystem } from "@cosyte/terminology";
import { summarize } from "../../src/ccda.js";

/**
 * One generator per document type, each returning the XML a sending system would hand you. The same
 * seed gives the same bytes on every machine.
 *
 * @type {Readonly<Record<string, (seed: number) => string>>}
 */
export const DOCUMENT_KINDS = Object.freeze({
  "Continuity of Care Document": (seed) => serializeCcda(generateCcd({ seed })),
  "Referral Note": (seed) => serializeCcda(generateReferralNote({ seed })),
});

/**
 * Code systems the synthetic documents name by OID that the @cosyte/terminology identity table does
 * not resolve on its 0.1 line: four HL7 v3 code systems and the NCI Thesaurus. Any other fails.
 */
export const KNOWN_UNRESOLVED_OIDS = Object.freeze([
  "2.16.840.1.113883.5.1", // HL7 AdministrativeGender
  "2.16.840.1.113883.5.4", // HL7 ActCode
  "2.16.840.1.113883.5.6", // HL7 ActClass
  "2.16.840.1.113883.5.25", // HL7 Confidentiality
  "2.16.840.1.113883.3.26.1.1", // NCI Thesaurus, which C-CDA uses for medication routes
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
 * The codes of the problems, medications and allergies a summary reports, in order.
 *
 * @param {ReturnType<typeof summarize>} summary
 */
export function clinicalCodes(summary) {
  return [
    ...summary.problems.map((problem) => problem.code),
    ...summary.medications.map((medication) => medication.code),
    ...summary.allergies.map((allergy) => allergy.code),
  ];
}

/**
 * Parse a document, write it back, and assert the XML is unchanged, read with no warning, and
 * summarizes the same way.
 *
 * @param {string} xml
 * @param {string} label
 */
export function checkRoundTrip(xml, label) {
  const doc = parseCcda(xml);
  assert.deepEqual(doc.warnings, [], `${label}: the parser warned`);
  const written = serializeCcda(doc);
  assert.equal(written, xml, `${label}: parse then serialize changed the XML`);
  assert.deepEqual(summarize(parseCcda(written)), summarize(doc), `${label}: the summary changed`);
}

/**
 * Every codeSystem OID a document names resolves in @cosyte/terminology, but for the stated few.
 *
 * @param {string} xml
 * @param {string} label
 */
export function checkCodeSystems(xml, label) {
  const oids = new Set([...xml.matchAll(/codeSystem="([^"]+)"/g)].map((match) => match[1]));
  assert.ok(oids.size > 0, `${label}: the document names no code system`);
  for (const oid of oids) {
    if (isUnknownSystem(resolveSystem(oid))) {
      assert.ok(KNOWN_UNRESOLVED_OIDS.includes(oid), `${label}: ${oid} does not resolve`);
    }
  }
}

/**
 * De-identify a document under the Safe Harbor policy and assert what the pass promises: the output
 * parses as the same document type, keeps no patient identifier, keeps the coded problems,
 * medications and allergies, and the manifest and residual list carry no value. Blocking the section
 * narratives breaks the entries' references into them, which the parser reports; that is the one new
 * warning allowed.
 *
 * @param {string} xml
 * @param {string} label
 */
export function checkDeid(xml, label) {
  const input = parseCcda(xml);
  // Every synthetic document has a recordTarget with a name and a birth time.
  const { name, birthTime } = /** @type {any} */ (input.getPatient());
  const values = [input.getMrn(), ...name.given, name.family, birthTime.raw].filter(
    (value) => typeof value === "string" && value !== "",
  );
  assert.ok(values.length >= 4, `${label}: the synthetic recordTarget carries identifiers`);

  const { document, manifest, unexaminedResiduals } = deidentifyCcda(input);
  const written = serializeCcda(document);
  const output = parseCcda(written);
  assert.equal(output.documentType, input.documentType, `${label}: the document type changed`);
  assert.deepEqual(
    [...new Set(output.warnings.map((warning) => warning.code))].filter((code) => code !== "NARRATIVE_REFERENCE_BROKEN"),
    [],
    `${label}: the de-identified document reads back with new warnings`,
  );
  assert.deepEqual(clinicalCodes(summarize(output)), clinicalCodes(summarize(input)), `${label}: a clinical code changed`);

  assert.ok(manifest.length > 0, `${label}: the pass acted on nothing`);
  assertAbsent(written, values, `${label}: the output`);
  assertAbsent(JSON.stringify(manifest), values, `${label}: the manifest`);
  assertAbsent(JSON.stringify(unexaminedResiduals), values, `${label}: the residual list`);
  const kept = /** @type {any} */ (output.getPatient());
  assert.equal(kept.birthTime.raw, birthTime.raw.slice(0, 4), `${label}: the birth date keeps more than its year`);
}
