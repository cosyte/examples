// @ts-check
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
 * The policy uses no keyed transform, so it needs no key: a surrogate computed from the medical
 * record number would be derived from the patient's own identifier, which Safe Harbor does not
 * permit, so the policy removes the number instead. Besides the manifest of what it acted on, the
 * pass returns `unexaminedResiduals`: each value-bearing position it handed through without a rule,
 * by locus and count, never by value.
 *
 * @param {string} wire
 */
export function deidentifyMessage(wire) {
  const input = parseHL7(wire);
  const { document, manifest, unexaminedResiduals } = deidentifyHl7(input);
  return { input, output: document, manifest, residuals: unexaminedResiduals };
}
