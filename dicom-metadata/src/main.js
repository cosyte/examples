// @ts-check
import { Dictionary, parseDicom } from "@cosyte/dicom";
import { deidentifyHeader, displayValue, identifyingValues, readMetadata } from "./dicom.js";
import { syntheticCtHeader } from "./part10.js";

// parseDicom takes the bytes of a Part 10 file: here a synthetic one we build in memory, in your
// integration a file you received.
const part10 = syntheticCtHeader();
const input = parseDicom(part10);

const metadata = readMetadata(input);
console.log(`Synthetic CT header (${part10.length} bytes of DICOM Part 10, built in memory):`);
/** @type {[string, string | undefined][]} */
const rows = [
  ["Transfer syntax", metadata.transferSyntax],
  ["SOP class", metadata.sopClass],
  ["SOP instance UID", metadata.sopInstanceUid],
  ["Patient name", metadata.patientName],
  ["Patient ID", metadata.patientId],
  ["Birth date", metadata.birthDate],
  ["Sex", metadata.sex],
  ["Study instance UID", metadata.studyInstanceUid],
  ["Study date", metadata.studyDate],
  ["Accession number", metadata.accessionNumber],
  ["Modality", metadata.modality],
  ["Series instance UID", metadata.seriesInstanceUid],
  ["Parse warnings", input.warnings.map((w) => w.code).join(", ") || "none"],
];
for (const [label, value] of rows) console.log(`  ${label.padEnd(20)} ${value ?? "(absent)"}`);

// One shared UID map per study keeps the remapped Study, Series and SOP Instance UIDs consistent.
const uidMap = new Map();
const { bytes, output, manifest, warnings, burnedInAnnotationHazard } = deidentifyHeader(input, uidMap);

console.log(`\nDe-identified header (${bytes.length} bytes, read back from the written file):`);
const header = output.elements().map((element) => ({
  tag: `(${element.tag.slice(0, 4)},${element.tag.slice(4)})`,
  keyword: Dictionary.lookup(element.tag)?.keyword ?? "",
  value: displayValue(element),
}));
const keywordWidth = Math.max(...header.map((row) => row.keyword.length));
for (const { tag, keyword, value } of header) {
  console.log(`  ${tag} ${keyword.padEnd(keywordWidth)}  ${value}`);
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
