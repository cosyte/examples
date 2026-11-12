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
 * Print one aligned line: a label, then the string values each path selects on `node`. Call it only
 * for paths that hold codes, statuses and references, never a value that identifies a person.
 *
 * @param {string} label
 * @param {import("@cosyte/fhir").FhirNode} node
 * @param {string} template the line, with each {path} replaced by the values that path selects
 */
function field(label, node, template) {
  const text = template.replace(/\{([\w.]+)\}/g, (_, path) => stringsAt(node, path).join(" "));
  console.log(`  ${label.padEnd(11)} ${text}`);
}

/**
 * The precision of a FHIR date, never the date: "year", "month", "day", or "absent".
 *
 * @param {string | undefined} date
 */
function precision(date) {
  if (date === undefined) return "absent";
  return ["year", "month", "day"][date.split("-").length - 1] ?? "time";
}

const wire = syntheticAdmit(SEED);
const { bundle, issues } = convertToFhir(wire);

// Nothing below prints a value that identifies a person, synthetic or not: an example that logs a
// patient's name teaches a pipeline to log one. It prints segment names, types, codes and counts.
const segmentNames = wire.split("\r").filter(Boolean).map((segment) => segment.slice(0, 3));
console.log(`Synthetic ADT^A01 from @cosyte/synth (seed ${SEED}), segments ${segmentNames.join(" ")}`);

// A message Bundle: the MessageHeader first, then the resources the message describes.
const entries = bundleEntries(bundle);
const type = stringsAt(bundle, "type")[0];
console.log(`\nFHIR R4 Bundle from @cosyte/transform (type ${type}, ${entries.length} entries):`);
for (const entry of entries) console.log(`  ${entry.type.padEnd(14)} ${entry.fullUrl}`);

const patient = entries.find((entry) => entry.type === "Patient");
if (patient) {
  // To see what a field holds, read it into a variable or assert on it. The values in these comments
  // are synthetic, from @cosyte/synth.
  const family = stringsAt(patient.resource, "name.family")[0]; // "Quillfeather", synthetic
  const mrn = stringsAt(patient.resource, "identifier.value")[0]; // "26068087", synthetic
  const birthDate = stringsAt(patient.resource, "birthDate")[0]; // "1961-08-09", synthetic
  const counts = ["name", "identifier", "telecom", "address"].map(
    (element) => `${element} ${nodesAt(patient.resource, element).length}`,
  );
  console.log("\nPatient (from PID):");
  console.log(`  ${"elements".padEnd(11)} ${counts.join(", ")}`);
  console.log(`  ${"family".padEnd(11)} ${family === undefined ? "absent" : "present"}`);
  console.log(`  ${"MRN".padEnd(11)} ${mrn === undefined ? "absent" : `${mrn.length} characters`}`);
  for (const id of nodesAt(patient.resource, "identifier")) {
    field("identifier", id, "type {type.coding.code}, system {system}");
  }
  console.log(`  ${"birthDate".padEnd(11)} precision ${precision(birthDate)}`);
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
