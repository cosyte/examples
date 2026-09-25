# x12-remittance

Summarize a synthetic X12 835 remittance with [`@cosyte/x12`](https://github.com/cosyte/x12): the
payment and its trace number, the payer and payee, each claim with its status, amounts and
adjustments, and a check that recomputes the 835's three balance equations with exact decimal
arithmetic.

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
Synthetic 835 from @cosyte/synth (seed 42):
  ISA*00*          *00*          *ZZ*SYNSUB448      *ZZ*SYNRCV084      *240321*2317*^*00501*441887323*0*T*:~
  GS*HP*SYNSUB448*SYNRCV084*20240321*2317*83976*X*005010X221A1~
  ST*835*7813*005010X221A1~
  BPR*I*926.00*C*ACH************20240321~
  TRN*1*7271155*1633489880~
  N1*PR*MOCK NATIONAL INSURER~
  N3*8640 Placeholder Avenue~
  N4*Synthville*MO*00000~
  REF*2U*SYN90748~
  N1*PE*MOCK CARE ASSOCIATES*XX*5462419363~
  N3*8640 Placeholder Avenue~
  N4*Synthville*MO*00000~
  LX*1~
  CLP*PTACCT320984*1*967.00*926.00*41.00*MB*ICN614202026*11::1~
  NM1*QC*1*Nonesuch*Sampleton****MI*MBR81711168~
  NM1*82*2*MOCK CARE ASSOCIATES*****XX*5462419363~
  DTM*232*20240321~
  DTM*233*20240321~
  SVC*HC:99214:25*967.00*926.00~
  DTM*472*20240321~
  CAS*PR*1*41.00~
  AMT*B6*926.00~
  SE*21*7813~
  GE*1*83976~
  IEA*1*441887323~

Payment (BPR, TRN):
  amount                 926.00 (credit)
  method                 ACH
  date                   2024-03-21
  trace                  7271155, originator 1633489880

Payer: MOCK NATIONAL INSURER (REF 2U SYN90748)
Payee: MOCK CARE ASSOCIATES (XX 5462419363)

Claim PTACCT320984 (payer claim number ICN614202026)
  status                 1 Processed as Primary
  charged                967.00
  paid                   926.00
  patient responsibility 41.00
  claim adjustments      none
  line 1                 HC:99214:25, charged 967.00, paid 926.00
    adjustment           PR 1 41.00: Patient Responsibility, Deductible Amount

Provider-level adjustments (PLB): none

Balance (exact decimal arithmetic):
  balanced        claim PTACCT320984 line 1: 967.00 charged = 926.00 paid + 41.00 adjusted
  balanced        claim PTACCT320984: 967.00 charged = 926.00 paid + 41.00 adjusted
  balanced        payment: 926.00 paid = 926.00 paid on claims - 0.00 provider adjustments

Warnings (parse and 835 reader): 0
```

The same seed gives the same output on every run. In an adjustment line the group code says who
carries the amount (`PR`: the patient) and the reason code, a Claim Adjustment Reason Code (CARC),
says why.

## Test

```bash
npm test
```

The test runs `src/main.js` and checks the payment, claim status, amounts, adjustments and balance
lines it prints against a fresh reading of the same 835. It then splits the 835 into segments by hand,
without the library, and checks the typed reading against the raw `BPR`, `TRN`, `CLP` and `CAS`
segments. Two more tests change the 835 before reading it. Raising `BPR-02` by 1.00 must report the
payment out of balance, and `get835` must warn `X12_835_REMIT_BALANCE_MISMATCH`. Adding a 10.00
provider-level take-back (`PLB`) and lowering `BPR-02` to match must still balance, which pins the
sign: a positive `PLB` amount reduces the payment.

## How it works

1. `generate835({ seed: 42 })` from `@cosyte/synth/x12` builds the remittance through `@cosyte/x12`'s
   own `build835`, which refuses an out-of-balance remit, and `serializeX12` turns it into wire text.
2. `parseX12` reads the interchange, and `get835(interchange.delimiters, transaction)` returns the
   typed 835: the `BPR` payment, the `TRN` trace, the payer and payee, each `CLP` claim with its `CAS`
   adjustments and `SVC` service lines, and any `PLB` provider-level adjustments. Every amount is an
   `X12Decimal`, never a float, and an amount the sender left out reads `undefined`, not zero.
3. The claim status description (`CLP-02`) and each adjustment reason (`CAS`, a CARC) come from the
   code snapshots `@cosyte/x12` bundles, on `claim.claimStatusDescription` and
   `adjustment.reasonDescription`. The names of the four group codes come from a short table in
   `src/remittance.js`, taken from `@cosyte/x12`'s documentation of `CLAIM_ADJUSTMENT_GROUP_CODES`:
   the package exports the codes, not their names.
4. `balanceChecks` recomputes the three equations with `X12Decimal` arithmetic:
   - service line: `SVC-02` charge = `SVC-03` payment + the line's adjustments
   - claim: `CLP-03` charge = `CLP-04` payment + every adjustment on the claim and its lines
   - payment: `BPR-02` = the sum of `CLP-04` - the sum of the `PLB` amounts

   An amount that did not decode makes its equation "not evaluable" instead of counting as zero.
   `get835` runs the same three equations and reports a failure on its `warnings`.
5. `src/main.js` exits 1 when an equation does not balance: a check you can keep in front of posting.

The code is in [`src/remittance.js`](src/remittance.js) and [`src/main.js`](src/main.js).

## Limits

- With `@cosyte/synth` 0.0.9 the 835 carries one claim with one service line, one
  patient-responsibility adjustment and no provider-level adjustment, so the `PLB` term here is
  0.00. The test adds a `PLB` to exercise it.
- The synthetic 835 is built to exercise the reader, not to pass a trading partner's edits. For
  example it names `ACH` as the payment method without the bank routing elements that go with it, and
  the payer and payee share one address.
- Descriptions come from the subsets `@cosyte/x12` bundles. A claim status or CARC outside them
  prints as the code with "(no bundled description)". Remark codes (`LQ`, `MOA`), supplemental
  amounts (`AMT`) and service dates are on the model and are not printed.
- The balance check says whether the 835 adds up. It does not check the amounts against your contract
  or against the claim you sent.
- The output shows the raw 835, which includes a patient name and member ID because the data is
  synthetic. A production service should not write PHI to its logs.

## Synthetic data

The 835 comes from `@cosyte/synth`, which draws every name, identifier, date and amount from reserved
or fictional ranges: the NPIs fail their check digit on purpose and the ZIPs are `00000`. It is not
real patient data. Two tests change that synthetic 835 in memory; no fixture is committed.

## Versions

The `@cosyte/*` versions are set in [`package.json`](package.json). After changing one, run
`npm install` to refresh `package-lock.json`, then `npm test`.

Need it integrated? [Talk to us](https://cosyte.com/contact).
