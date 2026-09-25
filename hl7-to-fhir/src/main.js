// @ts-check
import {
  bundleEntries,
  convertToFhir,
  countBySeverity,
  nodesAt,
  stringsAt,
  syntheticAdmit,
  validateBundle,
} from "./convert.js";

const SEED = 12345;

/**
 * Print one aligned line: a label, then the string values each path selects on `node`.
 *
 * @param {string} label
 * @param {import("@cosyte/fhir").FhirNode} node
 * @param {string} template the line, with each {path} replaced by the values that path selects
 */
function field(label, node, template) {
  const text = template.replace(/\{([\w.]+)\}/g, (_, path) => stringsAt(node, path).join(" "));
  console.log(`  ${label.padEnd(11)} ${text}`);
}

const wire = syntheticAdmit(SEED);
const { bundle, issues } = convertToFhir(wire);

console.log(`Synthetic ADT^A01 from @cosyte/synth (seed ${SEED}):`);
for (const segment of wire.split("\r").filter(Boolean)) console.log(`  ${segment}`);

// A message Bundle: the MessageHeader first, then the resources the message describes.
const entries = bundleEntries(bundle);
const type = stringsAt(bundle, "type")[0];
const identifier = stringsAt(bundle, "identifier.value")[0];
console.log(`\nFHIR R4 Bundle from @cosyte/transform (type ${type}, identifier ${identifier}):`);
for (const entry of entries) console.log(`  ${entry.type.padEnd(14)} ${entry.fullUrl}`);

const patient = entries.find((entry) => entry.type === "Patient");
if (patient) {
  console.log("\nPatient (from PID):");
  field("name", patient.resource, "family {name.family}, given {name.given}");
  for (const id of nodesAt(patient.resource, "identifier")) {
    field("identifier", id, "{value}, type {type.coding.code}, system {system}");
  }
  field("gender", patient.resource, "{gender}");
  field("birthDate", patient.resource, "{birthDate}");
  for (const address of nodesAt(patient.resource, "address")) {
    field("address", address, "line {line}, city {city}, state {state}, postalCode {postalCode}");
  }
}

const encounter = entries.find((entry) => entry.type === "Encounter");
if (encounter) {
  const subject = stringsAt(encounter.resource, "subject.reference")[0];
  const target = subject !== undefined && subject === patient?.fullUrl ? "the" : "not the";
  console.log("\nEncounter (from PV1):");
  field("class", encounter.resource, "{class.code} ({class.display})");
  field("status", encounter.resource, "{status}");
  field("subject", encounter.resource, `{subject.reference} (${target} Patient entry)`);
}

// Every issue is value-free: a stable code and positions, never a value from the message.
console.log("\nTransform diagnostics (severity, code, v2 location, FHIR path):");
for (const { severity, code, v2Location, fhirPath } of issues) {
  const row = [severity.padEnd(12), code.padEnd(35), v2Location.padEnd(7), fhirPath ?? ""];
  console.log(`  ${row.join(" ").trimEnd()}`);
}

console.log("\nValidation with @cosyte/fhir (strict mode, starter-kit profiles):");
const results = validateBundle(bundle);
for (const result of results) {
  const { fatal, error, warning, information } = countBySeverity(result.issues);
  const codes = [...new Set(result.issues.map((issue) => issue.code))];
  const named = codes.length > 0 ? ` (${codes.join(", ")})` : "";
  const row = `errors ${fatal + error}, warnings ${warning}, information ${information}${named}`;
  console.log(`  ${result.type.padEnd(14)} ${row}`);
}
const total = countBySeverity(results.flatMap((result) => result.issues));
const totals = `${total.fatal} fatal, ${total.error} errors, ${total.warning} warnings`;
console.log(`  ${"Total".padEnd(14)} ${totals}, ${total.information} information`);

if (total.fatal + total.error > 0) process.exitCode = 1;
