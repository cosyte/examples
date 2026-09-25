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

// The frame layer: one ETX-closed frame per record here, numbered 1 to 7 and then wrapping to 0.
console.log(`Synthetic E1381-framed upload from @cosyte/synth (seed ${SEED}), ${bytes.length} bytes:`);
printTable([
  ["Frame", "End", "Checksum", "Record"],
  ...frames.map((frame) => [String(frame.frameNumber), frame.terminator ?? "none", checksum(frame), frameText(frame)]),
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
  line("Patient", `practice ID ${patient?.practiceAssignedId}, laboratory ID ${patient?.laboratoryAssignedId}`);
  for (const order of m.orders) line("Order", `specimen ${order.specimenId}, priority ${order.priority}`);

  const rows = resultRows(message, m.results);
  console.log("");
  printTable([
    ["Test", "Value", "Units", "Reference", "Flag", "Status"],
    ...rows.map((row) => [row.test, row.value, row.units, row.range, row.flag, row.status]),
  ]);
  for (const row of rows) for (const text of row.comments) console.log(`  Comment on ${row.test}: ${text}`);
  console.log(`  Active final results: ${rows.filter((row) => row.activeFinal).length} of ${rows.length}`);
}

console.log(`\nRecord warnings: ${message.warnings.length}`);
