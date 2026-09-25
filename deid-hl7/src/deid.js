// @ts-check
import { createDeidContext } from "@cosyte/deid";
import { deidentifyHl7 } from "@cosyte/deid/hl7";
import { parseHL7 } from "@cosyte/hl7";
import { generateAdt } from "@cosyte/synth/hl7";

/**
 * Build a synthetic ADT^A01 (admit) message. The same seed gives the same bytes on every machine,
 * and every name, identifier, date, phone and address comes from @cosyte/synth's synthetic pools.
 *
 * @param {number} seed
 * @returns {string} the HL7 v2 wire text, segments separated by carriage returns
 */
export function syntheticAdmit(seed) {
  return generateAdt({ seed, trigger: "A01" }).toString();
}

/**
 * The patient identifiers in PID that Safe Harbor must not let through, read from the parsed input.
 * The check after de-identification looks for each of these values in the output.
 *
 * @param {import("@cosyte/hl7").Hl7Message} message
 * @returns {string[]}
 */
export function patientIdentifiers(message) {
  const paths = ["PID.3.1", "PID.5.1", "PID.5.2", "PID.7", "PID.11.1", "PID.13", "PID.19"];
  return paths.map((path) => message.get(path)).filter((value) => typeof value === "string" && value !== "");
}

/**
 * De-identify an HL7 v2 message under the built-in Safe Harbor policy.
 *
 * The key only feeds keyed transforms (a pseudonymized identifier). It stays in this process: it
 * never appears in the output message or in the manifest.
 *
 * @param {string} wire
 * @param {string} key
 */
export function deidentifyMessage(wire, key) {
  const input = parseHL7(wire);
  const context = createDeidContext({ key });
  const { document, manifest } = deidentifyHl7(input, { context });
  return { input, output: document, manifest };
}
