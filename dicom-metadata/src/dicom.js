// @ts-check
import { deidentifyDicom } from "@cosyte/deid/dicom";
import { Dictionary, parseDicom, serializeDicom } from "@cosyte/dicom";

/** @typedef {import("@cosyte/dicom").Dataset} Dataset */
/** @typedef {import("@cosyte/dicom").Element} Element */

/**
 * A UID with the name the DICOM registry gives it, for example "CT Image Storage".
 *
 * @param {string | undefined} uid
 */
function withName(uid) {
  if (uid === undefined) return undefined;
  const name = Dictionary.uid(uid)?.name;
  return name === undefined ? uid : `${uid} (${name})`;
}

/**
 * A DA value as YYYY-MM-DD when it is a valid date, otherwise as written.
 *
 * @param {import("@cosyte/dicom").DicomDate | undefined} date
 */
function isoDate(date) {
  if (date?.valid !== true) return date?.raw;
  return `${date.year}-${String(date.month).padStart(2, "0")}-${String(date.day).padStart(2, "0")}`;
}

/**
 * A person name in its DICOM form, family^given^middle, with empty trailing parts dropped.
 *
 * @param {import("@cosyte/dicom").PersonName | undefined} name
 */
function personName(name) {
  const n = name?.alphabetic;
  return n && [n.familyName, n.givenName, n.middleName].join("^").replace(/\^+$/, "");
}

/**
 * The metadata a routing or indexing job reads, through @cosyte/dicom's typed views. A missing value
 * stays undefined: the views never substitute a default.
 *
 * @param {Dataset} dataset
 */
export function readMetadata(dataset) {
  const { fileMeta, patient, study, series, image } = dataset;
  const sopClass = dataset.get("00080016")?.value;
  return {
    transferSyntax: withName(fileMeta?.transferSyntaxUID),
    sopClass: withName(sopClass?.kind === "strings" ? sopClass.values[0] : undefined),
    sopInstanceUid: image.sopInstanceUid,
    patientName: personName(patient.name),
    patientId: patient.issuerOfId ? `${patient.id} (issuer ${patient.issuerOfId})` : patient.id,
    birthDate: isoDate(patient.birthDate),
    sex: patient.sex,
    studyInstanceUid: study.instanceUid,
    studyDate: isoDate(study.date),
    accessionNumber: study.accessionNumber,
    modality: series.modality,
    seriesInstanceUid: series.instanceUid,
  };
}

/**
 * An element's value as text, decoded by its VR. Dates and times print as written.
 *
 * @param {Element} element
 * @returns {string}
 */
export function displayValue(element) {
  const value = element.value;
  if (value.kind === "empty") return "(empty)";
  if (value.kind === "text") return value.value;
  if (value.kind === "binary") return `(${value.bytes.length} bytes)`;
  if (value.kind === "sequence") {
    const count = value.items.length;
    return `(sequence, ${count} item${count === 1 ? "" : "s"})`;
  }
  if (value.kind === "personName") return value.values.map(personName).join("\\");
  /** @type {readonly unknown[]} */
  const values = value.values;
  return values.map((v) => (typeof v === "object" && v !== null && "raw" in v ? v.raw : String(v))).join("\\");
}

/**
 * An element's value exactly as written in the file, without its padding, or "" when it is absent.
 *
 * @param {Element | undefined} element
 */
function writtenText(element) {
  return element === undefined ? "" : element.rawBytes.toString("latin1").replace(/[\0 ]+$/, "");
}

/**
 * The identifying values in a header, read from the parsed file exactly as they are written in it. The
 * check after de-identification searches the output bytes and the manifest for each of them.
 *
 * @param {Dataset} dataset
 * @returns {string[]}
 */
export function identifyingValues(dataset) {
  const tags = [
    "00080018", // SOP Instance UID
    "00080020", // Study Date
    "00080050", // Accession Number
    "00080080", // Institution Name
    "00080090", // Referring Physician's Name
    "00100010", // Patient's Name
    "00100020", // Patient ID
    "00100021", // Issuer of Patient ID
    "00100030", // Patient's Birth Date
    "0020000D", // Study Instance UID
    "0020000E", // Series Instance UID
    "00200010", // Study ID
  ];
  return tags.map((tag) => writtenText(dataset.get(tag))).filter((value) => value !== "");
}

/**
 * De-identify a parsed header with @cosyte/deid's DICOM adapter, which applies @cosyte/dicom's PS3.15
 * Annex E Basic Profile. We write the result to Part 10 bytes and parse those bytes again, so what we
 * print and check is what a recipient would read. The input dataset is never changed.
 *
 * Pass the same `uidMap` for every file of a study to keep the remapped UIDs consistent across them.
 *
 * @param {Dataset} input
 * @param {Map<string, string>} [uidMap]
 */
export function deidentifyHeader(input, uidMap = new Map()) {
  const { dataset, manifest, warnings, burnedInAnnotationHazard } = deidentifyDicom(input, { uidMap });
  const bytes = serializeDicom(dataset);
  return { bytes, output: parseDicom(bytes), manifest, warnings, burnedInAnnotationHazard };
}
