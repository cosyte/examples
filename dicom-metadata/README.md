# dicom-metadata

Read the patient, study and series metadata of a synthetic DICOM Part 10 file with
[`@cosyte/dicom`](https://github.com/cosyte/dicom), then de-identify the header with
[`@cosyte/deid`](https://github.com/cosyte/deid) and print the value-free manifest of what it changed.

Libraries: [`@cosyte/dicom`](https://github.com/cosyte/dicom), [`@cosyte/deid`](https://github.com/cosyte/deid).

## Run it

```bash
npm install
npm start
```

Node 22 or later. The synthetic file is built in memory on every run; nothing is written to disk.

## Expected output

```text
Synthetic CT header (804 bytes of DICOM Part 10, built in memory):
  Transfer syntax      1.2.840.10008.1.2.1 (Explicit VR Little Endian)
  SOP class            1.2.840.10008.5.1.4.1.1.2 (CT Image Storage)
  SOP instance UID     2.25.180278240445437908828124246322305359710
  Patient name         ZZTEST^SYNTHETIC
  Patient ID           ZZTEST-0001 (issuer EXAMPLE.ORG)
  Birth date           1970-01-01
  Sex                  O
  Study instance UID   2.25.10155276760012127015659500753591548111
  Study date           2020-01-02
  Accession number     ZZACC0001
  Modality             CT
  Series instance UID  2.25.91500837647300718321059351149439276398
  Parse warnings       none

De-identified header (962 bytes, read back from the written file):
  (0008,0016) SOPClassUID                              1.2.840.10008.5.1.4.1.1.2
  (0008,0018) SOPInstanceUID                           2.25.86704070274506178779869117891871399775162034538788250112726
  (0008,0020) StudyDate                                (empty)
  (0008,0030) StudyTime                                (empty)
  (0008,0050) AccessionNumber                          (empty)
  (0008,0060) Modality                                 CT
  (0008,0090) ReferringPhysicianName                   (empty)
  (0010,0010) PatientName                              (empty)
  (0010,0020) PatientID                                (empty)
  (0010,0030) PatientBirthDate                         (empty)
  (0010,0040) PatientSex                               (empty)
  (0012,0062) PatientIdentityRemoved                   YES
  (0012,0063) DeidentificationMethod                   Cosyte @cosyte/deid, PS3.15 Basic Application Level Confidentiality Profile (metadata only); policy "safe-harbor"
  (0012,0064) DeidentificationMethodCodeSequence       (sequence, 1 item)
  (0020,000D) StudyInstanceUID                         2.25.27220899364256410842694272346482303969957183573538923698291
  (0020,000E) SeriesInstanceUID                        2.25.76808116996479560595985857159634965361995450169669996222346
  (0020,0010) StudyID                                  (empty)
  (0020,0011) SeriesNumber                             1
  (0020,0013) InstanceNumber                           1
  (0028,0303) LongitudinalTemporalInformationModified  REMOVED

Manifest (value-free: locus, category, transform, disposition, code):
  (0008,0018) SOP Instance UID           OTHER_UNIQUE_ID pseudonymize transformed DEID_CATEGORY_PSEUDONYMIZED
  (0008,0020) Study Date                 DATES           redact       removed     DEID_CATEGORY_REMOVED
  (0008,0030) Study Time                 DATES           redact       removed     DEID_CATEGORY_REMOVED
  (0008,0050) Accession Number           OTHER_UNIQUE_ID redact       removed     DEID_CATEGORY_REMOVED
  (0008,0080) Institution Name           GEOGRAPHIC      redact       removed     DEID_CATEGORY_REMOVED
  (0008,0090) Referring Physician's Name NAMES           redact       removed     DEID_CATEGORY_REMOVED
  (0008,1030) Study Description          OTHER_UNIQUE_ID redact       removed     DEID_CATEGORY_REMOVED
  (0008,103e) Series Description         OTHER_UNIQUE_ID redact       removed     DEID_CATEGORY_REMOVED
  (0010,0010) Patient's Name             NAMES           redact       removed     DEID_CATEGORY_REMOVED
  (0010,0020) Patient ID                 MRN             redact       removed     DEID_CATEGORY_REMOVED
  (0010,0021) Issuer of Patient ID       MRN             redact       removed     DEID_CATEGORY_REMOVED
  (0010,0030) Patient's Birth Date       DATES           redact       removed     DEID_CATEGORY_REMOVED
  (0010,0040) Patient's Sex              OTHER_UNIQUE_ID redact       removed     DEID_CATEGORY_REMOVED
  (0020,000d) Study Instance UID         OTHER_UNIQUE_ID pseudonymize transformed DEID_CATEGORY_PSEUDONYMIZED
  (0020,000e) Series Instance UID        OTHER_UNIQUE_ID pseudonymize transformed DEID_CATEGORY_PSEUDONYMIZED
  (0020,0010) Study ID                   OTHER_UNIQUE_ID redact       removed     DEID_CATEGORY_REMOVED

Warnings from the de-identification pass: DICOM_DEIDENT_METHOD_VALUE_OVER_LENGTH
Burned-in annotation hazard: no
UIDs remapped: 3 (the map links output to source: keep it private)

Input identifiers checked: 12
Found in the de-identified file: 0
Found in the manifest: 0
```

The output is the same on every run: the synthetic UIDs come from fixed names, and `@cosyte/dicom`
derives each replacement UID from its source UID. The patient attributes are emptied, Institution
Name, Issuer of Patient ID and the two descriptions are removed, and the Study, Series and SOP
Instance UIDs are replaced. The pass records itself in `(0012,0062)`, in the text of `(0012,0063)`
and as the code `113100` (Basic Application Confidentiality Profile) in `(0012,0064)`, and it sets
Longitudinal Temporal Information Modified `(0028,0303)` to `REMOVED`, which tells a receiver the
dates and times were removed.

## Test

```bash
npm test
```

The test runs `src/main.js` and checks the metadata lines against the values parsed from the synthetic
file. It then de-identifies the header in process and checks that no identifying value from the input
appears in the written file or in the manifest, that each UID is replaced and recorded in the shared
UID map, and that the manifest names the category of the patient name, ID and birth date. Last, it
checks that the pass records itself as text and as a code, marks the dates removed, and writes the
data set in ascending tag order.

## How it works

1. `syntheticCtHeader()` in `src/part10.js` writes a small Part 10 file: the 128-byte preamble, `DICM`,
   the File Meta group naming Explicit VR Little Endian, then 20 patient, study, series and instance
   attributes and no Pixel Data. `@cosyte/dicom` reads and re-writes Part 10, but it has no public API
   for building a new object, so the starter writes these bytes itself.
2. `parseDicom(bytes)` from `@cosyte/dicom` parses the file. `readMetadata` reads it through the typed
   views (`fileMeta`, `patient`, `study`, `series`, `image`), which leave a missing value `undefined`
   rather than substituting a default, and `Dictionary.uid` names the transfer syntax and SOP class.
3. `deidentifyDicom(dataset, { uidMap })` from `@cosyte/deid/dicom` applies the PS3.15 Annex E Basic
   Application Level Confidentiality Profile that `@cosyte/dicom` implements, and folds its report into
   the value-free manifest `@cosyte/deid` produces for every format. The input dataset is not changed.
4. `serializeDicom` from `@cosyte/dicom` writes the de-identified dataset back to Part 10, and
   `parseDicom` reads those bytes again, so the header we print is the one a recipient would read.
5. `src/main.js` ends with a check you can keep in your own pipeline: every identifying value read from
   the input is searched for in the written bytes and in the manifest, and the process exits 1 if one
   is found.

Share one `uidMap` across every file of a study, so the replacement UIDs agree from file to file. The
map pairs each source UID with its replacement, which links the output back to the source: keep it
private.

The code is in [`src/part10.js`](src/part10.js), [`src/dicom.js`](src/dicom.js) and
[`src/main.js`](src/main.js).

## Limits

- The output is transformed per the configured Safe Harbor policy. It is not certified as
  de-identified.
- This is metadata-only de-identification: pixels are never inspected. The synthetic object has no Pixel
  Data. For an object whose Pixel Data is not marked `BurnedInAnnotation` `NO`,
  `burnedInAnnotationHazard` is `true`: do not release it before a pixel-capable review.
- With `@cosyte/deid` 0.1.0, the De-identification Method text written to `(0012,0063)` is 113
  characters, longer than the 64 an `LO` value allows, so `@cosyte/dicom` reports
  `DICOM_DEIDENT_METHOD_VALUE_OVER_LENGTH`. A receiver that enforces the length may reject that
  attribute. The coded method in `(0012,0064)` names the same profile within the length limits.
- The replacement UIDs are `2.25.` followed by 59 digits of a SHA-256 hash, while PS3.5 section B.2
  describes a `2.25` UID as a 128-bit UUID of at most 39 digits. To place them under a UID root your
  organization owns, pass it as `uidRoot` to `deidentifyDicom`.

## Synthetic data

Every value in the file is invented: names such as `ZZTEST^SYNTHETIC`, an `EXAMPLE.ORG` issuer,
placeholder dates, and UIDs derived from name-based (version 5) UUIDs under the `2.25` root. It is not
real patient data, and the file is built at run time rather than committed.

## Versions

The `@cosyte/*` versions are set in [`package.json`](package.json). After changing one, run
`npm install` to refresh `package-lock.json`, then `npm test`.

Need it integrated? [Talk to us](https://cosyte.com/contact).
