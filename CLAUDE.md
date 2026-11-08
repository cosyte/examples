# cosyte/examples

AGENTS.md, imported here, holds the build, the test, the gate, and the data rule. This card adds
what CI does with the gate, the hazard, and the rules that bind here.

@AGENTS.md

## Gate

The gate is the four steps in AGENTS.md. Step 1 is `no-emdash.yml`'s `no-emdash` check and
`claude-card.yml`, which run `@cosyte/script-utils` through npx at one pinned version; keep no gate
script here. On a pull request its `no-emdash-messages` job scans the title, the body, and the
commit messages (the `--stdin` mode), since a squash merge makes them the commit on `main`, and
editing the title or body runs it again. That job is never required: a Dependabot body quotes
upstream release notes, dashes and all.
Steps 2 and 3 are `starters.yml`: every starter on Node 22 and 24, and `All starters` is the one
check that stands for the whole matrix, so a new starter folder is tested with no workflow edit.
`starters.yml` also runs nightly on `main`, from the lockfiles. Step 4 is `actionlint.yml`;
`codeql.yml`, `scorecard.yml`, and `pr-title.yml` (the PR title in Conventional Commits) call the
shared workflows at one published `workflows-*` reference. A new starter also adds its folder to
`.github/dependabot.yml`.

## Hazard: a starter gets copied into production

This repo is public, and a starter exists to be cloned and built on: what it does, an integration
will do with real patients. So the data stays synthetic, as AGENTS.md says, and every pattern must
be safe to copy. The listener binds `127.0.0.1` only; identifiers never reach a log, an error, a
manifest, or a summary meant to be value-free; a check exits nonzero when it fails rather than
printing a result. A change that makes data look more real or a pattern less safe is the risk here,
even when every test is green.

## Rules that bind here

Each names the pull request whose failure proved it.

- Move a starter to a new library version by regenerating its `package-lock.json` from scratch
  (`rm -rf node_modules package-lock.json && npm install`), then check that every `@cosyte` package
  in it resolved to the new line (`npm ls --all`). cli-tour's old lockfile held `@cosyte/fhir`
  0.0.10, which every peer range still accepted, so an in-place install kept it (#8).
- A README says only what its starter runs and its test asserts. #7 dropped a claim that
  `validateResource` checks a Bundle's `urn:uuid` references (it counts them as external), and #10
  narrowed three sentences that said more than the starters show.
