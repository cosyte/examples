---
id: start-a-project-from-a-starter
title: Start a project from a starter
sidebar_label: Start a project from a starter
description: "Copy one starter out of the repository into a project of your own, keep its tests green, and know what to change before real data flows."
---

# Start a project from a starter

A starter is a whole npm project, so it can leave the repository on its own. This copies one out,
proves the copy works, and lists what to change before it carries real data.

## 1. Copy the folder

```bash
git clone https://github.com/cosyte/examples.git
cp -R examples/hl7-mllp-listener my-listener
cd my-listener
```

Copy the whole folder: `package.json`, `package-lock.json`, `src/` and `test/`. The starters are MIT
licensed; keep the copyright notice from the repository's `LICENSE` with your copy.

## 2. Make it yours

In `package.json`, change `name` and `description`. Leave `private: true` unless you mean to
publish it.

## 3. Prove the copy works

```bash
npm ci
npm test
```

`npm ci` installs the exact versions the starter was tested with. `npm test` runs the starter and
asserts its output, so a green run means the copy behaves as it did in the repository.

## 4. Keep the tests on synthetic data

Change the code, and keep the tests passing as you go. Their input comes from `@cosyte/synth`, so
they can run anywhere, including in CI, without real patient data. Keep it that way: real data never
belongs in a test, a fixture or a log.

## 5. Change what the starter leaves to you

Each starter's page has a section, "Before you build on it", that lists what the starter does not
do for production. The ones that come up most:

- **Logs.** Several starters print patient names and identifiers because their data is synthetic.
  Remove those lines, or log only the value-free summaries the libraries give you.
- **The network.** The MLLP listener binds `127.0.0.1` only and speaks plain MLLP. To accept
  connections from other machines, bind another address and turn on TLS.
- **The checks that exit 1.** `deid-hl7` and `dicom-metadata` exit 1 when an identifier survives,
  and `x12-remittance` when the remittance does not balance. Keep those checks in front of whatever
  consumes the output.

## Related

- [How the starters are built](./how-the-starters-are-built.md): why the patterns are safe to copy.
- [Update the libraries in a starter](./update-the-libraries.md), once your copy needs a newer
  release.
