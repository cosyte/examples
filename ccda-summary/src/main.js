// @ts-check
import { parseCcda } from "@cosyte/ccda";
import { summarize, syntheticCcdXml } from "./ccda.js";

const SEED = 198;

/** @param {string | undefined} value */
const shown = (value) => value ?? "not recorded";

/**
 * The precision of a date from `v3Date` (YYYY-MM-DD, YYYY-MM or YYYY), never the date itself.
 *
 * @param {string | undefined} date
 */
const precision = (date) => (date === undefined ? "not recorded" : ["year", "month", "day"][date.split("-").length - 1]);

// parseCcda takes the XML text of a C-CDA document: here a synthetic CCD, in your integration the
// document a sending system handed you. Quirks become warnings on doc.warnings, not failures.
const xml = syntheticCcdXml(SEED);
const doc = parseCcda(xml);
const summary = summarize(doc);

console.log(`Synthetic CCD from @cosyte/synth (seed ${SEED}), ${xml.length} characters of XML:`);
const { documentType, documentCode, documentTitle } = summary;
console.log(`  Document type  ${shown(documentType)} (${shown(documentCode)}, ${shown(documentTitle)})`);
// The patient's own values are read, never printed: an example that logs a patient's name teaches a
// pipeline to log one. To see what a field holds, read it into a variable or assert on it.
const patientName = summary.patient.name; // "Voidwin Reprodus", synthetic
const recordNumber = summary.patient.mrn; // "13352434", synthetic
const birthDate = summary.patient.birthDate; // "1973-04-08", synthetic
const held = [patientName && "name", recordNumber && "MRN"].filter(Boolean).join(" and ") || "nothing";
console.log(`  Patient        ${held} recorded, birth date to the ${precision(birthDate)}`);
console.log(`  Warnings       ${doc.warnings.map((w) => w.code).join(", ") || "none"}`);

console.log(`\nProblems (${summary.problems.length}):`);
for (const problem of summary.problems) {
  console.log(`  ${shown(problem.name)}`);
  console.log(`    ${shown(problem.code)}, status ${problem.status}, onset to the ${precision(problem.onset)}`);
}

console.log(`\nMedications (${summary.medications.length}):`);
for (const med of summary.medications) {
  console.log(`  ${shown(med.name)}`);
  console.log(
    `    ${shown(med.code)}, dose ${shown(med.dose)}, route ${shown(med.route)},`,
    `${med.frequency ?? "frequency not recorded"}, status ${shown(med.status)}`,
  );
}

console.log(`\nAllergies (${summary.allergies.length}):`);
for (const allergy of summary.allergies) {
  const reactions = allergy.reactions
    .map((reaction) => `reaction ${shown(reaction.manifestation)}, severity ${shown(reaction.severity)}`)
    .join("; ");
  console.log(`  ${shown(allergy.substance)}`);
  console.log(`    ${shown(allergy.code)}, ${reactions || "reaction not recorded"}, status ${allergy.status}`);
}
