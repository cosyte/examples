// @ts-check
import { toISO } from "@cosyte/x12";
import { balanceChecks, describeClaim, readRemittance, syntheticRemittance } from "./remittance.js";

const SEED = 42;

const wire = syntheticRemittance(SEED);
const { interchange, remittance } = readRemittance(wire);
const terminator = interchange.delimiters.segment;

console.log(`Synthetic 835 from @cosyte/synth (seed ${SEED}):`);
for (const segment of wire.split(terminator).filter(Boolean)) console.log(`  ${segment}${terminator}`);

/**
 * A `CCYYMMDD` date (BPR-16, PLB-02) as `YYYY-MM-DD`. Those elements always carry the `D8` shape, so
 * `toISO` reads them; a value that is not a calendar date prints as sent.
 *
 * @param {string} value
 */
function day(value) {
  return toISO({ formatQualifier: "D8", value }) ?? value;
}

/** @param {import("@cosyte/x12").X12RemitParty | undefined} party */
function partyLine(party) {
  if (party === undefined) return "not stated";
  const ids = party.idQualifier ? [`${party.idQualifier} ${party.idCode}`] : [];
  for (const ref of party.additionalIdentifiers) ids.push(`REF ${ref.qualifier} ${ref.value}`);
  return ids.length > 0 ? `${party.name} (${ids.join(", ")})` : party.name;
}

/** An amount as sent, or a marker when the reader decoded none. @param {string | undefined} amount */
const shown = (amount) => amount ?? "(not decoded)";

/** @param {ReturnType<typeof describeClaim>["adjustments"][number]} adjustment */
function adjustmentLine(adjustment) {
  const who = adjustment.groupName ?? "(unknown group)";
  const why = adjustment.reasonDescription ?? "(no bundled description)";
  return `${adjustment.group} ${adjustment.reason} ${shown(adjustment.amount)}: ${who}, ${why}`;
}

/**
 * Print name/value rows with every value in one column, skipping rows with no value.
 *
 * @param {string} indent
 * @param {Array<[string, string | undefined]>} rows
 */
function printRows(indent, rows) {
  for (const [name, value] of rows) {
    if (value) console.log(`${indent}${name.padEnd(24 - indent.length)} ${value}`);
  }
}

const { payment } = remittance;
const amount = shown(payment.totalActualPayment?.toString());
const flag = payment.creditDebitFlag;
const direction = flag === "C" ? "credit" : flag === "D" ? "debit" : flag;
/** @type {Array<[string, string | undefined]>} */
const paymentRows = [
  ["amount", `${amount} (${direction})`],
  ["method", [payment.method, payment.paymentFormatCode].filter(Boolean).join(" ")],
  ["date", day(payment.paymentDate)],
];
for (const trace of remittance.traces) {
  const originator = trace.originatingCompanyId ? `, originator ${trace.originatingCompanyId}` : "";
  paymentRows.push(["trace", `${trace.referenceId}${originator}`]);
}
console.log("\nPayment (BPR, TRN):");
printRows("  ", paymentRows);
console.log(`\nPayer: ${partyLine(remittance.payer)}`);
console.log(`Payee: ${partyLine(remittance.payee)}`);

for (const claim of remittance.claims.map(describeClaim)) {
  console.log(`\nClaim ${claim.patientControlNumber} (payer claim number ${claim.payerClaimControlNumber})`);
  printRows("  ", [
    ["status", `${claim.status} ${claim.statusDescription ?? "(no bundled description)"}`],
    ["charged", shown(claim.charged)],
    ["paid", shown(claim.paid)],
    ["patient responsibility", shown(claim.patientResponsibility)],
    ["claim adjustments", claim.adjustments.length === 0 ? "none" : undefined],
  ]);
  for (const adjustment of claim.adjustments) {
    printRows("  ", [["claim adjustment", adjustmentLine(adjustment)]]);
  }
  claim.lines.forEach((line, index) => {
    const amounts = `charged ${shown(line.charged)}, paid ${shown(line.paid)}`;
    printRows("  ", [[`line ${index + 1}`, `${line.procedure}, ${amounts}`]]);
    for (const adjustment of line.adjustments) {
      printRows("    ", [["adjustment", adjustmentLine(adjustment)]]);
    }
  });
}

const plbs = remittance.providerAdjustments;
console.log(`\nProvider-level adjustments (PLB): ${plbs.length === 0 ? "none" : plbs.length}`);
for (const plb of plbs) {
  const reason = [plb.reasonCode, plb.subCode].filter(Boolean).join(":");
  const period = day(plb.fiscalPeriodDate);
  console.log(`  ${reason} ${shown(plb.amount?.toString())} (provider ${plb.providerId}, period ${period})`);
}

// Recompute the three balance equations. get835 runs the same ones and reports a failure on its
// warnings. A check to keep in your own posting pipeline: do not post a remit that fails one.
const checks = balanceChecks(remittance);
console.log("\nBalance (exact decimal arithmetic):");
for (const check of checks) console.log(`  ${check.result.padEnd(15)} ${check.name}: ${check.equation}`);

console.log(`\nWarnings (parse and 835 reader): ${interchange.warnings.length + remittance.warnings.length}`);

if (checks.some((check) => check.result !== "balanced")) process.exitCode = 1;
