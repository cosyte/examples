// @ts-check
// Shared by the integration tests: synthetic messages of every kind @cosyte/synth generates, and small
// readers over the FHIR JSON the pipeline writes.
import assert from "node:assert/strict";
import { deidentifyFhir } from "@cosyte/deid/fhir";
import { STARTER_PROFILES, parseResource, resourceType, serializeResource, validateResource } from "@cosyte/fhir";
import { generateAdt, generateOrm, generateOru, generateSiu, generateVxu } from "@cosyte/synth/hl7";
import { validateUcum } from "@cosyte/terminology";
import { bundleEntries, convertToFhir, MRN_SYSTEM } from "../../src/convert.js";

/**
 * Coding systems the transform writes that the @cosyte/terminology identity table does not resolve on
 * its 0.1 line: HL7 v3 code systems published by HL7 Terminology. Any other unresolved system fails.
 */
export const KNOWN_UNRESOLVED_SYSTEMS = Object.freeze([
  "http://terminology.hl7.org/CodeSystem/v3-ActCode",
  "http://terminology.hl7.org/CodeSystem/v3-ObservationInterpretation",
  "http://terminology.hl7.org/CodeSystem/v3-RouteOfAdministration",
]);

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

/**
 * Every object in a JSON tree that has a string `system` and a string `code`: each Coding, and each
 * Quantity that names its unit system. `path` is the property path with array indexes dropped.
 *
 * @param {unknown} node
 * @param {string} [path]
 * @returns {{ path: string, system: string, code: string }[]}
 */
export function codedValues(node, path = "") {
  if (Array.isArray(node)) return node.flatMap((item) => codedValues(item, path));
  if (node === null || typeof node !== "object") return [];
  const record = /** @type {Record<string, unknown>} */ (node);
  const own =
    typeof record.system === "string" && typeof record.code === "string"
      ? [{ path, system: record.system, code: record.code }]
      : [];
  return [...own, ...Object.entries(record).flatMap(([key, value]) => codedValues(value, `${path}.${key}`))];
}

/**
 * The resources of a FHIR Bundle in JSON form, by resourceType.
 *
 * @param {{ entry: { resource: { resourceType: string } }[] }} bundle
 * @param {string} type
 * @returns {any[]}
 */
export function resourcesOf(bundle, type) {
  return bundle.entry.map((entry) => entry.resource).filter((resource) => resource.resourceType === type);
}

/**
 * Set field `index` of every `name` segment in HL7 v2 wire text, padding with empty fields.
 *
 * @param {string} wire
 * @param {string} name a segment name, for example "OBR"
 * @param {number} index the field number, as in "OBR-25"
 * @param {string} value
 * @returns {string}
 */
export function setField(wire, name, index, value) {
  return wire
    .split("\r")
    .map((segment) => {
      if (!segment.startsWith(`${name}|`)) return segment;
      const fields = segment.split("|");
      while (fields.length <= index) fields.push("");
      fields[index] = value;
      return fields.join("|");
    })
    .join("\r");
}

/**
 * The identifying values in a message's PID, read with @cosyte/hl7, plus the birth date in the
 * YYYY-MM-DD form FHIR writes it in.
 *
 * @param {import("@cosyte/hl7").Hl7Message} message
 * @returns {string[]}
 */
export function patientValues(message) {
  const paths = ["PID.3.1", "PID.5.1", "PID.5.2", "PID.7", "PID.11.1", "PID.11.3", "PID.13", "PID.19"];
  const values = paths.map((path) => message.get(path)).filter((value) => typeof value === "string" && value !== "");
  const dob = String(message.get("PID.7"));
  return [...values, `${dob.slice(0, 4)}-${dob.slice(4, 6)}-${dob.slice(6, 8)}`];
}

/**
 * Validate the Bundle and each resource in it, strict. The starter kit's Patient profile applies to
 * the Patient; its vital-sign Observation profile is left out, because the synthetic results are
 * laboratory Observations, which that profile does not describe.
 *
 * @param {import("@cosyte/fhir").FhirComplex} bundle
 * @returns {{ type: string, issues: readonly import("@cosyte/fhir").ValidationIssue[] }[]}
 */
export function validateEntries(bundle) {
  const targets = [{ type: "Bundle", resource: bundle }, ...bundleEntries(bundle)];
  return targets.map(({ type, resource }) => ({
    type,
    issues: validateResource(resource, { mode: "strict", profiles: type === "Patient" ? STARTER_PROFILES : [] }).issues,
  }));
}

/**
 * Run one message through the whole pipeline and assert each stage: the Bundle validates, the Patient
 * carries the PID, the diagnostics carry no patient value, every UCUM unit is valid UCUM, and the
 * de-identified Bundle parses, keeps no identifier, and blocks nothing.
 *
 * @param {string} wire
 * @param {string} label
 */
export function checkMessage(wire, label) {
  const { message, bundle, issues } = convertToFhir(wire);
  const values = patientValues(message);
  assert.ok(values.length >= 6, `${label}: the synthetic PID carries identifiers`);

  for (const { type, issues: found } of validateEntries(bundle)) {
    const errors = found.filter((issue) => issue.severity === "error" || issue.severity === "fatal");
    assert.deepEqual(errors, [], `${label}: ${type} has validation errors`);
  }

  const json = JSON.parse(serializeResource(bundle));
  const [patient] = resourcesOf(json, "Patient");
  assert.ok(patient, `${label}: no Patient`);
  assert.equal(patient.name[0].family, message.get("PID.5.1"), `${label}: Patient.name.family`);
  assert.equal(patient.identifier[0].value, message.get("PID.3.1"), `${label}: Patient.identifier.value`);
  assert.equal(patient.identifier[0].system, MRN_SYSTEM, `${label}: Patient.identifier.system`);
  assertAbsent(JSON.stringify(issues), values, `${label}: the transform diagnostics`);

  for (const coded of codedValues(json)) {
    if (coded.system === "http://unitsofmeasure.org") {
      assert.equal(validateUcum(coded.code).valid, true, `${label}: ${coded.path} is not valid UCUM`);
    }
  }

  const { document, manifest, unexaminedResiduals } = deidentifyFhir(bundle);
  const text = serializeResource(document);
  const reread = parseResource(text);
  assert.equal(resourceType(reread.resource), "Bundle", `${label}: the de-identified Bundle does not read back`);
  // De-identification adds no read issue of its own: the Bundle reads back with the issues the
  // converted Bundle reads back with (an information note on a decimal, for example).
  assert.deepEqual(
    reread.issues,
    parseResource(serializeResource(bundle)).issues,
    `${label}: the de-identified Bundle reads back with new issues`,
  );
  assert.ok(manifest.length > 0, `${label}: de-identification acted on nothing`);
  assert.ok(manifest.every((entry) => entry.disposition !== "blocked"), `${label}: a locus was blocked`);
  assertAbsent(text, values, `${label}: the de-identified Bundle`);
  assertAbsent(JSON.stringify(manifest), values, `${label}: the manifest`);
  assertAbsent(JSON.stringify(unexaminedResiduals), values, `${label}: the residual list`);
  for (const address of resourcesOf(JSON.parse(text), "Patient").flatMap((resource) => resource.address)) {
    assert.ok(String(address.postalCode).length <= 3, `${label}: a ZIP code kept more than three digits`);
  }
}
