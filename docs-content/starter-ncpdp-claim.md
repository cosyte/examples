---
id: starter-ncpdp-claim
title: Parse an NCPDP Telecom claim and its paid response
sidebar_label: ncpdp-claim
description: "An NCPDP Telecom B1 claim and a paid response parsed into routing, product, pricing and the payer's answer, with every amount read as text."
---

# Parse an NCPDP Telecom claim and its paid response

The `ncpdp-claim` starter parses a synthetic NCPDP Telecom D.0 billing claim (B1) and a paid
response to it, and prints what a pharmacy biller checks: routing, product, quantity and the amounts
submitted, then the claim's status and the amounts paid. Every amount is read as text, never as a
floating-point number.

Libraries: [`@cosyte/ncpdp`](https://docs.cosyte.com/ncpdp/),
[`@cosyte/synth`](https://docs.cosyte.com/synth/).

## What it shows

- **The claim.** `parseTelecom` reads the fixed 56-byte header and the segments, and
  `claim(transaction)` lifts the fields a biller checks: group, prescription and fill, product and
  its qualifier, quantity and days supply. The Pricing segment is read by field ID with
  `findSegment` and `fieldValue`.
- **Money as text.** An NCPDP amount carries implied decimal places and signs its last character, so
  `456G` is 45.67. `telecomMoney` keeps the wire text in `source` and applies the decimals and the
  sign string-wise into `amount`.
- **The response.** `adjudication(response)` returns the status and pricing views. Its
  `disposition` comes from the status field and the reject codes together, and a reject always wins:
  a response whose status says `P` but carries a reject code reads as rejected.
- **Building a claim.** The starter rebuilds the synthetic claim with a Pricing segment through
  `buildTelecomRequest`, which refuses a field ID that is not two characters or a value that holds a
  separator.

## Run it

From a clone of [cosyte/examples](https://github.com/cosyte/examples), on Node 22 or later:

```bash
cd examples/ncpdp-claim
npm ci
npm start
```

Each amount prints beside its wire form. The response prints with its control characters named:
`<GS>` opens the transaction, `<RS>` each segment, `<FS>` each field.

`npm test` runs the starter and checks the product line, the echoed prescription number, the paid
status, and that neither parse raised a warning. It then checks the claim view against the Claim
segment's own fields, that the paid response echoes the claim and its total paid equals ingredient
cost plus dispensing fee minus patient pay, and that a rejected response reads as rejected with
every reject code in wire order, even when its status field says paid.

## Before you build on it

- On the 0.1 line, `@cosyte/synth` writes Quantity Dispensed as a whole number of units, without the
  three implied decimal places the field carries, so `31` reads as 0.031. We print what the wire
  says rather than correct it.
- `@cosyte/synth` generates Telecom requests only, so the starter writes the payer's response itself
  in `src/claim.js`.
- `@cosyte/ncpdp` reads each group-separated block of a transmission as its own transaction, and the
  views read the first. Check `transaction.warnings` before you trust a view.

## Expected output

What `npm start` prints, as the starter's README gives it. This section and the next are generated from the starter by `scripts/docs-content.mjs`, and CI fails when they no longer match it.

```text
Claim: synthetic B1 from @cosyte/synth (seed 1), Pricing segment added
  Segments                    01 Patient, 04 Insurance, 03 Prescriber, 07 Claim, 11 Pricing
  BIN / PCN / group           999999 / SYN2561 / GRP05182
  Transaction                 B1, version D0
  Date of service             20240218
  Pharmacy                    3212672670 (ID qualifier 01)
  Prescription                RX2929783, fill 4
  Product/service ID          00000070707 (qualifier 03)
  Quantity dispensed          31 on the wire, 0.031 decoded
  Days supply                 60
  Pricing submitted           wire  amount
    Ingredient cost (D9)      456G   45.67
    Dispensing fee (DC)       25{     2.50
    Usual and customary (DQ)  550{   55.00
    Gross amount due (DU)     481G   48.17
  Parse warnings              0

Response: synthetic paid answer written by src/claim.js
  D0B11A013212672670     20240218
  <GS>
  <RS><FS>AM21<FS>ANP<FS>F3SYNTHAUTH01
  <RS><FS>AM22<FS>EM1<FS>D2RX2929783
  <RS><FS>AM23<FS>F5100{<FS>F6405{<FS>F717E<FS>F9322E
  Echoes                      B1, pharmacy 3212672670, prescription RX2929783
  Transmission status         A
  Claim status                P, disposition paid
  Authorization               SYNTHAUTH01
  Reject codes                none
  Pricing paid                wire  amount
    Ingredient cost (F6)      405{   40.50
    Dispensing fee (F7)       17E     1.75
    Total amount paid (F9)    322E   32.25
    Patient pay (F5)          100{   10.00
  Parse warnings              0
```

## Files

The starter's code, every file of `ncpdp-claim/` as this release holds it, except its README, its lockfile and its tests, which are in the repository: [ncpdp-claim on GitHub](https://github.com/cosyte/examples/tree/main/ncpdp-claim).

### package.json

```json title="ncpdp-claim/package.json"
{
  "name": "cosyte-example-ncpdp-claim",
  "version": "0.0.0",
  "private": true,
  "description": "Parse a synthetic NCPDP Telecom D.0 B1 claim and its paid response with @cosyte/ncpdp.",
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
    "@cosyte/ncpdp": "^0.1.0",
    "@cosyte/synth": "^0.1.0"
  },
  "devDependencies": {
    "@cosyte/deid": "^0.1.0"
  }
}
```

### src/claim.js

```js title="ncpdp-claim/src/claim.js"
// @ts-check
import {
  FIELD_SEPARATOR,
  GROUP_SEPARATOR,
  SEGMENT_SEPARATOR,
  buildTelecomRequest,
  claim,
  fieldValue,
  findSegment,
  parseTelecom,
  serializeTelecom,
  telecomMoney,
} from "@cosyte/ncpdp/telecom";
import { generateB1 } from "@cosyte/synth/ncpdp";

/**
 * The Pricing segment (11) this example adds to the claim, with synthetic amounts. An NCPDP amount has
 * two implied decimal places and signs its last character (the overpunch): "456G" is 45.67.
 */
export const PRICING_FIELDS = Object.freeze([
  { id: "D9", label: "Ingredient cost", value: "456G" },
  { id: "DC", label: "Dispensing fee", value: "25{" },
  { id: "DQ", label: "Usual and customary", value: "550{" },
  { id: "DU", label: "Gross amount due", value: "481G" },
]);

/**
 * Response Pricing (23) when the synthetic payer pays: patient pay 10.00 (F5), ingredient cost 40.50
 * (F6), dispensing fee 1.75 (F7), total paid 32.25 (F9), which is 40.50 + 1.75 - 10.00.
 */
const PAID_PRICING = ["F5100{", "F6405{", "F717E", "F9322E"];

/**
 * Build a synthetic B1 billing claim. @cosyte/synth builds it through @cosyte/ncpdp's own request
 * builder, with every identifier drawn from synthetic ranges. Its B1 carries no Pricing segment, so we
 * add one through the same builder, which keeps the claim spec-clean.
 *
 * @param {number} seed
 * @returns {string} the Telecom D.0 wire text
 */
export function syntheticClaim(seed) {
  const wire = generateB1({ seed });
  const b1 = parseTelecom(wire);
  if (findSegment(b1.segments, "11") !== undefined) return wire;

  const segments = b1.segments.map((segment) => ({
    segmentId: segment.segmentId,
    fields: segment.fields.map(({ id, value }) => ({ id, value })),
  }));
  segments.push({ segmentId: "11", fields: PRICING_FIELDS.map(({ id, value }) => ({ id, value })) });
  return serializeTelecom(buildTelecomRequest({ header: b1.header, segments }));
}

/**
 * The submitted amounts in a parsed claim's Pricing segment, each decoded string-wise, never as a float.
 * The library has no view over this segment, so we read its fields by ID.
 *
 * @param {import("@cosyte/ncpdp/telecom").TelecomTransaction} transaction
 */
export function submittedPricing(transaction) {
  const pricing = findSegment(transaction.segments, "11");
  return PRICING_FIELDS.map(({ id, label }) => {
    const source = fieldValue(pricing, id);
    return { id, label, money: source === undefined ? undefined : telecomMoney(source) };
  });
}

/**
 * Write a synthetic payer response to a parsed claim. @cosyte/synth generates requests only and
 * @cosyte/ncpdp builds requests only, so this is hand-written wire text. It echoes the claim's
 * transaction code, pharmacy, date of service and prescription number. With no reject codes it answers
 * paid, with the synthetic amounts above; with reject codes it answers rejected and carries no pricing.
 *
 * @param {import("@cosyte/ncpdp/telecom").TelecomTransaction} request
 * @param {string[]} [rejectCodes]
 * @returns {string} the Telecom D.0 response wire text
 */
export function syntheticResponse(request, rejectCodes = []) {
  const { header } = request;
  const rx = claim(request);
  const paid = rejectCodes.length === 0;

  // The fixed-width response header: version, transaction code, transaction count, header status
  // (A: the transmission was accepted), pharmacy ID qualifier, pharmacy ID (15 wide), date of service.
  const head =
    `D0${header.transactionCode}1A${header.serviceProviderIdQualifier.padEnd(2)}` +
    `${header.serviceProviderId.padEnd(15)}${header.dateOfService}`;

  const status = paid
    ? ["ANP", "F3SYNTHAUTH01"]
    : ["ANR", `FA${rejectCodes.length}`, ...rejectCodes.map((code) => `FB${code}`)];
  const echo = [`EM${rx?.prescriptionReferenceQualifier ?? ""}`, `D2${rx?.prescriptionReferenceNumber ?? ""}`];
  /** @type {[string, string[]][]} */
  const segments = [
    ["21", status], // Response Status
    ["22", echo], // Response Claim
  ];
  if (paid) segments.push(["23", PAID_PRICING]); // Response Pricing

  // A group separator opens the transaction; a segment separator opens each segment, and a field
  // separator each field, the AM segment ID first.
  const body = segments
    .map(([id, fields]) => [`AM${id}`, ...fields].map((field) => FIELD_SEPARATOR + field).join(""))
    .map((segment) => SEGMENT_SEPARATOR + segment);
  return head + GROUP_SEPARATOR + body.join("");
}

/**
 * Show Telecom wire text with its control characters named, a line per group and segment.
 *
 * @param {string} wire
 * @returns {string[]}
 */
export function visibleWire(wire) {
  return wire
    .replaceAll(GROUP_SEPARATOR, "\n<GS>")
    .replaceAll(SEGMENT_SEPARATOR, "\n<RS>")
    .replaceAll(FIELD_SEPARATOR, "<FS>")
    .split("\n");
}
```

### src/main.js

```js title="ncpdp-claim/src/main.js"
// @ts-check
import { adjudication, claim, fieldValue, findSegment, parseTelecom } from "@cosyte/ncpdp/telecom";
import { submittedPricing, syntheticClaim, syntheticResponse, visibleWire } from "./claim.js";

const SEED = 1;

/** @param {string} label @param {string | undefined} value */
const row = (label, value) => console.log(`  ${label.padEnd(28)}${value ?? "absent"}`);

/**
 * An amount beside its wire form, e.g. "456G   45.67".
 *
 * @param {import("@cosyte/ncpdp/telecom").TelecomMoney | undefined} money
 */
const amount = (money) => {
  if (money === undefined) return "absent";
  return `${money.source.padEnd(5)}${money.isValid ? money.amount?.padStart(7) : "  not a valid amount"}`;
};

// The claim: a synthetic B1 from @cosyte/synth, plus the Pricing segment src/claim.js adds.
const request = parseTelecom(syntheticClaim(SEED));
const b1 = claim(request);
const { header } = request;
const quantity = b1?.quantityDispensed;

console.log(`Claim: synthetic B1 from @cosyte/synth (seed ${SEED}), Pricing segment added`);
row("Segments", request.segments.map((s) => `${s.segmentId} ${s.name ?? "?"}`).join(", "));
row("BIN / PCN / group", `${header.binNumber} / ${header.processorControlNumber} / ${b1?.groupId}`);
row("Transaction", `${header.transactionCode}, version ${header.versionRelease}`);
row("Date of service", header.dateOfService);
row("Pharmacy", `${header.serviceProviderId} (ID qualifier ${header.serviceProviderIdQualifier})`);
row("Prescription", `${b1?.prescriptionReferenceNumber}, fill ${b1?.fillNumber}`);
row("Product/service ID", `${b1?.product?.id} (qualifier ${b1?.product?.qualifier})`);
// Quantity Dispensed carries three implied decimal places; the library applies them string-wise.
row("Quantity dispensed", `${quantity?.source} on the wire, ${quantity?.impliedDecimal} decoded`);
row("Days supply", b1?.daysSupply?.source);
row("Pricing submitted", "wire  amount");
for (const { id, label, money } of submittedPricing(request)) row(`  ${label} (${id})`, amount(money));
row("Parse warnings", String(request.warnings.length));

// The response: synth generates requests only, so src/claim.js writes a paid answer to this claim.
const responseWire = syntheticResponse(request);
const response = parseTelecom(responseWire);
const outcome = adjudication(response);
const status = outcome?.status;
const paid = outcome?.pricing;
// The library has no view over the Response Claim segment (22), so read its field by ID.
const echoedRx = fieldValue(findSegment(response.segments, "22"), "D2");
const pharmacy = response.responseHeader?.serviceProviderId;
const rejects = status?.rejectCodes.map((reject) => reject.code) ?? [];

console.log("\nResponse: synthetic paid answer written by src/claim.js");
for (const line of visibleWire(responseWire)) console.log(`  ${line}`);
row("Echoes", `${outcome?.transactionCode}, pharmacy ${pharmacy}, prescription ${echoedRx}`);
row("Transmission status", response.responseHeader?.headerResponseStatus);
row("Claim status", `${status?.transactionResponseStatus}, disposition ${status?.disposition}`);
row("Authorization", status?.authorizationNumber);
row("Reject codes", rejects.join(", ") || "none");
row("Pricing paid", "wire  amount");
row("  Ingredient cost (F6)", amount(paid?.ingredientCostPaid));
row("  Dispensing fee (F7)", amount(paid?.dispensingFeePaid));
row("  Total amount paid (F9)", amount(paid?.totalAmountPaid));
row("  Patient pay (F5)", amount(paid?.patientPayAmount));
row("Parse warnings", String(response.warnings.length));
```
