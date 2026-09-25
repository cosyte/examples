// @ts-check
import { randomBytes } from "node:crypto";
import { deidentifyMessage, patientIdentifiers, syntheticAdmit } from "./deid.js";

const SEED = 12345;

// The key belongs to you. Set DEID_KEY to keep keyed surrogates stable across runs; without it we
// use a one-off random key, so a keyed surrogate differs from run to run.
const key = process.env.DEID_KEY ?? randomBytes(32).toString("hex");

const wire = syntheticAdmit(SEED);
const { input, output, manifest } = deidentifyMessage(wire, key);

console.log(`Synthetic ADT^A01 from @cosyte/synth (seed ${SEED}):`);
for (const segment of wire.split("\r").filter(Boolean)) console.log(`  ${segment}`);

console.log("\nDe-identified (Safe Harbor policy):");
for (const segment of output.toString().split("\r").filter(Boolean)) console.log(`  ${segment}`);

console.log("\nManifest (value-free: locus, category, transform, disposition, code):");
for (const entry of manifest) {
  const row = [entry.locus, entry.category, entry.transform, entry.disposition, entry.code];
  console.log(`  ${row.map((cell) => cell.padEnd(12)).join(" ").trimEnd()}`);
}

// A check you can keep in your own pipeline: no input identifier survives in the output, and the
// manifest names categories and loci but never a value.
const outputText = output.toString();
const manifestText = JSON.stringify(manifest);
const identifiers = patientIdentifiers(input);
const leaked = identifiers.filter((value) => outputText.includes(value));
const inManifest = identifiers.filter((value) => manifestText.includes(value));

console.log(`\nInput identifiers checked: ${identifiers.length}`);
console.log(`Found in the de-identified message: ${leaked.length}`);
console.log(`Found in the manifest: ${inManifest.length}`);

if (leaked.length > 0 || inManifest.length > 0) process.exitCode = 1;
