// @ts-check
import {
  DATE_QUALIFIERS,
  describeRejection,
  describeSubscriber,
  formatDate,
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

console.log(`Synthetic 271 from @cosyte/synth (seed ${SEED}):`);
for (const segment of wire.split(terminator).filter(Boolean)) console.log(`  ${segment}${terminator}`);

/** @param {import("@cosyte/x12").X12EligibilityEntity | undefined} entity */
function party(entity) {
  if (entity === undefined) return "not stated";
  return entity.idCode ? `${entity.name}, ${entity.idQualifier} ${entity.idCode}` : entity.name;
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
  console.log(`Subscriber: ${facts.name}`);

  /** @type {Array<[string, string | undefined]>} */
  const rows = [
    ["member ID", facts.memberId ? `${facts.memberId} (${facts.memberIdQualifier})` : "not stated"],
    ["date of birth", facts.dateOfBirth && formatDate({ formatQualifier: "D8", value: facts.dateOfBirth })],
    ["sex", facts.sex],
    ["group number", facts.group.number ? `${facts.group.number} (REF 6P)` : "not stated"],
    ["group name", facts.group.name],
    ["plan", [facts.plan.number, facts.plan.name].filter(Boolean).join(", ") || "not stated"],
  ];
  for (const date of facts.dates) {
    const name = label(DATE_QUALIFIERS, date.qualifier) ?? "date";
    rows.push([name, `${formatDate(date)} (DTP ${date.qualifier})`]);
  }
  const traces = facts.traces.join(", ");
  rows.push(["270 trace", traces ? `${traces} (TRN-02, echoed from the inquiry)` : "none"]);
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

/** @param {import("@cosyte/x12").X12InquiryName | undefined} name */
function inquiryParty(name) {
  if (name === undefined) return "not stated";
  const who = [name.lastNameOrOrganizationName, name.firstName].filter(Boolean).join(", ");
  return name.idCode ? `${who}, ${name.idQualifier} ${name.idCode}` : who;
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
  const end = sent.delimiters.segment;
  for (const segment of request.split(end).filter(Boolean)) console.log(`  ${segment}${end}`);
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
    ["trace", trace && `${trace.referenceId} (TRN-02), originator ${originator} (TRN-03)`],
  ]);
  // Match the answer to the question: the 271 echoes the 270's TRN-02 on the subscriber it answers.
  const echoed = answered.traces.some((echo) => echo.referenceId === trace?.referenceId);
  const verdict = echoed ? "echoes this trace, so it answers" : "does not echo this trace, so it does not answer";
  console.log(`  The 271 ${verdict} this 270.`);
}

console.log(`\nWarnings (parse, 271 and 270 readers): ${warnings.length}`);
