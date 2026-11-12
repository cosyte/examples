// @ts-check
// Integration, fast slice: one animal patient through every package. A veterinary ADT from
// @cosyte/synth crosses a real MLLP link on 127.0.0.1 (@cosyte/mllp), is read by @cosyte/hl7, converted
// by @cosyte/transform, read back with @cosyte/fhir's readPatientAnimal, and de-identified by
// @cosyte/deid, as HL7 v2 and as FHIR, the FHIR pass with its defaults and with keepPatientAnimal.
// At every step species and breed are kept or the step says it lost them; a silent loss fails.
// Public APIs only, every value synthetic.
import assert from "node:assert/strict";
import { test } from "node:test";
import { parseResource, readPatientAnimal, serializeResource } from "@cosyte/fhir";
import { generateAdt } from "@cosyte/synth/hl7";
import {
  ANIMAL_TRIGGERS,
  animalAdt,
  animalAfter,
  animalLocus,
  animalSource,
  assertCarried,
  checkAnimal,
  codedFromConcept,
  codedFromCwe,
  receiveAnimal,
  resourcesOf,
  seedRange,
  sendAnimals,
} from "./support.js";

// Seeds 1 to 7 of ADT^A01 draw every species the generator has: horse, dog, cat and cattle.
const MESSAGES = [
  ...seedRange(1, 7).map((seed) => ({ label: `ADT^A01 seed ${seed}`, wire: animalAdt(seed, "A01") })),
  ...ANIMAL_TRIGGERS.slice(1).map((trigger) => ({ label: `ADT^${trigger} seed 1`, wire: animalAdt(1, trigger) })),
];

/** @type {Promise<Awaited<ReturnType<typeof sendAnimals>>> | undefined} */
let sent;
/** One run over the link, shared by the tests that read it. */
function sendOnce() {
  sent ??= sendAnimals(MESSAGES.map((message) => message.wire));
  return sent;
}

test("an animal ADT crosses MLLP, converts to FHIR and de-identifies, species and breed carried at every step", { timeout: 30_000 }, async () => {
  const { acks, receipts } = await sendOnce();
  assert.equal(receipts.length, MESSAGES.length, "every message reached the receiving pipeline");
  /** @type {Set<string>} */
  const species = new Set();
  MESSAGES.forEach(({ label, wire }, index) => {
    checkAnimal(wire, acks[index], receipts[index], label);
    species.add(String(animalSource(wire).species.code));
  });
  assert.deepEqual([...species].sort(), ["CAT", "CATTLE", "DOG", "HORSE"], "the seeds cover every species");
});

test("by default the FHIR de-identification drops species and breed, each with a manifest row", { timeout: 30_000 }, async () => {
  const { acks, receipts } = await sendOnce();
  MESSAGES.forEach(({ label, wire }, index) => {
    const receipt = receipts[index];
    assert.deepEqual(checkAnimal(wire, acks[index], receipt, label).fhir, { species: "declared", breed: "declared" }, label);
    assert.deepEqual(animalAfter(receipt.fhir, label), { species: undefined, breed: undefined }, `${label}: species or breed survived`);
    const before = JSON.parse(serializeResource(receipt.bundle));
    for (const part of /** @type {const} */ (["species", "breed"])) {
      const rows = receipt.fhir.manifest.filter((entry) => entry.locus === animalLocus(before, part));
      assert.equal(rows.length, 1, `${label}: ${part} has no manifest row of its own`);
    }
  });
});

test("with keepPatientAnimal the FHIR de-identification keeps species and breed", { timeout: 30_000 }, async () => {
  const { acks, receipts } = await sendOnce();
  MESSAGES.forEach(({ label, wire }, index) => {
    const receipt = receipts[index];
    assert.deepEqual(checkAnimal(wire, acks[index], receipt, label).fhirKeepAnimal, { species: "kept", breed: "kept" }, label);
    const { species, breed } = animalSource(wire);
    assert.deepEqual(animalAfter(receipt.fhirKeepAnimal, label), { species, breed }, `${label}: species or breed changed`);
  });
});

test("the step check fails when a step drops species or breed with no issue", () => {
  const wire = animalAdt(1, "A01");
  const source = animalSource(wire);
  const lost = /was lost with no issue/;

  // A step that gives the parts back unchanged keeps them; one that drops or changes them passes only
  // when it declared the loss.
  assert.equal(assertCarried("step", "species", source.species, { ...source.species }, false), "kept");
  assert.equal(assertCarried("step", "species", source.species, undefined, true), "declared");
  assert.throws(() => assertCarried("step", "species", source.species, undefined, false), lost);
  assert.throws(() => assertCarried("step", "breed", source.breed, { ...source.breed, code: "OTHER" }, false), lost);

  // A message with no PID-35: the typed reader gives no species, and nothing declares it.
  const human = receiveAnimal(Buffer.from(generateAdt({ seed: 1, trigger: "A01" }).toString()));
  assert.throws(() => assertCarried("hl7", "species", source.species, codedFromCwe(human.message.patient?.species), false), lost);

  // A Patient whose patient-animal extension went missing on the way: nothing to read back.
  const receipt = receiveAnimal(Buffer.from(wire));
  const [patient] = resourcesOf(JSON.parse(serializeResource(receipt.bundle)), "Patient");
  delete patient.extension;
  const animal = readPatientAnimal(parseResource(JSON.stringify(patient)).resource);
  assert.equal(animal, undefined);
  assert.throws(() => assertCarried("transform", "species", source.species, codedFromConcept(animal?.species), false), lost);
});
