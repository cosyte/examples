// @ts-check
import { deidentifyMessage, patientIdentifiers, syntheticAdmit } from "./deid.js";

const SEED = 12345;

const wire = syntheticAdmit(SEED);
const { input, output, manifest, residuals } = deidentifyMessage(wire);

console.log(`Synthetic ADT^A01 from @cosyte/synth (seed ${SEED}):`);
for (const segment of wire.split("\r").filter(Boolean)) console.log(`  ${segment}`);

console.log("\nDe-identified (Safe Harbor policy):");
for (const segment of output.toString().split("\r").filter(Boolean)) console.log(`  ${segment}`);

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
