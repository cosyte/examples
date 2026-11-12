// @ts-check
import { deidentifyMessage, patientIdentifiers, syntheticAdmit } from "./deid.js";

const SEED = 12345;

const wire = syntheticAdmit(SEED);
const { input, output, manifest, residuals } = deidentifyMessage(wire);

// Nothing below prints a value from the message, synthetic or not: an example that logs a patient's
// name teaches a pipeline to log one. It prints segment names, counts, date precision and codes.
/** @param {string} text */
const segmentsOf = (text) => text.split("\r").filter(Boolean);
/** @param {string} segment The fields of a segment that hold anything: a count, never a value. */
const filled = (segment) => segment.split("|").slice(1).filter((field) => field !== "").length;

const before = segmentsOf(wire);
const after = segmentsOf(output.toString());
console.log(`Synthetic ADT^A01 from @cosyte/synth (seed ${SEED}), ${before.length} segments.`);
console.log("\nFields holding a value, per segment, before and after (Safe Harbor policy):");
before.forEach((segment, i) => {
  console.log(`  ${segment.slice(0, 3)}  ${String(filled(segment)).padStart(2)} -> ${filled(after[i] ?? "")}`);
});

// To see what a field holds, read it into a variable or assert on it. The values in these comments
// are synthetic, from @cosyte/synth.
const birthDateIn = input.get("PID.7"); // "19610809", synthetic
const birthDateOut = output.get("PID.7"); // "1961", synthetic
/** @param {string | undefined} value An HL7 v2 date or timestamp, named by its precision only. */
const precision = (value) => {
  if (!value) return "empty";
  if (value.length <= 4) return "year";
  if (value.length <= 6) return "month";
  return value.length <= 8 ? "day" : "time";
};
console.log("\nDate precision, before and after:");
console.log(`  PID-7  ${precision(birthDateIn)} -> ${precision(birthDateOut)}`);
for (const path of ["MSH.7", "EVN.2"]) {
  console.log(`  ${path.replace(".", "-")}  ${precision(input.get(path))} -> ${precision(output.get(path))}`);
}

console.log("\nManifest (value-free: locus, category, transform, disposition, code):");
for (const entry of manifest) {
  const row = [entry.locus, entry.category, entry.transform, entry.disposition, entry.code];
  console.log(`  ${row.map((cell) => cell.padEnd(12)).join(" ").trimEnd()}`);
}

// The positions the policy handed through without a rule, one line per segment. Nothing here was
// examined, so review the list against the positions your own policy must cover.
const positions = residuals.reduce((total, residual) => total + residual.count, 0);
console.log(`\nUnexamined residuals (value-free: ${positions} positions passed through without a rule):`);
/** @type {Map<string, string[]>} */
const bySegment = new Map();
for (const { locus, count } of residuals) {
  const segment = locus.split("-")[0];
  bySegment.set(segment, [...(bySegment.get(segment) ?? []), count > 1 ? `${locus} (${count})` : locus]);
}
for (const loci of bySegment.values()) console.log(`  ${loci.join(" ")}`);

// A check you can keep in your own pipeline: no input identifier survives in the output, and the
// manifest and the residual list name categories and loci but never a value.
const outputText = output.toString();
const identifiers = patientIdentifiers(input);
const leaked = identifiers.filter((value) => outputText.includes(value));
const inManifest = identifiers.filter((value) => JSON.stringify(manifest).includes(value));
const inResiduals = identifiers.filter((value) => JSON.stringify(residuals).includes(value));

console.log(`\nInput identifiers checked: ${identifiers.length}`);
console.log(`Found in the de-identified message: ${leaked.length}`);
console.log(`Found in the manifest: ${inManifest.length}`);
console.log(`Found in the residual list: ${inResiduals.length}`);

if (leaked.length > 0 || inManifest.length > 0 || inResiduals.length > 0) process.exitCode = 1;
