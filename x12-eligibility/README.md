# x12-eligibility

Read the plan and coverage facts out of a synthetic X12 271 eligibility response with
[`@cosyte/x12`](https://github.com/cosyte/x12): who answered, who is covered, the group number, the
trace to match against your 270, and each benefit line with its service types, coverage level, amount
and percent.

Libraries: [`@cosyte/x12`](https://github.com/cosyte/x12),
[`@cosyte/synth`](https://github.com/cosyte/synth).

## Run it

```bash
npm install
npm start
```

Node 22 or later.

## Expected output

```text
Synthetic 271 from @cosyte/synth (seed 42):
  ISA*00*          *00*          *ZZ*SYNSUB448      *ZZ*SYNRCV084      *240321*2317*^*00501*441887323*0*T*:~
  GS*HB*SYNSUB448*SYNRCV084*20240321*2317*83976*X*005010X279A1~
  ST*271*7813*005010X279A1~
  HL*1**20*1~
  NM1*PR*2*MOCK NATIONAL INSURER*****PI*SYN90748~
  HL*2*1*21*1~
  NM1*1P*2*MOCK CARE ASSOCIATES*****XX*5462419363~
  HL*3*2*22*0~
  TRN*2*ELIG2310320984~
  NM1*IL*1*Nonesuch*Sampleton****MI*MBR81711168~
  N3*7330 Example Boulevard~
  N4*Mockhaven*NJ*00000~
  DMG*D8*19521221*M~
  REF*6P*GRP61420~
  DTP*307*D8*20240321~
  EB*1*IND*35^1****1573.00*80****Y~
  SE*15*7813~
  GE*1*83976~
  IEA*1*441887323~

Payer (information source): MOCK NATIONAL INSURER, PI SYN90748
Provider (information receiver): MOCK CARE ASSOCIATES, XX 5462419363
Subscriber: Nonesuch, Sampleton
  member ID        MBR81711168 (MI)
  date of birth    1952-12-21
  sex              M
  group number     GRP61420 (REF 6P)
  plan             not stated
  eligibility      2024-03-21 (DTP 307)
  270 trace        ELIG2310320984 (TRN-02, echoed from the inquiry)

Benefits (EB):
  1 Active Coverage, coverage level IND, in network Y
    service types  35 Dental Care; 1 Medical Care
    amount         1573.00
    percent        80

Coverage status: 1 Active Coverage
Cost sharing (co-insurance, co-payment, deductible, out of pocket): none stated

Inquiry rejections (AAA segments): 0
Warnings (parse and 271 reader): 0
```

The same seed gives the same output on every run. The payer is the information source (Loop 2100A),
the provider is the information receiver (Loop 2100B), and the `270 trace` is the value the payer
echoes from your inquiry so you can match the answer to the question.

## Test

```bash
npm test
```

The test runs `src/main.js` and checks the payer, member ID, group number, trace, benefit lines and
coverage status it prints against a fresh reading of the same 271. It then splits the 271 into
segments by hand, without the library, and checks each value the typed reader returned against the raw
`NM1`, `REF`, `TRN` and `EB` segments. A third test builds a small 271 with co-payment, deductible and
co-insurance lines through `build271` and checks their labels, and that each amount and percent stays
exactly as sent.

## How it works

1. `generate271({ seed: 42 })` from `@cosyte/synth/x12` builds the response through `@cosyte/x12`'s
   own `build271`, and `serializeX12` turns it into the wire text a payer sends.
2. `parseX12` reads the interchange. The delimiters come from the ISA, and a tolerated deviation
   arrives on `warnings` with a stable code instead of an exception.
3. `get271Eligibility(interchange.delimiters, transaction)` returns the typed 271: each subscriber
   with its payer, provider, name, member ID, `REF`, `DTP` and `TRN` rows, and its `EB` benefit
   lines. Amounts and percents are `X12Decimal`, never a float, and each service type code comes with
   its description from the snapshot the package bundles.
4. `describeSubscriber` in `src/eligibility.js` turns that into the facts a front desk asks for. It
   labels the seven `EB-01` benefit types it knows (active coverage, inactive, co-insurance,
   co-payment, deductible, out of pocket, non-covered) and prints any other code as sent. Coverage
   status comes from `EB-01` codes 1 to 8, cost sharing from `A`, `B`, `C` and `G`.
5. `readEligibility` also counts `AAA` segments, the payer's way of saying it could not process the
   inquiry. The `@cosyte/x12` 0.0.18 model does not carry them, and without that count a rejected
   inquiry reads like a member with no benefit lines.

The code is in [`src/eligibility.js`](src/eligibility.js) and [`src/main.js`](src/main.js).

## Limits

- There is no 270 request here. `@cosyte/x12` 0.0.18 has no 270 builder and no 270 reader. Its
  segment-level `buildInterchange` would wrap segments we write ourselves, and `parseX12` accepts any
  body inside a valid envelope, so nothing in 0.0.18 checks that what we wrote is a 270. We leave it
  out rather than hand-write one. `@cosyte/synth` 0.0.9 generates no 270 either.
- With `@cosyte/x12` 0.0.18, `AAA` request-validation segments stay on `transaction.segments` and are
  not on the typed model. The count above says a rejection happened; the reject reason code is on the
  `AAA` segment itself.
- The synthetic 271 carries one benefit line: active coverage with an amount and a percent. It has no
  co-payment, co-insurance, deductible or out-of-pocket line, so the cost-sharing path runs only in the
  test. With `@cosyte/synth` 0.0.9 its `EB-08` percent is a whole number (80, 90 or 100), where the
  271 guide defines a decimal fraction (0.8 for 80 percent): read it as a placeholder. It also has no
  `BHT` segment after `ST`, which the 271 guide requires, and `@cosyte/x12` reads it without a
  warning.
- The labels cover seven `EB-01` codes, two `DTP-01` qualifiers (`307`, `291`) and two `REF-01`
  qualifiers (`6P`, `18`). Coverage level, network, time period and any other code print as sent.
  Dependents (Loop 2000D) are on `subscriber.dependents` and are not printed.
- The output shows a subscriber name, member ID and date of birth because the data is synthetic. A
  production service should not write PHI to its logs.

## Synthetic data

The 271 comes from `@cosyte/synth`, which draws every name, member ID, date, NPI and address from
reserved or fictional ranges: the NPI fails its check digit on purpose and the ZIP is `00000`. It is
not real patient data. The cost-sharing test builds its own 271 from fictional values only
(`EXAMPLE PAYER`, `EXAMPLE CLINIC`, `ZZTEST`).

## Versions

The `@cosyte/*` versions are set in [`package.json`](package.json). After changing one, run
`npm install` to refresh `package-lock.json`, then `npm test`.

Need it integrated? [Talk to us](https://cosyte.com/contact).
