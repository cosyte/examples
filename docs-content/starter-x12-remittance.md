---
id: starter-x12-remittance
title: Summarize an X12 835 remittance and check its balance
sidebar_label: x12-remittance
description: "An 835 read into the payment, each claim's status, amounts and adjustment reasons, and its three balance equations recomputed in exact decimals."
---

# Summarize an X12 835 remittance and check its balance

The `x12-remittance` starter summarizes a synthetic X12 835 remittance: the payment and its trace
number, the payer and payee, each claim with its status, amounts and adjustments, and a check that
recomputes the 835's three balance equations with exact decimal arithmetic. It prints no value that
identifies the patient: a claim is named by its position, and the 835 shows only its segment IDs.

Libraries: [`@cosyte/x12`](https://docs.cosyte.com/x12/),
[`@cosyte/synth`](https://docs.cosyte.com/synth/).

## What it shows

- **The typed 835.** `get835` returns the `BPR` payment, the `TRN` trace, the payer and payee, each
  `CLP` claim with its `CAS` adjustments and `SVC` service lines, and any `PLB` provider-level
  adjustments. Every amount is an `X12Decimal`, never a float, and an amount the sender left out
  reads `undefined`, not zero.
- **Codes with their meaning.** The claim status (`CLP-02`) and each adjustment reason (a CARC) come
  with descriptions from the code snapshots `@cosyte/x12` bundles.
- **The balance check.** `balanceChecks` recomputes the service line, claim and payment equations
  with `X12Decimal` arithmetic. An amount that did not decode makes its equation "not evaluable"
  instead of counting as zero.
- **A check you can keep.** `src/main.js` exits 1 when an equation does not balance: a check to keep
  in front of posting.
- **Reading without printing.** `src/main.js` reads each claim's patient control number and payer
  claim number into variables, with their synthetic values in comments, and prints only that they
  are there.

## Run it

From a clone of [cosyte/examples](https://github.com/cosyte/examples), on Node 22 or later:

```bash
cd examples/x12-remittance
npm ci
npm start
```

The same seed gives the same output on every run.

`npm test` runs the starter and checks the payment, claim status, amounts, adjustments and balance
lines it prints against a fresh reading of the same 835, and that the output holds no patient name,
member ID or claim number and no segment of the 835. It splits the 835 into segments by hand and
checks the typed reading against the raw `BPR`, `TRN`, `CLP` and `CAS` segments. Raising `BPR-02` by
1.00 must report the payment out of balance, and adding a 10.00 provider-level take-back with
`BPR-02` lowered to match must still balance.

## Before you build on it

- On the 0.1 line of `@cosyte/synth`, the 835 carries one claim with one service line and no
  provider-level adjustment. The test adds a `PLB` to exercise that term.
- The synthetic 835 is built to exercise the reader, not to pass a trading partner's edits.
- The balance check says whether the 835 adds up. It does not check the amounts against your
  contract or the claim you sent.
- The output shows the 835's segment IDs, not its segments, and no patient name, member ID or claim
  number, synthetic as they are. A production service should not write PHI to its logs either.

## Expected output

What `npm start` prints, as the starter's README gives it. This section and the next are generated from the starter by `scripts/docs-content.mjs`, and CI fails when they no longer match it.

```text
Synthetic 835 from @cosyte/synth (seed 42), segments:
  ISA GS ST BPR TRN N1 N3 N4 REF N1 N3 N4 LX CLP NM1 NM1 DTM DTM SVC DTM CAS AMT SE GE IEA

Payment (BPR, TRN):
  amount                 1733.00 (credit)
  method                 ACH
  date                   2024-03-21
  trace                  6727115, originator 1563348988

Payer: PLACEHOLDER BENEFIT ADMIN (REF 2U SYN99074)
Payee: MOCK CARE ASSOCIATES (XX 5462419363)

Claim 1 (patient control number and payer claim number present)
  status                 1 Processed as Primary
  charged                1803.00
  paid                   1733.00
  patient responsibility 70.00
  claim adjustments      none
  line 1                 HC:99214:25, charged 1803.00, paid 1733.00
    adjustment           PR 1 70.00: Patient Responsibility, Deductible Amount

Provider-level adjustments (PLB): none

Balance (exact decimal arithmetic):
  balanced        claim 1 line 1: 1803.00 charged = 1733.00 paid + 70.00 adjusted
  balanced        claim 1: 1803.00 charged = 1733.00 paid + 70.00 adjusted
  balanced        payment: 1733.00 paid = 1733.00 paid on claims - 0.00 provider adjustments

Warnings (parse and 835 reader): 0
```

## Files

The starter's code, every file of `x12-remittance/` as this release holds it, except its README, its lockfile and its tests, which are in the repository: [x12-remittance on GitHub](https://github.com/cosyte/examples/tree/main/x12-remittance).

### package.json

```json title="x12-remittance/package.json"
{
  "name": "cosyte-example-x12-remittance",
  "version": "0.0.0",
  "private": true,
  "description": "Summarize a synthetic X12 835 remittance with @cosyte/x12: the payment, each claim, its adjustments, and the balance.",
  "license": "MIT",
  "type": "module",
  "engines": {
    "node": ">=22"
  },
  "scripts": {
    "start": "node src/main.js",
    "test": "node --test test/*.test.js test/integration/*.fast.test.js",
    "test:full": "node --test --experimental-test-coverage --test-coverage-include=test/integration/support.js --test-coverage-exclude=node_modules/** --test-coverage-lines=100 --test-coverage-branches=100 --test-coverage-functions=100 test/*.test.js test/integration/*.test.js"
  },
  "dependencies": {
    "@cosyte/synth": "^0.1.0",
    "@cosyte/x12": "^0.1.0"
  },
  "devDependencies": {
    "@cosyte/deid": "^0.1.0"
  }
}
```

### src/main.js

```js title="x12-remittance/src/main.js"
// @ts-check
import { toISO } from "@cosyte/x12";
import { balanceChecks, describeClaim, readRemittance, syntheticRemittance } from "./remittance.js";

const SEED = 42;

const wire = syntheticRemittance(SEED);
const { interchange, remittance } = readRemittance(wire);
const terminator = interchange.delimiters.segment;

// Nothing below prints a value that identifies a patient, synthetic or not: an example that logs a
// patient's account number teaches a pipeline to log one. It prints segment IDs, codes, amounts and
// counts, and names the payer and the payee, which are organizations.
const segmentIds = wire
  .split(terminator)
  .filter((segment) => segment.trim() !== "")
  .map((segment) => segment.trim().split("*")[0]);
console.log(`Synthetic 835 from @cosyte/synth (seed ${SEED}), segments:`);
console.log(`  ${segmentIds.join(" ")}`);

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

remittance.claims.map(describeClaim).forEach((claim, claimIndex) => {
  // The claim's identifiers are read, never printed. The values in these comments are synthetic.
  const patientControlNumber = claim.patientControlNumber; // "PTACCT032098", synthetic
  const payerClaimNumber = claim.payerClaimControlNumber; // "ICN461420202", synthetic
  const numbers = [patientControlNumber && "patient control number", payerClaimNumber && "payer claim number"];
  console.log(`\nClaim ${claimIndex + 1} (${numbers.filter(Boolean).join(" and ") || "no numbers"} present)`);
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
});

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
```

### src/remittance.js

```js title="x12-remittance/src/remittance.js"
// @ts-check
import { generate835 } from "@cosyte/synth/x12";
import { get835, parseX12, serializeX12, X12Decimal } from "@cosyte/x12";

/**
 * Who carries an adjustment, by its CAS-01 group code. These are the four values of ASC X12 data
 * element 1033, named as @cosyte/x12 names them in its `CLAIM_ADJUSTMENT_GROUP_CODES` documentation;
 * the package exports the codes but no labels.
 *
 * @type {Readonly<Record<string, string>>}
 */
export const GROUP_CODES = Object.freeze({
  CO: "Contractual Obligation",
  PR: "Patient Responsibility",
  OA: "Other Adjustment",
  PI: "Payer Initiated Reductions",
});

/**
 * The name of a group code, or undefined. `Object.hasOwn` keeps a code such as "constructor" from
 * resolving through the object prototype.
 *
 * @param {string} code
 * @returns {string | undefined}
 */
export function groupName(code) {
  return Object.hasOwn(GROUP_CODES, code) ? GROUP_CODES[code] : undefined;
}

/**
 * Build a synthetic 835 remittance. The same seed gives the same bytes on every machine, and every
 * name, identifier and amount comes from @cosyte/synth's synthetic pools.
 *
 * @param {number} seed
 * @returns {string} the X12 wire text, segments ended by the terminator declared in the ISA
 */
export function syntheticRemittance(seed) {
  return serializeX12(generate835({ seed }));
}

/**
 * Parse an interchange and read its 835 through the typed reader.
 *
 * @param {string} wire
 */
export function readRemittance(wire) {
  const interchange = parseX12(wire);
  const transaction = interchange.groups
    .flatMap((group) => group.transactions)
    .find((tx) => tx.st.elements[1] === "835");
  if (transaction === undefined) throw new Error("the interchange carries no 835 transaction set");
  const remittance = get835(interchange.delimiters, transaction);
  if (remittance === undefined) throw new Error("get835 did not read the transaction set");
  return { interchange, remittance };
}

/**
 * One CAS adjustment: the group says who carries it, the reason (a CARC) says why. The reason
 * description comes from the CARC snapshot @cosyte/x12 bundles.
 *
 * @param {import("@cosyte/x12").X12RemitAdjustment} adjustment
 */
export function describeAdjustment(adjustment) {
  return {
    group: adjustment.groupCode,
    groupName: groupName(adjustment.groupCode),
    reason: adjustment.reasonCode,
    reasonDescription: adjustment.reasonDescription,
    amount: adjustment.amount?.toString(),
  };
}

/**
 * One claim (CLP loop) with its service lines. Amounts stay exactly as sent (`X12Decimal.toString()`).
 *
 * @param {import("@cosyte/x12").X12RemitClaim} claim
 */
export function describeClaim(claim) {
  return {
    patientControlNumber: claim.patientControlNumber,
    payerClaimControlNumber: claim.payerClaimControlNumber,
    status: claim.claimStatusCode,
    statusDescription: claim.claimStatusDescription,
    charged: claim.totalChargeAmount?.toString(),
    paid: claim.totalPaymentAmount?.toString(),
    patientResponsibility: claim.patientResponsibilityAmount?.toString(),
    adjustments: claim.adjustments.map(describeAdjustment),
    lines: claim.serviceLines.map((line) => ({
      procedure: [line.productServiceIdQualifier, line.productServiceId, ...line.modifiers].join(":"),
      charged: line.chargeAmount?.toString(),
      paid: line.paymentAmount?.toString(),
      adjustments: line.adjustments.map(describeAdjustment),
    })),
  };
}

/**
 * Add amounts exactly. The result is undefined when any term was not decoded: an amount the sender
 * left out is not a zero, so there is no sum to report.
 *
 * @param {ReadonlyArray<X12Decimal | undefined>} amounts
 * @returns {X12Decimal | undefined}
 */
export function sum(amounts) {
  let total = X12Decimal.fromBigInt(0n, 2);
  for (const amount of amounts) {
    if (amount === undefined) return undefined;
    total = total.add(amount);
  }
  return total;
}

/**
 * @param {X12Decimal | undefined} stated
 * @param {X12Decimal | undefined} computed
 */
function verdict(stated, computed) {
  if (stated === undefined || computed === undefined) return "not evaluable";
  return stated.equals(computed) ? "balanced" : "out of balance";
}

/** @param {X12Decimal | undefined} amount */
const shown = (amount) => amount?.toString() ?? "(not decoded)";

/**
 * The three balance equations of an 835, recomputed from the parsed amounts with exact decimal
 * arithmetic. They are the equations @cosyte/x12's `BALANCE_INVARIANTS` names, which `get835` also
 * runs, reporting any failure on its warnings:
 *
 * - service line: SVC-02 charge = SVC-03 payment + the line's CAS adjustments
 * - claim: CLP-03 charge = CLP-04 payment + every CAS adjustment on the claim and its lines
 * - payment: BPR-02 = the sum of CLP-04 - the sum of PLB provider-level adjustments
 *
 * @param {import("@cosyte/x12").X12Remittance} remittance
 */
export function balanceChecks(remittance) {
  /**
   * @param {X12Decimal | undefined} charged
   * @param {X12Decimal | undefined} paid
   * @param {X12Decimal | undefined} adjusted
   */
  const chargeEquation = (charged, paid, adjusted) => ({
    equation: `${shown(charged)} charged = ${shown(paid)} paid + ${shown(adjusted)} adjusted`,
    result: verdict(charged, adjusted && paid?.add(adjusted)),
  });

  // A check names its claim by position: the patient control number (CLP-01) identifies a patient,
  // and a check's name is printed.
  const checks = [];
  remittance.claims.forEach((claim, claimIndex) => {
    claim.serviceLines.forEach((line, index) => {
      const adjusted = sum(line.adjustments.map((adjustment) => adjustment.amount));
      checks.push({
        name: `claim ${claimIndex + 1} line ${index + 1}`,
        ...chargeEquation(line.chargeAmount, line.paymentAmount, adjusted),
      });
    });
    const everyAdjustment = [...claim.adjustments, ...claim.serviceLines.flatMap((line) => line.adjustments)];
    const adjusted = sum(everyAdjustment.map((adjustment) => adjustment.amount));
    checks.push({
      name: `claim ${claimIndex + 1}`,
      ...chargeEquation(claim.totalChargeAmount, claim.totalPaymentAmount, adjusted),
    });
  });

  const payment = remittance.payment.totalActualPayment;
  const onClaims = sum(remittance.claims.map((claim) => claim.totalPaymentAmount));
  const provider = sum(remittance.providerAdjustments.map((adjustment) => adjustment.amount));
  checks.push({
    name: "payment",
    equation:
      `${shown(payment)} paid = ${shown(onClaims)} paid on claims` +
      ` - ${shown(provider)} provider adjustments`,
    result: verdict(payment, provider && onClaims?.subtract(provider)),
  });
  return checks;
}
```
