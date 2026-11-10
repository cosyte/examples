// @ts-check
// Shared by the integration tests: synthetic input in every format the `cosyte` CLI reads, written to
// files, and a way to run the installed CLI as a child process, stdin included.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { delimiter, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseCcda, serializeCcda } from "@cosyte/ccda";
import { serializeResource } from "@cosyte/fhir";
import { generateAstmResult } from "@cosyte/synth/astm";
import { generateCcd } from "@cosyte/synth/ccda";
import { generatePatient } from "@cosyte/synth/fhir";
import { generateAdt, generateOrm, generateOru, generateSiu, generateVxu } from "@cosyte/synth/hl7";
import { generateB1, generateNewRx } from "@cosyte/synth/ncpdp";
import { generate271, generate835, generate837P } from "@cosyte/synth/x12";
import { parseX12, serializeX12 } from "@cosyte/x12";
import { patientIdentifiers } from "../../src/make-fixtures.js";

export const starterDir = fileURLToPath(new URL("../..", import.meta.url));
const cosyte = join(starterDir, "node_modules", ".bin", "cosyte");
// Run the CLI on the same Node as this test.
const env = { ...process.env, PATH: `${dirname(process.execPath)}${delimiter}${process.env.PATH}` };

/**
 * One generator per HL7 v2 message kind, each returning wire text. The same seed gives the same bytes
 * on every machine, and every value comes from @cosyte/synth's synthetic pools.
 *
 * @type {Readonly<Record<string, (seed: number) => string>>}
 */
export const HL7_KINDS = Object.freeze({
  "ADT^A01": (seed) => generateAdt({ seed, trigger: "A01" }).toString(),
  "ORU^R01": (seed) => generateOru({ seed }).toString(),
  "ORM^O01": (seed) => generateOrm({ seed }).toString(),
  "SIU^S12": (seed) => generateSiu({ seed }).toString(),
  "VXU^V04": (seed) => generateVxu({ seed }).toString(),
});

/**
 * One synthetic input per format the CLI reads, with the `--format` it needs when it cannot detect it.
 *
 * @type {Readonly<Record<string, { file: string, format?: string, make: (seed: number) => string }>>}
 */
export const INPUTS = Object.freeze({
  hl7: { file: "adt-a01.hl7", make: HL7_KINDS["ADT^A01"] },
  x12835: { file: "remittance.835.x12", make: (seed) => serializeX12(generate835({ seed })) },
  x12837: { file: "claim.837p.x12", make: (seed) => serializeX12(generate837P({ seed })) },
  x12271: { file: "eligibility.271.x12", make: (seed) => serializeX12(generate271({ seed })) },
  ccda: { file: "ccd.xml", make: (seed) => serializeCcda(generateCcd({ seed })) },
  astm: { file: "results.astm", make: (seed) => generateAstmResult({ seed, resultCount: 3 }) },
  fhir: { file: "patient.json", make: (seed) => serializeResource(generatePatient({ seed })) },
  // The CLI detects no NCPDP SCRIPT message on its own, so the format is named.
  script: { file: "newrx.xml", format: "ncpdp", make: (seed) => generateNewRx({ seed }) },
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
 * Write `text` to `name` under the starter's out/integration folder and return the path.
 *
 * @param {string} name
 * @param {string} text
 */
export function writeInput(name, text) {
  const dir = join(starterDir, "out", "integration");
  mkdirSync(dir, { recursive: true });
  const path = join(dir, name);
  writeFileSync(path, text);
  return path;
}

/** A synthetic NCPDP Telecom B1 claim, for the check the CLI does not pass yet. */
export const telecomClaim = (/** @type {number} */ seed) => generateB1({ seed });

/**
 * Run the installed `cosyte` with `args`, writing `input` to its stdin when given. Resolves with the
 * exit code and both streams whatever the exit code: the code is part of what the tests assert.
 *
 * @param {readonly string[]} args
 * @param {string} [input]
 * @returns {Promise<{ code: number | null, stdout: string, stderr: string }>}
 */
export function cli(args, input) {
  return new Promise((resolve, reject) => {
    const child = spawn(cosyte, args, { cwd: starterDir, env });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8").on("data", (chunk) => (stdout += chunk));
    child.stderr.setEncoding("utf8").on("data", (chunk) => (stderr += chunk));
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stdout, stderr }));
    child.stdin.end(input);
  });
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
 * The patient identifiers in an input: PID values for HL7 v2, the patient or subscriber NM1 name and
 * ID for X12, the recordTarget MRN and name for C-CDA.
 *
 * @param {string} format one of hl7, x12, ccda
 * @param {string} text
 * @returns {string[]}
 */
export function identifiersOf(format, text) {
  if (format === "hl7") return patientIdentifiers(text);
  if (format === "x12") {
    const { element, segment } = parseX12(text).delimiters;
    return text
      .split(segment)
      .map((line) => line.trim().split(element))
      .filter(([id, entity]) => id === "NM1" && (entity === "IL" || entity === "QC"))
      .flatMap((elements) => [elements[3], elements[4], elements[9]])
      .filter((value) => typeof value === "string" && value.length > 2);
  }
  const doc = parseCcda(text);
  const { name } = /** @type {any} */ (doc.getPatient());
  return [doc.getMrn(), ...name.given, name.family];
}
