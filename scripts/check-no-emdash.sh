#!/usr/bin/env bash
# scripts/check-no-emdash.sh
# Brand rule: Cosyte never uses the em dash (U+2014), and this repository also
# refuses the en dash (U+2013), in any tracked file and in any pull request
# title, body or commit message. Source of truth:
# knowledgebase/06-brand/voice-and-tone.md. Rewrite with a period, a colon, a
# comma, parentheses or a plain hyphen.
#
# Usage:
#   bash scripts/check-no-emdash.sh                  scan every tracked file
#   bash scripts/check-no-emdash.sh --stdin <label>  scan standard input
#
# It needs no install, so it runs on a bare checkout. It refuses to report green
# when the scanner cannot see a known dash or when the scan read nothing.

set -euo pipefail

# LOCALE PIN, load-bearing. `grep -P` compiles `\x{NNNN}` as a Unicode codepoint only
# in PCRE's UTF-8 mode, which GNU grep enables from the locale. Under LC_CTYPE=POSIX
# (a bare container, cron, `sh -c`, any shell that inherits no locale) GNU grep 3.8
# instead ABORTS with "character code point value in \x{} or \o{} is too large".
# The version this lineage was ported from discarded that on stderr and `|| true`d the
# pipeline, so it printed OK having scanned nothing. Do not remove the pin, and do not
# restore the stderr redirect.
#
# The pin cannot be traded for a raw-byte pattern: `\xe2\x80\x94` matches the em dash
# under POSIX but NOT under a UTF-8 locale, where PCRE reads it as three characters.
# One pattern cannot cover both, so the locale is fixed and the pattern follows it.
export LC_ALL=C.UTF-8

# Matches U+2014 as the literal character and as its encodings: %E2%80%94 (URL),
# the JS backslash-u escape, and the &mdash; / &#8212; / &#x2014; HTML entities.
PATTERN='\x{2014}|\x{2013}|%E2%80%94|%E2%80%93|\\u2014|\\u2013|&mdash;|&ndash;|&#8212;|&#8211;|&#x2014;|&#x2013;'

# SELF-TEST: prove the scanner can still see what it is meant to catch before any
# clean result is believed. `printf` emits U+2014 as its UTF-8 bytes, so this file
# still never contains the literal character.
if ! printf 'a\xe2\x80\x94b\n' | grep -qP "$PATTERN" || ! printf 'a\xe2\x80\x93b\n' | grep -qP "$PATTERN"; then
  echo "ERROR: check-no-emdash - the scanner cannot match a known dash." >&2
  echo "       grep -P is unavailable or not in UTF-8 mode (LC_ALL=${LC_ALL})." >&2
  echo "       Refusing to report a clean tree on a scanner that cannot see." >&2
  exit 1
fi

fail_with_hits() {
  local what="$1" hits="$2"
  echo "$hits" >&2
  echo "" >&2
  echo "ERROR: check-no-emdash - em or en dash (U+2014, U+2013, or an encoded form) found in ${what}." >&2
  echo "       Cosyte never uses em or en dashes (06-brand/voice-and-tone.md)." >&2
  echo "       Rewrite with a period, colon, comma, or parentheses." >&2
  exit 1
}

# Anything the scanner writes to stderr means it did not read everything it was
# given, and an incomplete scan must never print OK. Both modes route grep's stderr
# here and refuse to continue if it is non-empty, because exit status cannot carry
# that signal: grep exits 1 on "no match", which xargs in turn reports as 123, so
# "clean" and "died part way through the batch" are indistinguishable by code.
ERRLOG=$(mktemp)
FILELIST=$(mktemp)
trap 'rm -f "$ERRLOG" "$FILELIST"' EXIT

refuse_if_incomplete() {
  [ -s "$ERRLOG" ] || return 0
  cat "$ERRLOG" >&2
  echo "" >&2
  echo "ERROR: check-no-emdash - the scan reported errors, so it did not read all of" >&2
  echo "       its input. Refusing to report green from an incomplete scan." >&2
  exit 1
}

