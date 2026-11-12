// @ts-check
// Shared by the integration tests: synthetic messages of every kind @cosyte/synth generates, and small
// readers over the FHIR JSON the pipeline writes.
import assert from "node:assert/strict";
import { deidentifyFhir } from "@cosyte/deid/fhir";
import { deidentifyHl7 } from "@cosyte/deid/hl7";
import {
  STARTER_PROFILES,
  VETERINARY_PATIENT_STARTER,
  parseResource,
  readPatientAnimal,
  resourceType,
  serializeResource,
  validateResource,
} from "@cosyte/fhir";
import { createStarterClient, createStarterServer } from "@cosyte/mllp";
import { generateAdt, generateOrm, generateOru, generateSiu, generateVxu } from "@cosyte/synth/hl7";
import { validateUcum } from "@cosyte/terminology";
import { bundleEntries, convertToFhir, MRN_SYSTEM, stringsAt } from "../../src/convert.js";

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
 * The one locus @cosyte/deid blocks in a converted Bundle: the data-absent-reason extension the
 * transform writes on `MessageHeader.source._endpoint`, since `MSH-3` names no endpoint. The FHIR
 * pass does not write an extension on a primitive, and from 0.2.13 it records each one it drops with
 * a blocked row. Any other blocked locus fails.
 */
export const EXPECTED_BLOCKED_LOCI = Object.freeze(["Bundle.entry[0].resource.source._endpoint.extension[0]"]);

/**
 * The loci of the manifest rows that blocked a value.
 *
 * @param {readonly { locus: string, disposition: string }[]} manifest
 * @returns {string[]}
 */
export function blockedLoci(manifest) {
  return manifest.filter((entry) => entry.disposition === "blocked").map((entry) => entry.locus);
}

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
  assert.deepEqual(blockedLoci(manifest), EXPECTED_BLOCKED_LOCI, `${label}: a locus other than the expected one was blocked`);
  assertAbsent(text, values, `${label}: the de-identified Bundle`);
  assertAbsent(JSON.stringify(manifest), values, `${label}: the manifest`);
  assertAbsent(JSON.stringify(unexaminedResiduals), values, `${label}: the residual list`);
  for (const address of resourcesOf(JSON.parse(text), "Patient").flatMap((resource) => resource.address)) {
    assert.ok(String(address.postalCode).length <= 3, `${label}: a ZIP code kept more than three digits`);
  }
}

/** The MLLP link in the animal pipeline binds loopback only. */
export const LOOPBACK = "127.0.0.1";

/** The ADT triggers @cosyte/synth generates for an animal patient. */
export const ANIMAL_TRIGGERS = Object.freeze(["A01", "A04", "A08"]);

/**
 * A synthetic veterinary ADT from @cosyte/synth: the pet's name in PID-5, the record number and a
 * microchip in PID-3, the species in PID-35, the breed in PID-36, and the owner in an NK1.
 *
 * @param {number} seed
 * @param {string} trigger one of {@link ANIMAL_TRIGGERS}
 * @returns {string}
 */
export function animalAdt(seed, trigger) {
  return generateAdt({ seed, trigger: /** @type {"A01"} */ (trigger), subject: "animal" }).toString();
}

/**
 * Field `index` of the first `name` segment, read straight from the wire text with no parser, so the
 * pipeline is checked against what the generator wrote rather than against its own reading.
 *
 * @param {string} wire
 * @param {string} name a segment name, for example "PID"
 * @param {number} index the field number, as in "PID-35"
 * @returns {string}
 */
export function fieldOf(wire, name, index) {
  const segment = wire.split("\r").find((line) => line.startsWith(`${name}|`));
  assert.ok(segment, `the message has no ${name} segment`);
  // MSH-1 is the field separator itself, so in MSH the split is one field behind the numbering.
  const position = name === "MSH" ? index - 1 : index;
  const fields = segment.split("|");
  assert.ok(position < fields.length, `${name} has no field ${index}`);
  return fields[position];
}

/**
 * @typedef {{ code: string | undefined, text: string | undefined }} Coded
 */

/**
 * What the generator put in an animal ADT: the species and breed (code and text), and the values that
 * identify the animal or its owner, which de-identification must remove: the birth date in the HL7 v2
 * form and in the YYYY-MM-DD form FHIR writes it in, the phone, and the city among them.
 *
 * @param {string} wire
 */
