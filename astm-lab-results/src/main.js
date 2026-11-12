// @ts-check
import { frameText, headerFields, messageKind, readUpload, resultRows, syntheticUpload } from "./results.js";

const SEED = 1033;
const RESULT_COUNT = 4;

/** @param {string} label @param {string} value */
const line = (label, value) => console.log(`  ${label.padEnd(14)}${value}`);

/**
 * Print rows of cells as aligned columns.
 *
 * @param {string[][]} rows
 */
function printTable(rows) {
  const widths = rows[0].map((_, column) => Math.max(...rows.map((cells) => cells[column].length)));
  for (const cells of rows) {
    console.log(`  ${cells.map((cell, column) => cell.padEnd(widths[column])).join("  ").trimEnd()}`);
  }
}

/**
 * The checksum the frame carried, as two hex digits, and whether it matched the bytes.
 *
 * @param {import("@cosyte/astm").AstmFrame} frame
 */
const checksum = ({ checksum: { declared, valid } }) =>
  `${(declared ?? 0).toString(16).toUpperCase().padStart(2, "0")} ${valid ? "ok" : "bad"}`;

const bytes = syntheticUpload(SEED, RESULT_COUNT);
const { message, frames, frameWarnings, messages } = readUpload(bytes);

// Nothing below prints a value that identifies a patient, synthetic or not: an example that logs a
// patient record teaches a pipeline to log one. A frame prints its record type and length, never its
// text, and a free-text comment prints its length.
/** @param {string} text */
const characters = (text) => `${text.length} characters`;

// The frame layer: one ETX-closed frame per record here, numbered 1 to 7 and then wrapping to 0.
console.log(`Synthetic E1381-framed upload from @cosyte/synth (seed ${SEED}), ${bytes.length} bytes:`);
printTable([
  ["Frame", "End", "Checksum", "Record"],
  ...frames.map((frame) => {
    const text = frameText(frame);
    return [String(frame.frameNumber), frame.terminator ?? "none", checksum(frame), `${text.charAt(0)}, ${characters(text)}`];
  }),
]);
const trusted = frames.filter((frame) => frame.trusted).length;
console.log(`  Frames: ${frames.length}, trusted: ${trusted}, frame warnings: ${frameWarnings.length}`);

// The record layer: one entry per H ... L message in the stream.
for (const m of messages) {
  const { field, repeat, component, escape } = m.header.delimiters;
  const fields = headerFields(m.header);
  const sender = fields.find(({ position }) => position === 5);
  const others = fields.filter(({ position }) => position !== 5);
  const patient = m.patient;

  console.log(`\nMessage ${m.index + 1}: ${messageKind(m)}`);
  line("Delimiters", `field ${field}  repeat ${repeat}  component ${component}  escape ${escape}`);
  line("Sender (H.5)", sender?.text ?? "not sent");
  line("Other fields", others.map(({ position, text }) => `H.${position} ${text}`).join(", ") || "none");
  // The patient's and the specimen's identifiers are read, never printed. The values in these comments
  // are synthetic.
  const practiceId = patient?.practiceAssignedId; // "PRA85979089", synthetic
  const laboratoryId = patient?.laboratoryAssignedId; // "LAB85711132", synthetic
  const ids = [practiceId && "practice ID", laboratoryId && "laboratory ID"].filter(Boolean);
  line("Patient", `${ids.join(" and ") || "no ID"} sent`);
  for (const order of m.orders) {
    const specimenId = order.specimenId; // "ACC45131375", synthetic
    line("Order", `specimen ID ${specimenId ? "sent" : "not sent"}, priority ${order.priority}`);
  }

  const rows = resultRows(message, m.results);
  console.log("");
  printTable([
    ["Test", "Value", "Units", "Reference", "Flag", "Status"],
    ...rows.map((row) => [row.test, row.value, row.units, row.range, row.flag, row.status]),
  ]);
  for (const row of rows) for (const text of row.comments) console.log(`  Comment on ${row.test}: ${characters(text)}`);
  console.log(`  Active final results: ${rows.filter((row) => row.activeFinal).length} of ${rows.length}`);
}

console.log(`\nRecord warnings: ${message.warnings.length}`);
