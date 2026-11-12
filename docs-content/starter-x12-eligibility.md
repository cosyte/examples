---
id: starter-x12-eligibility
title: Read an X12 271 eligibility response and build its 270
sidebar_label: x12-eligibility
description: "A 271 read into payer, subscriber, coverage status and benefit lines, then the 270 inquiry it answers, built and matched by its trace."
---

# Read an X12 271 eligibility response and build its 270

The `x12-eligibility` starter reads the plan and coverage facts out of a synthetic X12 271
eligibility response: who answered, who is covered, the group number, the trace to match against
your 270, and each benefit line. It then builds the 270 inquiry that the 271 answers, and matches the
two by their trace. It prints no value that identifies the member: for the name, member ID, date of
birth, group number and trace, whether each is there or the precision of a date, and for the
interchanges only their segment IDs. Payers and providers are named only when they are
organizations.

Libraries: [`@cosyte/x12`](https://docs.cosyte.com/x12/),
[`@cosyte/synth`](https://docs.cosyte.com/synth/).

## What it shows

- **Parsing with warnings, not exceptions.** `parseX12` reads the interchange, with the delimiters
  taken from the ISA. A tolerated deviation arrives on `warnings` with a stable code.
- **The typed 271.** `get271Eligibility` returns each subscriber with its payer, provider, name,
  member ID, `REF`, `DTP` and `TRN` rows, and its `EB` benefit lines. Amounts and percents are
  `X12Decimal`, never a float, and each service type code comes with its description.
- **What a front desk asks.** `describeSubscriber` in `src/eligibility.js` labels seven `EB-01`
  benefit types and prints any other code as sent: coverage status from codes 1 to 8, cost sharing
  from `A`, `B`, `C` and `G`.
- **A rejection is not an empty plan.** The `AAA` conditions tell a rejected inquiry from a member
  with no benefit lines, since both come back with no benefits.
- **The 270.** `build270` builds the inquiry the 271 answers, under the trace the 271 echoes
  (`TRN-02`), and `get270Inquiry` reads it back. In your integration the order runs the other way:
  you build and send the 270, keep its trace, and match the 271 that comes back.
- **Reading without printing.** `src/main.js` reads the member's name, ID, date of birth and group
  number into variables, with their synthetic values in comments.

## Run it

From a clone of [cosyte/examples](https://github.com/cosyte/examples), on Node 22 or later:

```bash
cd examples/x12-eligibility
npm ci
npm start
```

The same seed gives the same output on every run.

`npm test` runs the starter and checks what it prints against a fresh reading of the same 271, and
that the output holds no value that identifies the member and no segment of the 271 or the 270. It
splits the 271 into segments by hand, without the library, and checks the typed reading against the
raw `NM1`, `REF`, `TRN` and `EB` segments. It builds a small 271 with co-payment, deductible and
co-insurance lines and checks that each amount and percent stays exactly as sent, reads the built 270
back and checks it against the 271, and turns the synthetic 271 into a rejection to check that it
reads as one.

## Before you build on it

- On the 0.1 line, `@cosyte/synth` writes no 270, so the starter builds the 270 from the synthetic
  271 and the trace matches by construction.
- On the 0.1 line, `@cosyte/x12` bundles no descriptions for `AAA` codes, so a rejection prints its
  codes as sent.
- The synthetic 271 carries one benefit line, so the cost-sharing path runs only in the test. Its
  `EB-08` percent is a whole number where the 271 guide defines a decimal fraction: read it as a
  placeholder.
- The output says whether a subscriber name, member ID and date of birth are there and never prints
  them, synthetic as they are. A production service should not write PHI to its logs either.

## Expected output

What `npm start` prints, as the starter's README gives it. This section and the next are generated from the starter by `scripts/docs-content.mjs`, and CI fails when they no longer match it.

```text
Synthetic 271 from @cosyte/synth (seed 42), segments:
  ISA GS ST BHT HL NM1 HL NM1 HL TRN NM1 N3 N4 DMG REF DTP EB SE GE IEA

Payer (information source): PLACEHOLDER BENEFIT ADMIN, ID qualifier PI
Provider (information receiver): MOCK CARE ASSOCIATES, ID qualifier XX
Subscriber: name present
  member ID        present (MI)
  date of birth    a day (DMG D8)
  group number     present (REF 6P)
  plan             not stated
  eligibility      a day (DTP 307)
  270 traces       1 (TRN-02, echoed from the inquiry)

Benefits (EB):
  1 Active Coverage, coverage level IND, in network Y
    service types  98 Professional (Physician) Visit - Office; 35 Dental Care
    amount         717.00
    percent        80

Coverage status: 1 Active Coverage
Cost sharing (co-insurance, co-payment, deductible, out of pocket): none stated

Inquiry rejections (AAA segments): 0

The 270 inquiry this 271 answers, built with build270 (@cosyte/synth writes no 270):
  ISA GS ST BHT HL NM1 HL NM1 HL TRN NM1 DMG EQ SE GE IEA
  to               PLACEHOLDER BENEFIT ADMIN, ID qualifier PI
  from             MOCK CARE ASSOCIATES, ID qualifier XX
  about            a person, name not printed, ID qualifier MI
  asks for         30 Health Benefit Plan Coverage
  trace            TRN-02 present, originator 9SYNTHETIC (TRN-03)
  The 271 echoes this trace, so it answers this 270.

Warnings (parse, 271 and 270 readers): 0
```

## Files

The starter's code, every file of `x12-eligibility/` as this release holds it, except its README, its lockfile and its tests, which are in the repository: [x12-eligibility on GitHub](https://github.com/cosyte/examples/tree/main/x12-eligibility).

### package.json

```json title="x12-eligibility/package.json"
{
  "name": "cosyte-example-x12-eligibility",
  "version": "0.0.0",
  "private": true,
  "description": "Read plan and coverage facts out of a synthetic X12 271 eligibility response with @cosyte/x12, and build the 270 inquiry it answers.",
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
  }
}
```

### src/eligibility.js

```js title="x12-eligibility/src/eligibility.js"
// @ts-check
import { generate271 } from "@cosyte/synth/x12";
import { build270, get270Inquiry, get271Eligibility, parseX12, serializeX12, toISO } from "@cosyte/x12";

/**
 * Labels for the EB-01 benefit types this starter names. They are values of ASC X12 data element
 * 1390 (Eligibility or Benefit Information Code), which EB-01 of the 005010X279A1 271 carries.
 * The @cosyte/x12 0.1 line bundles no table for EB-01 (its `X12EligibilityBenefit` documentation
 * names 1, 6, and I), so we keep this short list and print any other code as sent.
 *
 * @type {Readonly<Record<string, string>>}
 */
export const BENEFIT_TYPES = Object.freeze({
  1: "Active Coverage",
  6: "Inactive",
  A: "Co-Insurance",
  B: "Co-Payment",
  C: "Deductible",
  G: "Out of Pocket (Stop Loss)",
  I: "Non-Covered",
});

/** The EB-01 codes that state what the member pays: co-insurance, co-payment, deductible, out of pocket. */
export const COST_SHARING_CODES = Object.freeze(["A", "B", "C", "G"]);

/** The EB-01 codes that state whether coverage is in force: 1 to 5 active, 6 to 8 inactive. */
export const COVERAGE_STATUS_CODES = Object.freeze(["1", "2", "3", "4", "5", "6", "7", "8"]);

/**
 * DTP-01 qualifiers named in @cosyte/x12's `X12EligibilityDate` documentation.
 *
 * @type {Readonly<Record<string, string>>}
 */
export const DATE_QUALIFIERS = Object.freeze({ 307: "eligibility", 291: "plan" });

/**
 * A label from one of the tables above, or undefined. `Object.hasOwn` keeps a code such as
 * "constructor" from resolving through the object prototype.
 *
 * @param {Readonly<Record<string, string>>} table
 * @param {string} code
 * @returns {string | undefined}
 */
export function label(table, code) {
  return Object.hasOwn(table, code) ? table[code] : undefined;
}

/**
 * A DTP or DMG date for display. `toISO` from @cosyte/x12 reads a `D8` (`CCYYMMDD`) day as
 * `YYYY-MM-DD`. It answers `undefined` for an `RD8` range, which is not a single day, so a range
 * prints as its two days. Anything else prints as sent, with its format qualifier.
 *
 * @param {{ formatQualifier: string, value: string }} date
 * @returns {string}
 */
export function formatDate({ formatQualifier, value }) {
  const day = (/** @type {string} */ text) => toISO({ formatQualifier: "D8", value: text }) ?? text;
  if (formatQualifier === "RD8") return value.split("-").map(day).join(" to ");
  return toISO({ formatQualifier, value }) ?? `${value} (${formatQualifier})`;
}

/**
 * Build a synthetic 271 eligibility response. The same seed gives the same bytes on every machine,
 * and every name, member ID, date and address comes from @cosyte/synth's synthetic pools.
 *
 * @param {number} seed
 * @returns {string} the X12 wire text, segments ended by the terminator declared in the ISA
 */
export function syntheticEligibilityResponse(seed) {
  return serializeX12(generate271({ seed }));
}

/**
 * The one transaction set of a given type (ST-01) in an interchange.
 *
 * @param {import("@cosyte/x12").X12Interchange} interchange
 * @param {string} type
 */
function transactionOf(interchange, type) {
  const transaction = interchange.groups
    .flatMap((group) => group.transactions)
    .find((tx) => tx.st.elements[1] === type);
  if (transaction === undefined) throw new Error(`the interchange carries no ${type} transaction set`);
  return transaction;
}

/**
 * Parse an interchange and read its 271 through the typed reader. Besides the subscribers, the
 * reading carries `aaaConditions`: every AAA request-validation segment, the payer saying it could
 * not process the inquiry and why. Read it before the benefits, because a rejected inquiry and a
 * member with no benefit lines both come back with no benefits.
 *
 * @param {string} wire
 */
export function readEligibility(wire) {
  const interchange = parseX12(wire);
  const eligibility = get271Eligibility(interchange.delimiters, transactionOf(interchange, "271"));
  if (eligibility === undefined) throw new Error("get271Eligibility did not read the transaction set");
  return { interchange, eligibility };
}

/**
 * One AAA condition as a line: where the payer placed it, and its reject reason (AAA-03) and
 * follow-up action (AAA-04) codes exactly as sent.
 *
 * @param {import("@cosyte/x12").X12AaaCondition} condition
 * @returns {string}
 */
export function describeRejection({ key, rejectReasonCode, followUpActionCode }) {
  const where = `${key.level ?? "unknown level"}${key.hierarchyId ? ` (HL ${key.hierarchyId})` : ""}`;
  const reason = rejectReasonCode?.code ?? "not stated";
  const action = followUpActionCode?.code ?? "not stated";
  return `${where}: reject reason ${reason}, follow-up action ${action}`;
}

/**
 * TRN-03 of the inquiry: who assigned the trace. It is "1" and an EIN, "3" and a DUNS number, or "9"
 * and an identifier you assign yourself, as this fictional one is.
 */
export const TRACE_ORIGINATOR = "9SYNTHETIC";

/** BHT-03 of the inquiry: the submitter's own identifier for this transaction. Fictional. */
export const INQUIRY_REFERENCE = "SYNTHREQ0001";

/**
 * The 270 inquiry that a 271 answers, as the provider would send it: the provider (information
 * receiver) asks the payer (information source) about one member, for service type 30 (health
 * benefit plan coverage), under a trace the payer echoes back in its 271. @cosyte/synth generates no
 * 270, so we build one with @cosyte/x12's build270 from the parties, member and trace the synthetic
 * 271 names. In your integration the order runs the other way: you build and send the 270, keep its
 * trace, and match the 271 that comes back.
 *
 * build270 writes the BHT header and the HL hierarchy itself, and refuses a spec it cannot emit
 * spec-clean, such as a level with no name or an inquiry that asks for nothing.
 *
 * @param {import("@cosyte/x12").X12Interchange} response the parsed 271 interchange
 * @param {import("@cosyte/x12").X12EligibilitySubscriber} subscriber a subscriber read from it
 * @returns {string} the 270 wire text
 */
export function inquiryFor(response, subscriber) {
  const { informationSource: payer, informationReceiver: provider, name: member } = subscriber;
  const trace = subscriber.traces[0]?.referenceId;
  if (payer === undefined || provider === undefined || member === undefined || trace === undefined) {
    throw new Error("the 271 does not name a payer, a provider, a member and a trace to ask about");
  }
  /** @param {import("@cosyte/x12").X12EligibilityEntity} party */
  const organization = (party) => ({
    entityIdentifierCode: party.entityIdentifierCode,
    entityTypeQualifier: party.entityTypeQualifier,
    lastNameOrOrganizationName: party.name,
    idQualifier: party.idQualifier,
    idCode: party.idCode,
  });
  // ISA-06 is the sender and ISA-08 the receiver, padded to 15. The inquiry travels the other way.
  const isa = response.isa.elements;
  const built = build270({
    envelope: {
      senderId: (isa[8] ?? "").trim(),
      receiverId: (isa[6] ?? "").trim(),
      interchangeDate: isa[9] ?? "",
      interchangeTime: isa[10] ?? "",
      interchangeControlNumber: "000000001",
      groupControlNumber: "1",
      transactionSetControlNumber: "0001",
      usageIndicator: "T", // T marks test data; the builder's default is P, production.
    },
    // BHT-01 (0022) and BHT-02 (13, a request) default; the creation date and time default to GS.
    header: { referenceId: INQUIRY_REFERENCE },
    informationSources: [
      {
        name: organization(payer),
        receivers: [
          {
            name: organization(provider),
            subscribers: [
              {
                traces: [{ traceTypeCode: "1", referenceId: trace, originatingCompanyId: TRACE_ORIGINATOR }],
                name: {
                  entityIdentifierCode: member.entityIdentifierCode,
                  entityTypeQualifier: member.entityTypeQualifier,
                  lastNameOrOrganizationName: member.lastName,
                  firstName: member.firstName,
                  idQualifier: member.idQualifier,
                  idCode: member.idCode,
                  dateOfBirth: member.dateOfBirth,
                  genderCode: member.genderCode,
                },
                inquiries: [{ serviceTypeCodes: [{ code: "30" }] }],
              },
            ],
          },
        ],
      },
    ],
  });
  return serializeX12(built);
}

/**
 * Parse an interchange and read its 270 through the typed inquiry reader.
 *
 * @param {string} wire
 */
export function readInquiry(wire) {
  const interchange = parseX12(wire);
  const inquiry = get270Inquiry(interchange.delimiters, transactionOf(interchange, "270"));
  if (inquiry === undefined) throw new Error("get270Inquiry did not read the transaction set");
  return { interchange, inquiry };
}

/**
 * One EB benefit line, with amounts kept exactly as sent (`X12Decimal.toString()`, never a float).
 *
 * @param {import("@cosyte/x12").X12EligibilityBenefit} benefit
 */
export function describeBenefit(benefit) {
  return {
    code: benefit.eligibilityCode,
    type: label(BENEFIT_TYPES, benefit.eligibilityCode),
    coverageLevel: benefit.coverageLevelCode,
    serviceTypes: benefit.serviceTypeCodes.map(({ code, description }) => ({ code, description })),
    insuranceType: benefit.insuranceTypeCode,
    planDescription: benefit.planCoverageDescription,
    timePeriod: benefit.timePeriodQualifier,
    amount: benefit.monetaryAmount?.toString(),
    percent: benefit.percent?.toString(),
    quantity: benefit.quantity?.toString(),
    inNetwork: benefit.inPlanNetwork,
  };
}

/**
 * The facts a front desk asks of a 271 about one subscriber: who answered, who is covered, the group
 * and plan, the trace to match against the inquiry, and every benefit line.
 *
 * @param {import("@cosyte/x12").X12EligibilitySubscriber} subscriber
 */
export function describeSubscriber(subscriber) {
  const { name } = subscriber;
  // REF-01 6P is the group number and 18 the plan number; REF-03, when sent, carries the name.
  const group = subscriber.references.find((ref) => ref.qualifier === "6P");
  const plan = subscriber.references.find((ref) => ref.qualifier === "18");
  const benefits = subscriber.benefits.map(describeBenefit);
  const planDescriptions = benefits.flatMap((benefit) => benefit.planDescription ?? []);

  return {
    payer: subscriber.informationSource,
    provider: subscriber.informationReceiver,
    name: [name?.lastName, name?.firstName].filter(Boolean).join(", "),
    memberId: name?.idCode,
    memberIdQualifier: name?.idQualifier,
    dateOfBirth: name?.dateOfBirth,
    sex: name?.genderCode,
    traces: subscriber.traces.map((trace) => trace.referenceId),
    group: { number: group?.value, name: group?.description },
    plan: { number: plan?.value, name: plan?.description ?? planDescriptions[0] },
    dates: subscriber.dates,
    benefits,
    coverageStatus: benefits.filter((benefit) => COVERAGE_STATUS_CODES.includes(benefit.code)),
    costSharing: benefits.filter((benefit) => COST_SHARING_CODES.includes(benefit.code)),
  };
}
```

### src/main.js

```js title="x12-eligibility/src/main.js"
// @ts-check
import {
  DATE_QUALIFIERS,
  describeRejection,
  describeSubscriber,
  inquiryFor,
  label,
  readEligibility,
  readInquiry,
  syntheticEligibilityResponse,
} from "./eligibility.js";

const SEED = 42;

const wire = syntheticEligibilityResponse(SEED);
const { interchange, eligibility } = readEligibility(wire);
const terminator = interchange.delimiters.segment;

// Nothing below prints a value that identifies a person, synthetic or not: an example that logs a
// member's name teaches a pipeline to log one. It prints segment IDs, codes, counts, amounts and the
// precision of each date. To see what a field holds, read it into a variable or assert on it.
/**
 * The segment IDs of an interchange, in order: never a segment's elements.
 *
 * @param {string} text
 * @param {string} end the segment terminator
 */
const segmentIds = (text, end) =>
  text
    .split(end)
    .filter((segment) => segment.trim() !== "")
    .map((segment) => segment.trim().split("*")[0]);
console.log(`Synthetic 271 from @cosyte/synth (seed ${SEED}), segments:`);
console.log(`  ${segmentIds(wire, terminator).join(" ")}`);

/**
 * A payer or a provider. An organization (NM1-02 "2") is named; a person (NM1-02 "1") is not.
 *
 * @param {import("@cosyte/x12").X12EligibilityEntity | undefined} entity
 */
function party(entity) {
  if (entity === undefined) return "not stated";
  const who = entity.entityTypeQualifier === "2" ? entity.name : "a person, name not printed";
  return entity.idCode ? `${who}, ID qualifier ${entity.idQualifier}` : who;
}

/**
 * The precision of a date, never the date: D8 is a day, RD8 a range of days.
 *
 * @param {{ formatQualifier: string }} date
 */
function precision(date) {
  if (date.formatQualifier === "RD8") return "a range of days";
  return date.formatQualifier === "D8" ? "a day" : `format ${date.formatQualifier}`;
}

/**
 * Print name/value rows with every value in one column, skipping rows with no value.
 *
 * @param {string} indent
 * @param {Array<[string, string | undefined]>} rows
 */
function printRows(indent, rows) {
  for (const [name, value] of rows) {
    if (value) console.log(`${indent}${name.padEnd(18 - indent.length)} ${value}`);
  }
}

for (const subscriber of eligibility.subscribers) {
  const facts = describeSubscriber(subscriber);

  console.log(`\nPayer (information source): ${party(facts.payer)}`);
  console.log(`Provider (information receiver): ${party(facts.provider)}`);
  // The subscriber's own values are read, never printed. The values in these comments are synthetic.
  const subscriberName = facts.name; // "Nonesuch, Sampleton", synthetic
  const memberId = facts.memberId; // "MBR81711168", synthetic
  const dateOfBirth = facts.dateOfBirth; // "19521221", synthetic
  const groupNumber = facts.group.number; // "GRP46142", synthetic
  console.log(`Subscriber: name ${subscriberName ? "present" : "not stated"}`);

  /** @type {Array<[string, string | undefined]>} */
  const rows = [
    ["member ID", memberId ? `present (${facts.memberIdQualifier})` : "not stated"],
    ["date of birth", dateOfBirth ? "a day (DMG D8)" : "not stated"],
    ["group number", groupNumber ? "present (REF 6P)" : "not stated"],
    ["plan", facts.plan.number || facts.plan.name ? "present" : "not stated"],
  ];
  for (const date of facts.dates) {
    const name = label(DATE_QUALIFIERS, date.qualifier) ?? "date";
    rows.push([name, `${precision(date)} (DTP ${date.qualifier})`]);
  }
  rows.push(["270 traces", `${facts.traces.length} (TRN-02, echoed from the inquiry)`]);
  printRows("  ", rows);

  console.log(`\nBenefits (EB):${facts.benefits.length === 0 ? " none" : ""}`);
  for (const benefit of facts.benefits) {
    const heading = [`${benefit.code} ${benefit.type ?? "(no label in this starter)"}`];
    if (benefit.coverageLevel) heading.push(`coverage level ${benefit.coverageLevel}`);
    if (benefit.inNetwork) heading.push(`in network ${benefit.inNetwork}`);
    console.log(`  ${heading.join(", ")}`);

    const services = benefit.serviceTypes.map(
      (service) => `${service.code} ${service.description ?? "(no bundled description)"}`,
    );
    printRows("    ", [
      ["service types", services.join("; ")],
      ["insurance type", benefit.insuranceType],
      ["plan", benefit.planDescription],
      ["time period", benefit.timePeriod],
      ["amount", benefit.amount],
      ["percent", benefit.percent],
      ["quantity", benefit.quantity],
    ]);
  }

  const status = facts.coverageStatus.map((benefit) => `${benefit.code} ${benefit.type ?? "(no label)"}`);
  console.log(`\nCoverage status: ${status.join("; ") || "not stated"}`);

  const shares = facts.costSharing.map((benefit) => {
    const parts = [`${benefit.code} ${benefit.type}`];
    if (benefit.amount) parts.push(`amount ${benefit.amount}`);
    if (benefit.percent) parts.push(`percent ${benefit.percent}`);
    return parts.join(" ");
  });
  const sharing = shares.join("; ") || "none stated";
  console.log(`Cost sharing (co-insurance, co-payment, deductible, out of pocket): ${sharing}`);
}

// A rejected inquiry and a member with no benefit lines both come back with no benefits. The AAA
// conditions tell them apart: each one carries the payer's reject reason and follow-up action codes.
console.log(`\nInquiry rejections (AAA segments): ${eligibility.aaaConditions.length}`);
for (const condition of eligibility.aaaConditions) console.log(`  ${describeRejection(condition)}`);

/**
 * A party of the inquiry. An organization (NM1-02 "2") is named; a person (NM1-02 "1") is not.
 *
 * @param {import("@cosyte/x12").X12InquiryName | undefined} party
 */
function inquiryParty(party) {
  if (party === undefined) return "not stated";
  const organization = party.entityTypeQualifier === "2";
  const who = organization ? party.lastNameOrOrganizationName : "a person, name not printed";
  return party.idCode ? `${who}, ID qualifier ${party.idQualifier}` : who;
}

// The question the 271 answers. @cosyte/synth writes no 270, so src/eligibility.js builds one with
// build270 from the parties, member and trace the 271 names, and we read it back with get270Inquiry.
const warnings = [...interchange.warnings, ...eligibility.warnings];
const [answered] = eligibility.subscribers;
if (answered !== undefined) {
  const request = inquiryFor(interchange, answered);
  const { interchange: sent, inquiry } = readInquiry(request);
  warnings.push(...sent.warnings, ...inquiry.warnings);

  console.log("\nThe 270 inquiry this 271 answers, built with build270 (@cosyte/synth writes no 270):");
  console.log(`  ${segmentIds(request, sent.delimiters.segment).join(" ")}`);
  const source = inquiry.informationSources[0];
  const receiver = source?.receivers[0];
  const subscriber = receiver?.subscribers[0];
  const trace = subscriber?.traces[0];
  const services = (subscriber?.inquiries ?? [])
    .flatMap((query) => query.serviceTypeCodes)
    .map((service) => `${service.code} ${service.description ?? "(no bundled description)"}`);
  const originator = trace?.originatingCompanyId ?? "not stated";
  printRows("  ", [
    ["to", inquiryParty(source?.name)],
    ["from", inquiryParty(receiver?.name)],
    ["about", inquiryParty(subscriber?.name)],
    ["asks for", services.join("; ")],
    ["trace", trace && `TRN-02 present, originator ${originator} (TRN-03)`],
  ]);
  // Match the answer to the question: the 271 echoes the 270's TRN-02 on the subscriber it answers.
  const echoed = answered.traces.some((echo) => echo.referenceId === trace?.referenceId);
  const verdict = echoed ? "echoes this trace, so it answers" : "does not echo this trace, so it does not answer";
  console.log(`  The 271 ${verdict} this 270.`);
}

console.log(`\nWarnings (parse, 271 and 270 readers): ${warnings.length}`);
```