export function animalSource(wire) {
  /** @param {string} cwe @returns {Coded} */
  const coded = (cwe) => {
    const [code, text] = cwe.split("^");
    return { code, text };
  };
  const identifiers = fieldOf(wire, "PID", 3)
    .split("~")
    .map((repetition) => repetition.split("^"));
  const microchipIndex = identifiers.findIndex((parts) => parts[4] === "MCN");
  const record = identifiers.find((parts) => parts[4] === "MR");
  assert.ok(microchipIndex >= 0 && record, "the animal PID-3 carries a record number and a microchip");
  const [family, petName] = fieldOf(wire, "PID", 5).split("^");
  const [ownerFamily, ownerGiven] = fieldOf(wire, "NK1", 2).split("^");
  assert.equal(fieldOf(wire, "NK1", 3).split("^")[0], "OWN", "the NK1 is the owner");
  const address = fieldOf(wire, "PID", 11).split("^");
  const birthDate = fieldOf(wire, "PID", 7);
  return {
    species: coded(fieldOf(wire, "PID", 35)),
    breed: coded(fieldOf(wire, "PID", 36)),
    microchipIndex,
    identifiers: {
      petName,
      family,
      microchip: identifiers[microchipIndex][0],
      record: record[0],
      ownerFamily,
      ownerGiven,
      street: address[0],
      city: address[2],
      phone: fieldOf(wire, "PID", 13),
      birthDate,
      fhirBirthDate: `${birthDate.slice(0, 4)}-${birthDate.slice(4, 6)}-${birthDate.slice(6, 8)}`,
    },
  };
}

/**
 * Code and text of an HL7 v2 CWE as @cosyte/hl7 reads it, or undefined when the field is empty.
 *
 * @param {import("@cosyte/hl7").CWE | undefined} cwe
 * @returns {Coded | undefined}
 */
export function codedFromCwe(cwe) {
  return cwe === undefined ? undefined : { code: cwe.identifier, text: cwe.text };
}

/**
 * Code and display of the first coding of a FHIR CodeableConcept, or undefined when there is none.
 *
 * @param {import("@cosyte/fhir").FhirComplex | undefined} concept
 * @returns {Coded | undefined}
 */
export function codedFromConcept(concept) {
  return concept === undefined
    ? undefined
    : { code: stringsAt(concept, "coding.code")[0], text: stringsAt(concept, "coding.display")[0] };
}

/**
 * The rule every step of the animal pipeline is held to: species and breed either come out as they
 * went in, or the step says it lost them. A silent loss fails, naming the step and the part, never a
 * value. Returns which of the two happened.
 *
 * @param {string} step
 * @param {"species" | "breed"} part
 * @param {Coded} expected what the generator wrote
 * @param {Coded | undefined} actual what the step gave back
 * @param {boolean} declared whether the step raised an issue or a manifest row for this part
 * @returns {"kept" | "declared"}
 */
export function assertCarried(step, part, expected, actual, declared) {
  if (actual !== undefined && actual.code === expected.code && actual.text === expected.text) return "kept";
  assert.ok(declared, `${step}: ${part} was lost with no issue`);
  return "declared";
}

/**
 * The FHIR locus of one part of the Patient's patient-animal extension in a Bundle, as
 * @cosyte/deid names it in its manifest.
 *
 * @param {{ entry: { resource: any }[] }} bundle the Bundle as JSON
 * @param {"species" | "breed"} part
 * @returns {string}
 */
export function animalLocus(bundle, part) {
  const entry = bundle.entry.findIndex((item) => item.resource.resourceType === "Patient");
  const extensions = bundle.entry[entry].resource.extension;
  const animal = extensions.findIndex((/** @type {any} */ item) => item.url === PATIENT_ANIMAL_URL);
  const index = extensions[animal].extension.findIndex((/** @type {any} */ item) => item.url === part);
  return `Bundle.entry[${entry}].resource.extension[${animal}].extension[${index}].valueCodeableConcept`;
}

const PATIENT_ANIMAL_URL = "http://hl7.org/fhir/StructureDefinition/patient-animal";

/**
 * What the receiving end of the animal pipeline does with each message it is handed by the MLLP
 * listener: parse it with @cosyte/hl7 and convert it with @cosyte/transform (the starter's
 * `convertToFhir`), then de-identify both the HL7 v2 message and the FHIR Bundle with @cosyte/deid.
 * The Bundle is de-identified twice: with the defaults (`fhir`), and with the opt-in
 * `keepPatientAnimal` (`fhirKeepAnimal`), which keeps the coded species and breed.
 *
 * @param {Buffer} payload the message as received, framing stripped
 */
