// @ts-check
import { parseCcda } from "@cosyte/ccda";
import { summarize, syntheticCcdXml } from "./ccda.js";

const SEED = 198;

/** @param {string | undefined} value */
const shown = (value) => value ?? "not recorded";

// parseCcda takes the XML text of a C-CDA document: here a synthetic CCD, in your integration the
// document a sending system handed you. Quirks become warnings on doc.warnings, not failures.
const xml = syntheticCcdXml(SEED);
const doc = parseCcda(xml);
const summary = summarize(doc);

console.log(`Synthetic CCD from @cosyte/synth (seed ${SEED}), ${xml.length} characters of XML:`);
const { documentType, documentCode, documentTitle } = summary;
console.log(`  Document type  ${shown(documentType)} (${shown(documentCode)}, ${shown(documentTitle)})`);
const { name, mrn, birthDate, gender } = summary.patient;
console.log(`  Patient        ${shown(name)}, MRN ${shown(mrn)}, born ${shown(birthDate)}, gender ${shown(gender)}`);
console.log(`  Warnings       ${doc.warnings.map((w) => w.code).join(", ") || "none"}`);

console.log(`\nProblems (${summary.problems.length}):`);
for (const problem of summary.problems) {
  console.log(`  ${shown(problem.name)}`);
  console.log(`    ${shown(problem.code)}, status ${problem.status}, onset ${shown(problem.onset)}`);
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
