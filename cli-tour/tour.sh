#!/usr/bin/env bash
# A tour of the `cosyte` command from @cosyte/cli over a synthetic HL7 v2 admit message:
# parse, inspect, validate, convert to FHIR R4 and de-identify. Each step prints the command it
# runs, what the CLI printed, and the exit code. Run it with `npm start`, or `bash tour.sh` after
# `npm install`.
set -euo pipefail

cd "$(dirname "$0")"

# `npm start` puts node_modules/.bin on PATH. We do the same so `bash tour.sh` also runs the
# `cosyte` that `npm install` put there, never a global one.
PATH="$PWD/node_modules/.bin:$PATH"
export PATH

OUT="out"
ADT="$OUT/adt-a01.hl7"
PARSED="$OUT/adt-a01.parsed.json"
BUNDLE="$OUT/adt-a01.fhir.json"
REDACTED="$OUT/adt-a01.redacted.hl7"
PREVIEW_LINES=27

# Print a step heading, with a blank line before every heading but the first.
headings=0
heading() {
  if [ "$headings" -gt 0 ]; then echo; fi
  headings=$((headings + 1))
  echo "== $1"
}

# Print a command the way you would type it, run it, then print its exit code. The CLI's stderr
# joins stdout, so its value-free notes appear where a terminal shows them. A non-zero exit stops
# the tour with that code.
run() {
  echo "\$ $*"
  local status=0
  "$@" 2>&1 || status=$?
  echo "exit $status"
  return "$status"
}

# The same, with the command's stdout saved to the file named first. stderr stays on screen.
run_to() {
  local file="$1"
  shift
  echo "\$ $* > $file"
  local status=0
  "$@" 2>&1 >"$file" || status=$?
  echo "exit $status"
  return "$status"
}

heading "The CLI: cosyte from node_modules/.bin"
run cosyte --version

heading "Synthetic input from @cosyte/synth"
run node src/make-fixtures.js "$OUT"

heading "1. parse: detect the format and write the message as typed JSON"
run_to "$PARSED" cosyte parse "$ADT"
echo "The first $PREVIEW_LINES of $(wc -l <"$PARSED" | tr -d ' ') lines of $PARSED:"
head -n "$PREVIEW_LINES" "$PARSED"

heading "2. inspect: a value-free summary of the same message"
run cosyte inspect "$ADT"

heading "3. validate: the exit code is the verdict (0 valid, 1 invalid, 65 unparseable)"
run cosyte validate "$ADT"

heading "4. convert: HL7 v2 to a FHIR R4 message Bundle, value-free findings on stderr"
run_to "$BUNDLE" cosyte convert "$ADT" --to fhir

heading "5. inspect: the shape of the converted Bundle"
run cosyte inspect "$BUNDLE"

heading "6. redact: a de-identified copy via @cosyte/deid (exit 1, and no copy, if it blocks a locus)"
run_to "$REDACTED" cosyte redact "$ADT"
echo "The de-identified message in $REDACTED:"
tr '\r' '\n' <"$REDACTED" | sed -e '/^$/d' -e 's/^/  /'
