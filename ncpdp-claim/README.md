# ncpdp-claim

Parse a synthetic NCPDP Telecom D.0 billing claim (B1) and a paid response to it with
[`@cosyte/ncpdp`](https://github.com/cosyte/ncpdp), and print what a pharmacy biller checks:
routing, product, quantity, and the amounts submitted, then the claim's status and the amounts paid,
with every amount read as text and never as a floating-point number.

It prints no value that identifies the patient, synthetic as it is: the group ID, the prescription
number, and the authorization number print only as sent or not, the date of service as its
precision, and the response as its segments, never its wire text. `src/main.js` reads those values
into variables, with their synthetic values in comments, to show what each holds.

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
  BIN / PCN / group           999999 / SYN2561 / group ID sent
  Transaction                 B1, version D0
  Date of service             a day (CCYYMMDD)
  Pharmacy                    3212672670 (ID qualifier 01)
  Prescription                number sent, fill 4
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
  Segments                    21 Response Status, 22 Response Claim, 23 Response Pricing
  Wire lines                  5
  Echoes                      B1, pharmacy 3212672670, prescription number matches the claim
  Transmission status         A
  Claim status                P, disposition paid
  Authorization number        sent
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
prints its segments and the number of lines its wire text takes with the control characters named
(`visibleWire` in `src/claim.js`: `<GS>` opens the transaction, `<RS>` each segment, `<FS>` each
field), and whether the prescription number it echoes matches the claim's.

## Test

```bash
npm test
```

The test runs `src/main.js` and checks the product line, that the echoed prescription number
matches, the paid status, and that neither parse raised a warning, and that the output holds no
patient name, birth date, cardholder or group ID, prescription or authorization number, date of
service, or line of the wire. It then reads the claim in process and checks the
claim view against the Claim segment's own fields, checks that the paid response echoes the claim
and that its total paid equals ingredient cost plus dispensing fee minus patient pay, and checks
that a rejected response reads as rejected with every reject code in wire order, even when its
status field says paid.

## Integration tests

`npm test` also runs the fast integration tests, `test/integration/*.fast.test.js`. `npm run test:full`
runs every test, the seed sweeps in `test/integration/*.full.test.js` included, and fails unless the
helpers in `test/integration/support.js` are fully covered. They call the libraries' public APIs only,
on synthetic data.

- Synthetic B1, B2 and B3 requests from `@cosyte/synth`, and the starter's B1 with its Pricing
  segment, parse with no warning and serialize back to the same text.
- `deidentifyTelecom` from `@cosyte/deid` de-identifies each one. The output parses and round-trips
  with the same segments; no patient field (`C4`, `CA`, `CB`, `CM`, `CQ`, `CY`) or cardholder ID
  (`C2`) value is left in any field, the manifest, or the residual list; the birth date keeps its
  year.
- The full suite runs the same checks over 250 seeds of each request.

## How it works

1. `generateB1({ seed: 1 })` from `@cosyte/synth/ncpdp` builds a B1 claim through `@cosyte/ncpdp`'s
   own `buildTelecomRequest` and `serializeTelecom`. It carries Patient, Insurance, Prescriber, and
   Claim segments but no Pricing segment, so `syntheticClaim` parses it and rebuilds it with a
   Pricing segment (11) through the same builder, which refuses a field ID that is not two
   characters or a value that holds a separator.
2. `parseTelecom` reads the claim: the fixed 56-byte header (BIN, version, transaction code, PCN,
   pharmacy, date of service) and the segments, each a list of two-character field IDs and their
   values. `claim(transaction)` lifts the fields a biller checks: group, prescription and fill,
   product and its qualifier, quantity, and days supply. The library has no view over the Pricing
   segment, so `submittedPricing` reads it by field ID with `findSegment` and `fieldValue`.
3. Money never becomes a JavaScript number. `telecomMoney` keeps the wire text in `source` and applies
   the implied decimal places and the sign string-wise into `amount`. The last character carries the
   sign: `{` and `A` to `I` are +0 to +9, `}` and `J` to `R` are -0 to -9. Quantity Dispensed works the
   same way with three implied decimal places, and qualifier `03` marks the product ID as an NDC.
4. `@cosyte/synth` generates Telecom requests only, and `@cosyte/ncpdp` builds requests only, so
   `syntheticResponse` writes the payer's answer as wire text: a response header that echoes the
   transaction code, the pharmacy, and the date of service, then a group separator and the Response
   Status (21), Response Claim (22, echoing the prescription number), and Response Pricing (23)
   segments. `parseTelecom` tells a response from a request by where `D0` sits in the header.
5. `adjudication(response)` returns the status, pricing, and DUR views. Its `disposition` comes from
   the status field and the reject codes together, and a reject always wins: a response whose status
   says `P` but carries a reject code reads as rejected, with `statusConflict` set. Reject codes
   come back verbatim, in wire order. `syntheticResponse(request, ["75"])` writes a rejected answer,
   and the test reads one.

The code is in [`src/claim.js`](src/claim.js) and [`src/main.js`](src/main.js).

## Limits

- On the 0.1 line, `@cosyte/synth` writes Quantity Dispensed as a whole number of units (`31`),
  without the three implied decimal places the field carries, so it reads as 0.031. A claim for 31
  units carries `31000`. We print what the wire says rather than correct it.
- `@cosyte/ncpdp` reads each group-separated block of a transmission as its own transaction, and the
  views (`claim`, `adjudication`) read the first. The response here puts all of its segments after one
  group separator. Segments placed before it, such as a Response Message (20) or Response Insurance
  (25), would form a first transaction of their own, and the status and pricing would not be in it.
  Check `transaction.warnings` before you trust a view.
- The response header is decoded through the pharmacy ID. The date of service that follows it is on
  the wire but not in `responseHeader`.
- One claim, one response, and no DUR, coordination of benefits, or compound segments.
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

Need it built, or hosted and run for you? [Talk to us](https://cosyte.com/integration-services?utm_source=github&utm_medium=readme&utm_campaign=evergreen&utm_content=examples).