export function receiveAnimal(payload) {
  const wire = payload.toString();
  const { message, bundle, issues } = convertToFhir(wire);
  return {
    wire,
    message,
    bundle,
    issues,
    hl7: deidentifyHl7(message),
    fhir: deidentifyFhir(bundle),
    fhirKeepAnimal: deidentifyFhir(bundle, { keepPatientAnimal: true }),
  };
}

/**
 * The species and breed of the Patient in a de-identified Bundle, read back with @cosyte/fhir's
 * `readPatientAnimal`; each is undefined when the pass dropped it.
 *
 * @param {ReturnType<typeof deidentifyFhir>} result what `deidentifyFhir` returned
 * @param {string} label
 * @returns {Record<"species" | "breed", Coded | undefined>}
 */
export function animalAfter(result, label) {
  const after = bundleEntries(result.document).find((entry) => entry.type === "Patient");
  assert.ok(after, `${label}: the de-identified Bundle has no Patient`);
  const kept = readPatientAnimal(after.resource);
  assert.ok(kept, `${label}: the de-identified Patient lost its patient-animal extension`);
  return { species: codedFromConcept(kept.species), breed: codedFromConcept(kept.breed) };
}

/** @typedef {ReturnType<typeof receiveAnimal>} AnimalReceipt */

/**
 * Send each message over a real MLLP link on 127.0.0.1 to a listener that runs {@link receiveAnimal}
 * before it answers, so an AA means the whole receiving pipeline ran. Returns the ACK text for each
 * message and what the listener produced, in order.
 *
 * @param {readonly string[]} wires
 * @returns {Promise<{ acks: string[], receipts: AnimalReceipt[] }>}
 */
export async function sendAnimals(wires) {
  /** @type {AnimalReceipt[]} */
  const receipts = [];
  const server = await createStarterServer({
    port: 0,
    host: LOOPBACK,
    onMessage: (payload) => void receipts.push(receiveAnimal(Buffer.from(payload))),
  });
  try {
    const { host, port } = server.getStats();
    assert.equal(host, LOOPBACK, "the listener is bound to loopback only");
    assert.ok(port, "the listener is bound to a port");
    const client = await createStarterClient({ host: LOOPBACK, port, autoReconnect: false, ackTimeoutMs: 10_000 });
    try {
      /** @type {string[]} */
      const acks = [];
      for (const wire of wires) acks.push((await client.send(Buffer.from(wire))).toString());
      return { acks, receipts };
    } finally {
      await client.close();
    }
  } finally {
    await server.close();
  }
}

/**
 * Check one animal message at every step of the pipeline: the MLLP link, @cosyte/hl7's typed
 * fields, @cosyte/transform's patient-animal extension read back with @cosyte/fhir's
 * `readPatientAnimal`, and both de-identifications. At each step species and breed are kept or the
 * loss is declared ({@link assertCarried}); the values {@link animalSource} lists as identifying are
 * gone from every de-identified output. Returns, for each FHIR de-identification (`fhir`, the
 * default, and `fhirKeepAnimal`, the opt-in), which of the two happened to each part.
 *
 * @param {string} sent the wire text that was sent
 * @param {string} ack the ACK text the sender got back
 * @param {AnimalReceipt} receipt what the listener produced
 * @param {string} label
 */
