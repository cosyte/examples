# x12-eligibility

Read the plan and coverage facts out of a synthetic X12 271 eligibility response with
[`@cosyte/x12`](https://github.com/cosyte/x12): who answered, who is covered, the group number, the
trace to match against your 270, and each benefit line with its service types, coverage level,
amount, and percent. Then build the 270 inquiry that the 271 answers, and match the two by their
trace.

It prints no value that identifies the member, synthetic as it is: for the name, member ID, date of
birth, group number, and trace it prints whether each is there, or the precision of a date, and for
the interchanges only their segment IDs. `src/main.js` reads the member's values into variables, with
their synthetic values in comments, to show what each holds. Payers and providers are named only
when they are organizations (`NM1-02` is `2`).

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

The same seed gives the same output on every run. The payer is the information source (Loop 2100A),
the provider is the information receiver (Loop 2100B), and the `270 traces` are the values the payer
echoes from your inquiry so you can match the answer to the question. The 270 at the end is that
inquiry: the provider asks the payer about the member for service type 30, and the 271 carries its
trace back.

## Test

```bash
npm test
```

The test runs `src/main.js` and checks the payer, the lines for the member, the benefit lines,
coverage status, and 270 trace it prints against a fresh reading of the same 271, and that the output
holds no value that identifies the member and no segment of the 271 or the 270. It then splits the
271 into segments by hand, without the library, and checks each value the typed reader returned
against the raw `NM1`, `REF`, `TRN`, and `EB` segments. A third test builds a small 271 with
co-payment, deductible, and co-insurance lines through `build271` and checks their labels, and that
each amount and percent stays exactly as sent. A fourth reads the built 270 back with
`get270Inquiry` and checks its envelope, header, parties, member, service type, and trace against
the 271 and the raw segments. The last turns the synthetic 271 into a rejection, an `AAA` segment in
place of the benefit line, and checks that it reads as a rejection with its codes, not as a member
with no benefits.

## Integration tests

`npm test` also runs the fast integration tests, `test/integration/*.fast.test.js`. `npm run test:full`
runs every test, the seed sweeps in `test/integration/*.full.test.js` included, and fails unless the
helpers in `test/integration/support.js` are fully covered. They call the libraries' public APIs only,
on synthetic data.

- For each seed, the synthetic 271 and the 270 the starter builds for it both parse with no warning
  and serialize back to the same text, the typed readers raise no warning, and the 270 asks about
  the member and the trace the 271 answers.
- The full suite runs the same checks over 300 seeds.

## How it works

1. `generate271({ seed: 42 })` from `@cosyte/synth/x12` builds the response through `@cosyte/x12`'s
   own `build271`, and `serializeX12` turns it into wire text.
2. `parseX12` reads the interchange. The delimiters come from the ISA, and a tolerated deviation
   arrives on `warnings` with a stable code instead of an exception.
3. `get271Eligibility(interchange.delimiters, transaction)` returns the typed 271: each subscriber
   with its payer, provider, name, member ID, `REF`, `DTP`, and `TRN` rows, and its `EB` benefit
   lines, plus `aaaConditions`, one for each `AAA` segment in which the payer says it could not
   process the inquiry. Amounts and percents are `X12Decimal`, never a float, and each service type
   code comes with its description from the snapshot the package bundles.
4. `describeSubscriber` in `src/eligibility.js` turns that into the facts a front desk asks for. It
   labels the seven `EB-01` benefit types it knows (active coverage, inactive, co-insurance,
   co-payment, deductible, out of pocket, non-covered) and prints any other code as sent. Coverage
   status comes from `EB-01` codes 1 to 8, cost sharing from `A`, `B`, `C`, and `G`. `src/main.js`
   prints each date's precision from its format qualifier (`D8` a day, `RD8` a range of days);
   `formatDate` in `src/eligibility.js` reads a `D8` day as `YYYY-MM-DD` through `toISO` when you
   need the value itself.
5. The `AAA` conditions tell a rejected inquiry from a member with no benefit lines, since both come
   back with no benefits. `describeRejection` prints each one with the payer's reject reason
   (`AAA-03`) and follow-up action (`AAA-04`) codes as sent.
6. `inquiryFor` builds the 270 with `build270`: the provider (information receiver) asks the payer
   (information source) about the member, for service type `30` (health benefit plan coverage),
   under the trace the 271 echoes (`TRN-02`) and a `TRN-03` naming who assigned it. `build270`
   writes the `BHT` header and the `HL` hierarchy itself, and refuses a spec it cannot emit
   spec-clean. `readInquiry` reads the 270 back with `get270Inquiry`, and `src/main.js` checks that
   the 271 echoes its trace. In your integration the order runs the other way: you build and send
   the 270, keep its trace, and match the 271 that comes back.

The code is in [`src/eligibility.js`](src/eligibility.js) and [`src/main.js`](src/main.js).

## Limits

- On the 0.1 line, `@cosyte/synth` writes no 270, so the starter builds the 270 from the parties,
  member, and trace of the synthetic 271, and the trace matches by construction. The 271 echoes
  `TRN-02` but no `TRN-03`, so the match here is on `TRN-02` alone.
- On the 0.1 line, `@cosyte/x12` bundles no descriptions for `AAA` codes (the package has no
  permission to redistribute them), so a rejection prints its codes as sent, and each code also
  raises an `X12_271_AAA_UNKNOWN_CODE` warning.
- The synthetic 271 carries one benefit line: active coverage with an amount and a percent. It has
  no co-payment, co-insurance, deductible, or out-of-pocket line, so the cost-sharing path runs only
  in the test. On the 0.1 line of `@cosyte/synth`, its `EB-08` percent is a whole number (80, 90, or
  100), where the 271 guide defines a decimal fraction (0.8 for 80 percent): read it as a
  placeholder. It also has no `BHT` segment after `ST`, which the 271 guide requires: `build271` in
  `@cosyte/x12` on the 0.1 line, which synth builds through, writes none, and `get271Eligibility`
  reads the 271 without a warning. The 270 has one, because `build270` writes it.
- The labels cover seven `EB-01` codes, two `DTP-01` qualifiers (`307`, `291`), and two `REF-01`
  qualifiers (`6P`, `18`). Coverage level, network, time period, and any other code print as sent.
  Dependents (Loop 2000D) are on `subscriber.dependents` and are not printed.
- The output says whether a subscriber name, member ID, and date of birth are there and never prints
  them, synthetic as they are. A production service should not write PHI to its logs either.

## Synthetic data

The 271 comes from `@cosyte/synth`, which draws every name, member ID, date, NPI, and address from
reserved or fictional ranges: the NPI fails its check digit on purpose and the ZIP is `00000`. It is
not real patient data. The cost-sharing test builds its own 271 from fictional values only
(`EXAMPLE PAYER`, `EXAMPLE CLINIC`, `ZZTEST`). The 270 reuses the synthetic 271's values; its
control numbers, its `BHT-03` reference (`SYNTHREQ0001`), and its `TRN-03` originator (`9SYNTHETIC`)
are ours and fictional. The rejection test changes the synthetic 271 in memory; no fixture is
committed.

## Versions

The `@cosyte/*` versions are set in [`package.json`](package.json). After changing one, run
`npm install` to refresh `package-lock.json`, then `npm test`.

Need it built, or hosted and run for you? [Talk to us](https://cosyte.com/integration-services?utm_source=github&utm_medium=readme&utm_campaign=evergreen&utm_content=examples).
