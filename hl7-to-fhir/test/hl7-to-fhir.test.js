// @ts-check
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { STARTER_PROFILES, validateResource } from "@cosyte/fhir";
import { parseHL7 } from "@cosyte/hl7";
import { toFhir } from "@cosyte/transform";
import {
  bundleEntries,
  convertToFhir,
  MRN_SYSTEM,
  stringsAt,
  syntheticAdmit,
  validateBundle,
} from "../src/convert.js";

const run = promisify(execFile);
const starterDir = fileURLToPath(new URL("..", import.meta.url));

// The v2-to-FHIR guide's maps for the codes synth emits: HL7 table 0001 (administrative sex) to
// FHIR administrative-gender, and table 0004 (patient class) to the v3 ActCode encounter class.
/** @type {Record<string, string>} */
const GENDER = { M: "male", F: "female", O: "other", U: "unknown", A: "other", N: "other" };
/** @type {Record<string, string>} */
const ENCOUNTER_CLASS = { E: "EMER", I: "IMP", O: "AMB", P: "PRENC" };

// Seeds chosen to cover patient classes E, O and I, and both sexes.
const SEEDS = [12345, 1, 7, 42];

test("npm start prints the Patient, the Encounter and zero validation errors", async () => {
  const { stdout } = await run(process.execPath, ["src/main.js"], { cwd: starterDir });
  const patient = parseHL7(syntheticAdmit(12345)).patient;

  assert.match(
    stdout,
    new RegExp(`^  name {8}family ${patient?.familyName}, given ${patient?.givenName}$`, "m"),
  );
  assert.match(stdout, /^ {2}Patient {8}errors 0, warnings 0/m);
  assert.match(stdout, /^ {2}Total {10}0 fatal, 0 errors, /m);
});

for (const seed of SEEDS) {
  test(`seed ${seed}: the Patient and the Encounter match the parsed PID and PV1`, () => {
    const { message, bundle } = convertToFhir(syntheticAdmit(seed));
    const { meta, patient, visit } = message;
    assert.ok(patient && visit, "the synthetic admit has a PID and a PV1");

    // A message Bundle: MessageHeader first, identified by MSH-10, event from MSH-9.2.
    const entries = bundleEntries(bundle);
    assert.equal(stringsAt(bundle, "type")[0], "message");
    assert.equal(stringsAt(bundle, "identifier.value")[0], meta.controlId);
    assert.equal(entries[0]?.type, "MessageHeader");
    assert.equal(stringsAt(entries[0].resource, "eventCoding.code")[0], meta.triggerEvent);

    const patientEntry = entries.find((entry) => entry.type === "Patient");
    assert.ok(patientEntry, "the Bundle has a Patient");
    const fhirPatient = patientEntry.resource;
    assert.equal(stringsAt(fhirPatient, "name.family")[0], patient.familyName);
    assert.deepEqual(stringsAt(fhirPatient, "name.given"), [patient.givenName]);
    assert.equal(stringsAt(fhirPatient, "identifier.value")[0], patient.mrn);
    assert.equal(stringsAt(fhirPatient, "identifier.system")[0], MRN_SYSTEM);
    assert.equal(
      stringsAt(fhirPatient, "identifier.type.coding.code")[0],
      patient.identifiers[0]?.identifierTypeCode,
    );
    assert.equal(stringsAt(fhirPatient, "gender")[0], GENDER[patient.sex ?? ""]);
    const dob = patient.dateOfBirth?.raw ?? "";
    assert.equal(
      stringsAt(fhirPatient, "birthDate")[0],
      `${dob.slice(0, 4)}-${dob.slice(4, 6)}-${dob.slice(6, 8)}`,
    );
    assert.deepEqual(stringsAt(fhirPatient, "address.line"), [patient.address?.street]);
    assert.equal(stringsAt(fhirPatient, "address.city")[0], patient.address?.city);
    assert.equal(stringsAt(fhirPatient, "address.state")[0], patient.address?.stateOrProvince);
    assert.equal(stringsAt(fhirPatient, "address.postalCode")[0], patient.address?.zipOrPostalCode);

    const encounterEntry = entries.find((entry) => entry.type === "Encounter");
    assert.ok(encounterEntry, "the Bundle has an Encounter");
    const encounter = encounterEntry.resource;
    assert.equal(stringsAt(encounter, "class.code")[0], ENCOUNTER_CLASS[visit.patientClass ?? ""]);
    assert.equal(stringsAt(encounter, "status")[0], "in-progress");
    assert.equal(stringsAt(encounter, "subject.reference")[0], patientEntry.fullUrl);
  });

  test(`seed ${seed}: no validation errors, and no patient value in the diagnostics`, () => {
    const { message, bundle, issues } = convertToFhir(syntheticAdmit(seed));

    for (const { type, issues: found } of validateBundle(bundle)) {
      const errors = found.filter(
        (issue) => issue.severity === "error" || issue.severity === "fatal",
      );
      assert.deepEqual(errors, [], `${type} has validation errors`);
    }

    const patient = message.patient;
    const values = [
      patient?.mrn,
      patient?.familyName,
      patient?.givenName,
      patient?.dateOfBirth?.raw,
    ];
    const diagnostics = JSON.stringify(issues);
    for (const value of values) {
      assert.ok(value, "the synthetic PID carries the value");
      assert.ok(
        !diagnostics.includes(value),
        "a transform diagnostic carries a value from the message",
      );
    }
  });
}

test("without an identifier system for COSYTE-SYNTH, the starter Patient profile flags it", () => {
  // No naming system: the transform will not make a system URI up from the bare namespace.
  const { bundle, issues } = toFhir(parseHL7(syntheticAdmit(12345)));
  assert.ok(issues.some((issue) => issue.code === "TRANSFORM_IDENTIFIER_SYSTEM_UNRESOLVED"));

  const patient = bundleEntries(bundle).find((entry) => entry.type === "Patient");
  assert.ok(patient);
  const { issues: found } = validateResource(patient.resource, {
    mode: "strict",
    profiles: STARTER_PROFILES,
  });
  assert.ok(
    found.some(
      (issue) => issue.severity === "error" && issue.expression === "Patient.identifier.system",
    ),
  );
});