export function checkAnimal(sent, ack, receipt, label) {
  const source = animalSource(sent);
  const secrets = Object.values(source.identifiers);
  const msa = ack.split("\r").find((segment) => segment.startsWith("MSA|"));
  assert.equal(msa, `MSA|AA|${fieldOf(sent, "MSH", 10)}`, `${label}: the receiving pipeline did not accept the message`);

  // MLLP: the bytes arrive as sent.
  assert.equal(receipt.wire, sent, `${label}: the message changed on the MLLP link`);

  // @cosyte/hl7: species and breed read by name, with no parse warning. The typed reader has no
  // issue of its own for a field it leaves out, so here a loss is never declared.
  const { message } = receipt;
  assert.deepEqual(message.warnings, [], `${label}: the animal ADT parses with warnings`);
  assert.ok(message.patient, `${label}: no typed patient`);
  for (const part of /** @type {const} */ (["species", "breed"])) {
    assertCarried(`${label} hl7`, part, source[part], codedFromCwe(message.patient[part]), false);
  }

  // @cosyte/transform, read back with @cosyte/fhir: the patient-animal extension carries both parts,
  // and the Patient validates against the veterinary starter profile.
  const patient = bundleEntries(receipt.bundle).find((entry) => entry.type === "Patient");
  assert.ok(patient, `${label}: no Patient`);
  const animal = readPatientAnimal(patient.resource);
  assert.ok(animal, `${label}: the Patient has no patient-animal extension`);
  assert.deepEqual(animal.issues, [], `${label}: the patient-animal extension reads back with issues`);
  for (const part of /** @type {const} */ (["species", "breed"])) {
    const location = part === "species" ? "PID.35" : "PID.36";
    const declared = receipt.issues.some((issue) => issue.v2Location === location);
    assert.equal(assertCarried(`${label} transform`, part, source[part], codedFromConcept(animal[part]), declared), "kept");
  }
  const profiles = [...STARTER_PROFILES, VETERINARY_PATIENT_STARTER];
  const { issues: found } = validateResource(patient.resource, { mode: "strict", profiles });
  assert.deepEqual(found, [], `${label}: the Patient has issues under the veterinary starter profile`);
  assertAbsent(JSON.stringify(receipt.issues), secrets, `${label}: the transform diagnostics`);

  // @cosyte/deid on the HL7 v2 message: species and breed kept, the pet's name, the microchip and the
  // owner's name removed, each with its manifest row.
  const hl7 = receipt.hl7;
  assert.ok(hl7.document.patient, `${label}: no typed patient after de-identification`);
  for (const part of /** @type {const} */ (["species", "breed"])) {
    const field = part === "species" ? "PID-35" : "PID-36";
    const declared = hl7.manifest.some((entry) => entry.locus.startsWith(field));
    assert.equal(assertCarried(`${label} hl7 deid`, part, source[part], codedFromCwe(hl7.document.patient[part]), declared), "kept");
  }
  const removed = hl7.manifest.filter((entry) => entry.disposition === "removed").map((entry) => entry.locus);
  for (const locus of ["PID-5", `PID-3[${source.microchipIndex}]`, "NK1-2"]) {
    assert.ok(removed.includes(locus), `${label}: the HL7 v2 de-identification did not remove ${locus}`);
  }
  assertAbsent(hl7.document.toString(), secrets, `${label}: the de-identified HL7 v2 message`);
  assertAbsent(JSON.stringify(hl7.manifest), secrets, `${label}: the HL7 v2 manifest`);
  assertAbsent(JSON.stringify(hl7.unexaminedResiduals), secrets, `${label}: the HL7 v2 residual list`);

  // @cosyte/deid on the FHIR Bundle, with the defaults and with keepPatientAnimal: the same
  // identifiers gone, and species and breed kept or their removal recorded in the manifest.
  const before = JSON.parse(serializeResource(receipt.bundle));
  return {
    fhir: checkFhirAnimal(receipt.fhir, before, source, `${label} fhir deid`),
    fhirKeepAnimal: checkFhirAnimal(receipt.fhirKeepAnimal, before, source, `${label} fhir deid keepPatientAnimal`),
  };
}

/**
 * Check one FHIR de-identification of an animal Bundle: no identifier in the output, the manifest or
 * the residual list, and species and breed kept or their loss recorded by a manifest row at their
 * locus ({@link assertCarried}). Returns which of the two happened to each part.
 *
 * @param {ReturnType<typeof deidentifyFhir>} result what `deidentifyFhir` returned
 * @param {{ entry: { resource: any }[] }} before the Bundle before de-identification, as JSON
 * @param {ReturnType<typeof animalSource>} source what the generator wrote
 * @param {string} label
 * @returns {Record<"species" | "breed", "kept" | "declared">}
 */
function checkFhirAnimal(result, before, source, label) {
  const secrets = Object.values(source.identifiers);
  const { document, manifest, unexaminedResiduals } = result;
  assertAbsent(serializeResource(document), secrets, `${label}: the de-identified Bundle`);
  assertAbsent(JSON.stringify(manifest), secrets, `${label}: the FHIR manifest`);
  assertAbsent(JSON.stringify(unexaminedResiduals), secrets, `${label}: the FHIR residual list`);
  const kept = animalAfter(result, label);
  /** @type {Record<"species" | "breed", "kept" | "declared">} */
  const outcome = { species: "declared", breed: "declared" };
  for (const part of /** @type {const} */ (["species", "breed"])) {
    // Any manifest row at the locus records what the pass did there.
    const declared = manifest.some((entry) => entry.locus === animalLocus(before, part));
    outcome[part] = assertCarried(label, part, source[part], kept[part], declared);
  }
  return outcome;
}
