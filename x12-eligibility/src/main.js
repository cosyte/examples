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
