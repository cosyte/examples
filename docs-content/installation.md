---
id: installation
title: Installation
sidebar_label: Installation
description: "What the starters need, Node.js 22 or later and npm, and how to clone them and install one from its lockfile."
---

# Installation

There is nothing to install at the top of the repository: each starter is its own npm project, and
you install the one you want to run.

## What you need

- **Node.js 22 or later**, with the npm it ships. CI runs every starter on Node 22 and 24.
- **git**, to clone the repository.
- **bash**, for the `cli-tour` starter only: its `npm start` runs `bash tour.sh`.

No database, no account and no network beyond localhost: the starters generate their synthetic input
at run time.

## Get the starters

```bash
git clone https://github.com/cosyte/examples.git
cd examples
```

## Install one starter

```bash
cd deid-hl7    # any starter
npm ci
```

`npm ci` installs exactly the versions in the starter's committed `package-lock.json`, the ones CI
tested. `npm install` works too, and may move a package within the range its `package.json` allows.

Each starter sets its own `@cosyte/*` versions in its `package.json`, so two starters can be on
different releases of a library. To move one to a newer release, see
[Update the libraries in a starter](./update-the-libraries.md).

## Next

Run it: the [Quickstart](./quickstart.md).
