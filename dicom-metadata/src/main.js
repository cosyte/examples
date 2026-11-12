// @ts-check
import { Dictionary, parseDicom } from "@cosyte/dicom";
import { deidentifyHeader, displayValue, identifyingValues, readMetadata } from "./dicom.js";
import { syntheticCtHeader } from "./part10.js";

// parseDicom takes the bytes of a Part 10 file: here a synthetic one we build in memory, in your
// integration a file you received.
const part10 = syntheticCtHeader();
const input = parseDicom(part10);

// Nothing below prints a value that identifies a person, synthetic or not: an example that logs a
// patient's name teaches a pipeline to log one. To see what an attribute holds, read it into a
// variable or assert on it. The values in these comments are synthetic.
const metadata = readMetadata(input);
const patientName = metadata.patientName; // "ZZTEST^SYNTHETIC", synthetic
const patientId = metadata.patientId; // "ZZTEST-0001 (issuer EXAMPLE.ORG)", synthetic
const birthDate = metadata.birthDate; // "1970-01-01", synthetic
const accessionNumber = metadata.accessionNumber; // "ZZACC0001", synthetic

/** @param {string | undefined} value Whether an attribute holds a value: never the value itself. */
const present = (value) => (value === undefined || value === "" ? "absent" : "present");

console.log(`Synthetic CT header (${part10.length} bytes of DICOM Part 10, built in memory):`);
/** @type {[string, string | undefined][]} */
const rows = [
  ["Transfer syntax", metadata.transferSyntax],
  ["SOP class", metadata.sopClass],
  ["Modality", metadata.modality],
  ["Parse warnings", input.warnings.map((w) => w.code).join(", ") || "none"],
  ["Patient name", present(patientName)],
  ["Patient ID", present(patientId)],
  ["Birth date", present(birthDate)],
  ["Study date", present(metadata.studyDate)],
  ["Accession number", present(accessionNumber)],
  ["Study instance UID", present(metadata.studyInstanceUid)],
  ["Series instance UID", present(metadata.seriesInstanceUid)],
  ["SOP instance UID", present(metadata.sopInstanceUid)],
];
for (const [label, value] of rows) console.log(`  ${label.padEnd(20)} ${value ?? "(absent)"}`);

// One shared UID map per study keeps the remapped Study, Series and SOP Instance UIDs consistent.
const uidMap = new Map();
const { bytes, output, manifest, warnings, burnedInAnnotationHazard } = deidentifyHeader(input, uidMap);

// The de-identified header prints a value only for the coded attributes below, which name a kind of
// object or what the pass did. Every other attribute prints its shape: empty, a sequence, or a length.
const CODED = new Set(["SOPClassUID", "Modality", "PatientIdentityRemoved", "LongitudinalTemporalInformationModified"]);
console.log(`\nDe-identified header (${bytes.length} bytes, read back from the written file):`);
const header = output.elements().map((element) => {
  const keyword = Dictionary.lookup(element.tag)?.keyword ?? "";
  const text = displayValue(element);
  const kind = element.value.kind;
  const length = `(${text.length} character${text.length === 1 ? "" : "s"})`;
  const shape = kind === "empty" || kind === "sequence" ? text : length;
  const tag = `(${element.tag.slice(0, 4)},${element.tag.slice(4)})`;
  return { tag, keyword, shown: CODED.has(keyword) ? text : shape };
});
const keywordWidth = Math.max(...header.map((row) => row.keyword.length));
for (const { tag, keyword, shown } of header) {
  console.log(`  ${tag} ${keyword.padEnd(keywordWidth)}  ${shown}`);
}

console.log("\nManifest (value-free: locus, category, transform, disposition, code):");
const width = Math.max(...manifest.map((entry) => entry.locus.length));
for (const { locus, category, transform, disposition, code } of manifest) {
  const cells = [category.padEnd(15), transform.padEnd(12), disposition.padEnd(11), code];
  console.log(`  ${locus.padEnd(width)} ${cells.join(" ")}`);
}

const warningCodes = warnings.map((w) => w.code).join(", ") || "none";
console.log(`\nWarnings from the de-identification pass: ${warningCodes}`);
const hazard = burnedInAnnotationHazard ? "yes, do not release before a pixel review" : "no";
console.log(`Burned-in annotation hazard: ${hazard}`);
console.log(`UIDs remapped: ${uidMap.size} (the map links output to source: keep it private)`);

// A check you can keep in your own pipeline: no identifying value from the input survives in the
// written file, and the manifest names attributes and actions but never a value.
const outputText = bytes.toString("latin1");
const manifestText = JSON.stringify(manifest);
const identifiers = identifyingValues(input);
const leaked = identifiers.filter((value) => outputText.includes(value));
const inManifest = identifiers.filter((value) => manifestText.includes(value));

console.log(`\nInput identifiers checked: ${identifiers.length}`);
console.log(`Found in the de-identified file: ${leaked.length}`);
console.log(`Found in the manifest: ${inManifest.length}`);

if (leaked.length > 0 || inManifest.length > 0) process.exitCode = 1;
