// @ts-check
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { RXNORM, parseCcda } from "@cosyte/ccda";
import { summarize, syntheticCcdXml } from "../src/ccda.js";

const run = promisify(execFile);
const starterDir = fileURLToPath(new URL("..", import.meta.url));
const SEED = 198; // the seed src/main.js uses

/** @param {string | undefined} value */
const shown = (value) => value ?? "not recorded";

test("npm start prints the document type, the patient and the three lists", async () => {
  const { stdout } = await run(process.execPath, ["src/main.js"], { cwd: starterDir });
  const summary = summarize(parseCcda(syntheticCcdXml(SEED)));

  assert.ok(stdout.includes(`  Document type  ${summary.documentType} (`));
  assert.ok(stdout.includes(`  Patient        ${shown(summary.patient.name)}, MRN ${shown(summary.patient.mrn)}, `));
  assert.ok(stdout.includes(`\nProblems (${summary.problems.length}):\n`));
  for (const problem of summary.problems) {
    const detail = `${shown(problem.code)}, status ${problem.status}, `;
    assert.ok(stdout.includes(`  ${shown(problem.name)}\n    ${detail}`));
  }
  assert.ok(stdout.includes(`\nMedications (${summary.medications.length}):\n`));
  for (const med of summary.medications) {
    const detail = `${shown(med.code)}, dose ${shown(med.dose)}, route ${shown(med.route)}, `;
    assert.ok(stdout.includes(`  ${shown(med.name)}\n    ${detail}`));
  }
  assert.ok(stdout.includes(`\nAllergies (${summary.allergies.length}):\n`));
  for (const allergy of summary.allergies) {
    assert.ok(stdout.includes(`  ${shown(allergy.substance)}\n    ${shown(allergy.code)}, `));
  }
});

test("the summary agrees with the XML it was parsed from", () => {
  const xml = syntheticCcdXml(SEED);
  const doc = parseCcda(xml);
  const summary = summarize(doc);

  // @cosyte/synth builds a spec-clean CCD: it parses with no warnings.
  assert.equal(summary.documentType, "ccd");
  assert.deepEqual(doc.warnings, []);

  // One summary row per Problem Observation and per Allergy Observation, one per Medication Activity.
  const problems = doc.getProblems().flatMap((concern) => concern.problems);
  const allergies = doc.getAllergies().flatMap((concern) => concern.allergies);
  const medications = doc.getMedications();
  assert.ok(problems.length > 0 && medications.length > 0 && allergies.length > 0);
  assert.equal(summary.problems.length, problems.length);
  assert.equal(summary.medications.length, medications.length);
  assert.equal(summary.allergies.length, allergies.length);

  // Every code the summary reports is written in the document, and every drug is RxNorm-coded.
  const coded = [
    ...problems.map((problem) => problem.value),
    ...medications.map((med) => med.drug),
    ...allergies.map((allergy) => allergy.allergen),
  ];
  for (const cd of coded) {
    assert.ok(cd?.code !== undefined && xml.includes(`code="${cd.code}"`), "a code is not in the document");
  }
  for (const med of medications) assert.equal(med.drug?.codeSystem, RXNORM);

  // The patient comes from the recordTarget, and the medical record number is one of its identifiers.
  const patient = doc.getPatient();
  assert.ok(patient?.name?.family !== undefined && xml.includes(patient.name.family));
  assert.ok(patient.identifiers.some((id) => id.extension === summary.patient.mrn));
});
