# ncpdp-claim

Parse a synthetic NCPDP Telecom D.0 billing claim (B1) and a paid response to it with
[`@cosyte/ncpdp`](https://github.com/cosyte/ncpdp), and print what a pharmacy biller checks: routing,
product, quantity and the amounts submitted, then the claim's status and the amounts paid, with every
amount read as text and never as a floating-point number.

Libraries: [`@cosyte/ncpdp`](https://github.com/cosyte/ncpdp),
[`@cosyte/synth`](https://github.com/cosyte/synth).

## Run it

```bash
npm install
npm start
```

Node 22 or later.

## Expected output

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

Each amount prints beside its wire form. An NCPDP amount carries two implied decimal places and signs
its last character, so `456G` is 45.67 and `100{` is 10.00. Quantity Dispensed carries three implied
decimal places, which is why this claim's `31` reads as 0.031: see [Limits](#limits). The response
prints with its control characters named: `<GS>` opens the transaction, `<RS>` each segment, `<FS>` each
field.

## Test

```bash
npm test
```

The test runs `src/main.js` and checks the product line, the echoed prescription number, the paid
status and that neither parse raised a warning. It then reads the claim in process and checks the claim
view against the Claim segment's own fields, checks that the paid response echoes the claim and that
its total paid equals ingredient cost plus dispensing fee minus patient pay, and checks that a rejected
response reads as rejected with every reject code in wire order, even when its status field says paid.

## How it works

1. `generateB1({ seed: 1 })` from `@cosyte/synth/ncpdp` builds a B1 claim through `@cosyte/ncpdp`'s own
   `buildTelecomRequest` and `serializeTelecom`. It carries Patient, Insurance, Prescriber and Claim
   segments but no Pricing segment, so `syntheticClaim` parses it and rebuilds it with a Pricing segment
   (11) through the same builder, which refuses a field ID that is not two characters or a value that
   holds a separator.
2. `parseTelecom` reads the claim: the fixed 56-byte header (BIN, version, transaction code, PCN,
   pharmacy, date of service) and the segments, each a list of two-character field IDs and their
   values. `claim(transaction)` lifts the fields a biller checks: group, prescription and fill, product
   and its qualifier, quantity and days supply. The library has no view over the Pricing segment, so
   `submittedPricing` reads it by field ID with `findSegment` and `fieldValue`.
3. Money never becomes a JavaScript number. `telecomMoney` keeps the wire text in `source` and applies
   the implied decimal places and the sign string-wise into `amount`. The last character carries the
   sign: `{` and `A` to `I` are +0 to +9, `}` and `J` to `R` are -0 to -9. Quantity Dispensed works the
   same way with three implied decimal places, and qualifier `03` marks the product ID as an NDC.
4. `@cosyte/synth` generates Telecom requests only, and `@cosyte/ncpdp` builds requests only, so
   `syntheticResponse` writes the payer's answer as wire text: a response header that echoes the
   transaction code, the pharmacy and the date of service, then a group separator and the Response
   Status (21), Response Claim (22, echoing the prescription number) and Response Pricing (23)
   segments. `parseTelecom` tells a response from a request by where `D0` sits in the header.
5. `adjudication(response)` returns the status, pricing and DUR views. Its `disposition` comes from the
   status field and the reject codes together, and a reject always wins: a response whose status says
   `P` but carries a reject code reads as rejected, with `statusConflict` set. Reject codes come back
   verbatim, in wire order. `syntheticResponse(request, ["75"])` writes a rejected answer, and the test
   reads one.

The code is in [`src/claim.js`](src/claim.js) and [`src/main.js`](src/main.js).

## Limits

- `@cosyte/synth` 0.0.9 writes Quantity Dispensed as a whole number of units (`31`), without the three
  implied decimal places the field carries, so it reads as 0.031. A claim for 31 units carries `31000`.
  We print what the wire says rather than correct it.
- `@cosyte/ncpdp` reads each group-separated block of a transmission as its own transaction, and the
  views (`claim`, `adjudication`) read the first. The response here puts all of its segments after one
  group separator. Segments placed before it, such as a Response Message (20) or Response Insurance
  (25), would form a first transaction of their own, and the status and pricing would not be in it.
  Check `transaction.warnings` before you trust a view.
- The response header is decoded through the pharmacy ID. The date of service that follows it is on
  the wire but not in `responseHeader`.
- One claim, one response, and no DUR, coordination of benefits or compound segments.
  `@cosyte/ncpdp` reads those too (`responseDur`, `responseCob`, `compound`).

## Synthetic data

The claim comes from `@cosyte/synth`. Its patient and cardholder names come from a fictional pool, the
member IDs carry an `MBR` prefix, the phone number is in the reserved 555-01xx block, the pharmacy and
prescriber NPIs fail the NPI check digit on purpose, the BIN is `999999`, and the product ID is an
invented NDC under the `00000` labeler prefix. We wrote the Pricing segment amounts and the whole
response in `src/claim.js`, and they are just as synthetic: `SYNTHAUTH01` is not an authorization from
any payer. `@cosyte/synth` does not generate Telecom responses. None of this is real patient or claim
data.

## Versions

The `@cosyte/*` versions are set in [`package.json`](package.json). After changing one, run
`npm install` to refresh `package-lock.json`, then `npm test`.

Need it integrated? [Talk to us](https://cosyte.com/contact).
