// @ts-check
import {
  DATE_QUALIFIERS,
  describeSubscriber,
  formatDate,
  label,
  readEligibility,
  syntheticEligibilityResponse,
} from "./eligibility.js";

const SEED = 42;

const wire = syntheticEligibilityResponse(SEED);
const { interchange, eligibility, rejections } = readEligibility(wire);
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

// On the 0.0.18 model a rejected inquiry and a member with no benefit lines look alike: read both.
console.log(`\nInquiry rejections (AAA segments): ${rejections}`);
console.log(`Warnings (parse and 271 reader): ${interchange.warnings.length + eligibility.warnings.length}`);