# ---- stdin mode: text that is not a file (commit messages, PR title and body) ----
if [ "${1:-}" = "--stdin" ]; then
  LABEL="${2:-stdin}"
  HITS=$(grep -nP -e "$PATTERN" - 2>>"$ERRLOG" || true)
  refuse_if_incomplete
  [ -n "$HITS" ] && fail_with_hits "$LABEL" "$HITS"
  echo "check-no-emdash: OK (no em or en dashes in ${LABEL})"
  exit 0
fi

# ---- default mode: every tracked file ----
#
# `git ls-files` is relative to the working directory, so from a subdirectory it
# lists a subtree and the scan would report OK having skipped the rest of the repo.
# Anchor at the top level, which also keeps the self-exclusion path below correct.
cd "$(git rev-parse --show-toplevel)"

# Four things this does deliberately, all of them closing a way for the scan to
# report green without having looked:
#
#   -0 -r on xargs, fed by `git ls-files -z`: -r drops the grep invocation entirely
#   when the file list is empty (without it, grep falls back to reading stdin and
#   prints OK), and the NUL separator is what makes the list verbatim. Unseparated,
#   `git ls-files` C-quotes any path holding a space, a quote, or a non-ASCII byte,
#   and grep is then handed a name no file has.
#
#   the file list is built as its own command, not as the head of the pipeline, so a
#   `git ls-files` that fails (an unreadable or corrupt index) stops the run. Piped,
#   its status is erased by the `|| true` the no-match case needs, and the scan would
#   report OK over an empty list. An empty list is refused for the same reason.
#
#   -e before the pattern and -- after the file list, so neither a pattern nor a
#   tracked filename that starts with a dash is read as a grep option. A file named
#   `-q` would otherwise silence the whole batch and the gate would print OK.
#
#   no -I: -I skips any file grep reads as binary, which includes a text file holding
#   invalid UTF-8, so an em dash inside one would be skipped silently. This repo is
#   markdown and a licence today, with no binaries at all. Losing -I makes a future
#   binary a loud false positive (grep prints "Binary file X matches", the gate goes
#   red, a human looks) instead of a silent miss. Fail closed, not open.
#
#   KNOWN LIMIT, inherited from the hl7 copy and restated rather than dropped. The
#   pattern above matches U+2014 as UTF-8 and as the five textual encodings listed
#   with it. It does NOT match an em dash encoded in some other charset (CP1252 0x97,
#   UTF-16). Such a file scans clean and this gate stays GREEN: GNU grep does classify
#   it as binary, but only surfaces that as the "binary file matches" diagnostic when
#   the pattern actually matches, and a UTF-8 pattern never matches a CP1252 byte, so
#   nothing reaches refuse_if_incomplete. There is none today (both tracked files
#   decode as UTF-8). This is accepted rather than fixed: the ban is a rule about prose
#   that people write, and fixture bytes are grounded data, not brand copy. Do not
#   widen the pattern to chase it, and do not re-add -I. A UTF-8 em dash on another
#   line of the same file is still caught normally.
git ls-files -z > "$FILELIST"

if [ ! -s "$FILELIST" ]; then
  echo "ERROR: check-no-emdash - no tracked files to scan. Refusing to report green" >&2
  echo "       from a scan that read nothing." >&2
  exit 1
fi

HITS=$(grep -zv -e '^scripts/check-no-emdash\.sh$' < "$FILELIST" |
  xargs -0 -r grep -d skip -nP -e "$PATTERN" -- 2>>"$ERRLOG" || true)

refuse_if_incomplete

[ -n "$HITS" ] && fail_with_hits "the tracked files listed above" "$HITS"

echo "check-no-emdash: OK (no em or en dashes in the tracked files; this script is excluded)"
