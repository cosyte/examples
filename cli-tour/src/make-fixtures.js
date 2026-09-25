// @ts-check
// Writes the synthetic input the tour runs the `cosyte` CLI over: `node src/make-fixtures.js <dir>`.
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseHL7 } from "@cosyte/hl7";
import { generateAdt } from "@cosyte/synth/hl7";

/** The seed for every generated file. The same seed gives the same bytes on every machine. */
export const SEED = 12345;

/**
 * Build a synthetic ADT^A01 (admit) message. Every name, identifier, date, phone and address comes
 * from @cosyte/synth's synthetic pools.
 *
 * @param {number} seed
 * @returns {string} the HL7 v2 wire text, segments separated by carriage returns
 */
export function syntheticAdmit(seed) {
  return generateAdt({ seed, trigger: "A01" }).toString();
}

/**
 * The patient identifiers in the message's PID segment, read with @cosyte/hl7. The test checks that
 * none of them reaches the CLI's value-free output (its stderr notes and `inspect` summaries).
 *
 * @param {string} wire
 * @returns {string[]}
 */
export function patientIdentifiers(wire) {
  const message = parseHL7(wire);
  const paths = ["PID.3.1", "PID.5.1", "PID.5.2", "PID.7", "PID.11.1", "PID.13", "PID.19"];
  return paths.map((path) => message.get(path) ?? "").filter((value) => value !== "");
}

/**
 * Write the tour's input files into `dir`, creating it if needed.
 *
 * @param {string} dir
 * @returns {{ adt: string }} the path of each file written
 */
export function writeFixtures(dir) {
  mkdirSync(dir, { recursive: true });
  const adt = join(dir, "adt-a01.hl7");
  writeFileSync(adt, syntheticAdmit(SEED));
  return { adt };
}

// Run as a script (not imported): write the files and show what went into them.
if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { adt } = writeFixtures(process.argv[2] ?? "out");
  console.log(`Wrote ${adt}, a synthetic ADT^A01 from @cosyte/synth (seed ${SEED}):`);
  for (const segment of syntheticAdmit(SEED).split("\r").filter(Boolean)) console.log(`  ${segment}`);
}
