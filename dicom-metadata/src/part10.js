// @ts-check
import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";

// A small writer for one synthetic DICOM Part 10 file. @cosyte/dicom reads and re-writes Part 10
// (`parseDicom`, `serializeDicom`), but it has no public API for building a new object from scratch,
// so we write the few bytes ourselves. Every value below is invented.

export const EXPLICIT_VR_LITTLE_ENDIAN = "1.2.840.10008.1.2.1";
export const CT_IMAGE_STORAGE = "1.2.840.10008.5.1.4.1.1.2";

// RFC 9562 name-based UUID namespace for URLs. Our names are URLs under the reserved example.org.
const URL_NAMESPACE = Buffer.from("6ba7b8119dad11d180b400c04fd430c8", "hex");

// These VRs have a 12-byte element header: two reserved bytes and a 32-bit length (PS3.5 section 7.1.2).
const LONG_FORM_VRS = new Set(["OB", "OD", "OF", "OL", "OV", "OW", "SQ", "SV", "UC", "UN", "UR", "UT", "UV"]);

/**
 * A UID under the 2.25 root: a UUID written as one decimal integer (PS3.5 section B.2). The UUID is
 * name-based (version 5), so the same name gives the same UID on every run and every machine.
 *
 * @param {string} name
 * @returns {string}
 */
export function uidFromName(name) {
  const url = `https://example.org/synthetic-dicom/${name}`;
  const uuid = createHash("sha1").update(URL_NAMESPACE).update(url).digest();
  uuid[6] = (uuid[6] & 0x0f) | 0x50; // version 5
  uuid[8] = (uuid[8] & 0x3f) | 0x80; // RFC 9562 variant
  return `2.25.${BigInt(`0x${uuid.subarray(0, 16).toString("hex")}`)}`;
}

/**
 * One data element in Explicit VR Little Endian: tag, VR, length, then the value padded to even length.
 *
 * @param {string} tag 8 hex digits, group then element, for example "00100010"
 * @param {string} vr
 * @param {string | number | Buffer} value
 * @returns {Buffer}
 */
function element(tag, vr, value) {
  let bytes;
  if (vr === "UL") {
    bytes = Buffer.alloc(4);
    bytes.writeUInt32LE(Number(value));
  } else if (Buffer.isBuffer(value)) {
    bytes = value;
  } else {
    // Text values are padded to an even length: a UID with a NUL byte, any other text with a space.
    const text = String(value);
    bytes = Buffer.from(text.length % 2 === 0 ? text : text + (vr === "UI" ? "\0" : " "), "latin1");
  }
  const header = Buffer.alloc(LONG_FORM_VRS.has(vr) ? 12 : 8);
  header.writeUInt16LE(parseInt(tag.slice(0, 4), 16), 0);
  header.writeUInt16LE(parseInt(tag.slice(4), 16), 2);
  header.write(vr, 4, "latin1");
  if (header.length === 12) header.writeUInt32LE(bytes.length, 8);
  else header.writeUInt16LE(bytes.length, 6);
  return Buffer.concat([header, bytes]);
}

/**
 * Build a synthetic CT header as a DICOM Part 10 file: a 128-byte preamble, "DICM", the File Meta group,
 * then the data set, every group in ascending tag order. It carries patient, study, series and instance
 * attributes and no Pixel Data.
 *
 * @returns {Buffer}
 */
export function syntheticCtHeader() {
  const sopInstanceUid = uidFromName("instance-1");
  const fileMeta = Buffer.concat([
    element("00020001", "OB", Buffer.from([0x00, 0x01])), // File Meta Information Version
    element("00020002", "UI", CT_IMAGE_STORAGE), // Media Storage SOP Class UID
    element("00020003", "UI", sopInstanceUid), // Media Storage SOP Instance UID
    element("00020010", "UI", EXPLICIT_VR_LITTLE_ENDIAN), // Transfer Syntax UID
    element("00020012", "UI", uidFromName("implementation")), // Implementation Class UID
  ]);
  const dataSet = [
    element("00080016", "UI", CT_IMAGE_STORAGE), // SOP Class UID
    element("00080018", "UI", sopInstanceUid), // SOP Instance UID
    element("00080020", "DA", "20200102"), // Study Date
    element("00080030", "TM", "093000"), // Study Time
    element("00080050", "SH", "ZZACC0001"), // Accession Number
    element("00080060", "CS", "CT"), // Modality
    element("00080080", "LO", "ZZTEST SYNTHETIC IMAGING"), // Institution Name
    element("00080090", "PN", "ZZDOCTOR^EXAMPLE"), // Referring Physician's Name
    element("00081030", "LO", "SYNTHETIC CT HEAD"), // Study Description
    element("0008103E", "LO", "SYNTHETIC AXIAL"), // Series Description
    element("00100010", "PN", "ZZTEST^SYNTHETIC"), // Patient's Name
    element("00100020", "LO", "ZZTEST-0001"), // Patient ID
    element("00100021", "LO", "EXAMPLE.ORG"), // Issuer of Patient ID
    element("00100030", "DA", "19700101"), // Patient's Birth Date
    element("00100040", "CS", "O"), // Patient's Sex
    element("0020000D", "UI", uidFromName("study-1")), // Study Instance UID
    element("0020000E", "UI", uidFromName("series-1")), // Series Instance UID
    element("00200010", "SH", "ZZSTUDY1"), // Study ID
    element("00200011", "IS", "1"), // Series Number
    element("00200013", "IS", "1"), // Instance Number
  ];
  return Buffer.concat([
    Buffer.alloc(128), // preamble
    Buffer.from("DICM", "latin1"),
    element("00020000", "UL", fileMeta.length), // File Meta Information Group Length
    fileMeta,
    ...dataSet,
  ]);
}
