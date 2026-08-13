#!/usr/bin/env bash
# tools/restamp.sh — the cache-bust restamp, scope DISCOVERED not declared.
#
# AGENTS.md §6 amendment (2026-08-12), change 3: never name the shells.
#   1. glob every tracked *.html, excluding mockups/
#   2. keep the ones containing a ?v= query string — those ARE the shells
#   3. stamp all of them in one commit
#   4. accept only if every file the glob returned carries ONE identical value
#
# docs/RESTAMP_SPEC.md §6 correction 1: js/version.js is NOT part of acceptance.
# BUILD tracks the last DEPLOYED-ASSET commit and is allowed to differ.
# Bumping it is opt-in via --bump-build.
#
# Usage:
#   tools/restamp.sh                 # dry run against the current branch tip
#   tools/restamp.sh --target cd73b68
#   tools/restamp.sh --apply         # write files (does not commit)
#   tools/restamp.sh --apply --bump-build
#
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

TARGET=""
APPLY=0
BUMP_BUILD=0
while [ $# -gt 0 ]; do
  case "$1" in
    --target) TARGET="${2:-}"; shift 2 ;;
    --apply) APPLY=1; shift ;;
    --bump-build) BUMP_BUILD=1; shift ;;
    *) echo "unknown arg: $1" >&2; exit 2 ;;
  esac
done

[ -n "$TARGET" ] || TARGET="$(git rev-parse --short=7 HEAD)"
case "$TARGET" in
  [0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f]) ;;
  *) echo "FAIL: target '$TARGET' is not a 7-char lowercase hex sha" >&2; exit 1 ;;
esac

# --- step 1+2: discover the shells -------------------------------------------
mapfile -t SHELLS < <(
  git ls-files '*.html' \
    | grep -v '^mockups/' \
    | while IFS= read -r f; do
        if grep -q '?v=' "$f"; then printf '%s\n' "$f"; fi
      done
)

if [ "${#SHELLS[@]}" -eq 0 ]; then
  echo "FAIL: glob returned no shells — that cannot be right" >&2
  exit 1
fi

# --- guard: every ?v= must be a 7-hex stamp we know how to move ---------------
STRAY=0
for f in "${SHELLS[@]}"; do
  while IFS= read -r bad; do
    [ -n "$bad" ] || continue
    echo "FAIL: non-standard stamp in $f -> $bad" >&2
    STRAY=1
  done < <(grep -o '?v=[^"'"'"' >]*' "$f" | grep -vE '^\?v=[a-f0-9]{7}$' || true)
done
[ "$STRAY" -eq 0 ] || { echo "refusing to run: unrecognised ?v= forms above" >&2; exit 1; }

# --- census before ------------------------------------------------------------
echo "target stamp: $TARGET"
echo
printf '%-26s %5s  %s\n' FILE TAGS "STAMPS BEFORE"
TOTAL=0
for f in "${SHELLS[@]}"; do
  n=$(grep -o '?v=[a-f0-9]\{7\}' "$f" | wc -l | tr -d ' ')
  v=$(grep -o '?v=[a-f0-9]\{7\}' "$f" | sort -u | tr '\n' ' ')
  printf '%-26s %5d  %s\n' "$f" "$n" "$v"
  TOTAL=$((TOTAL + n))
done
printf '%-26s %5d  (%d shells discovered)\n' TOTAL "$TOTAL" "${#SHELLS[@]}"
echo

if [ "$APPLY" -eq 0 ]; then
  echo "DRY RUN — no files written. Diff that would be produced:"
  echo
  tmp=$(mktemp -d)
  trap 'rm -rf "$tmp"' EXIT
  for f in "${SHELLS[@]}"; do
    mkdir -p "$tmp/$(dirname "$f")"
    sed 's/?v=[a-f0-9]\{7\}/?v='"$TARGET"'/g' "$f" > "$tmp/$f"
    diff -u "$f" "$tmp/$f" | sed "s|^--- .*|--- a/$f|; s|^+++ .*|+++ b/$f|" || true
  done
  echo
  echo "(re-run with --apply to write)"
  exit 0
fi

# --- step 3: stamp ------------------------------------------------------------
for f in "${SHELLS[@]}"; do
  sed -i 's/?v=[a-f0-9]\{7\}/?v='"$TARGET"'/g' "$f"
done

if [ "$BUMP_BUILD" -eq 1 ]; then
  sed -i "s/var BUILD='[a-f0-9]\{7\}'/var BUILD='$TARGET'/" js/version.js
  grep -q "var BUILD='$TARGET'" js/version.js || { echo "FAIL: version.js bump did not take" >&2; exit 1; }
fi

# --- step 4: acceptance -------------------------------------------------------
echo "acceptance check:"
FAIL=0
AFTER_TOTAL=0
for f in "${SHELLS[@]}"; do
  vals=$(grep -o '?v=[a-f0-9]\{7\}' "$f" | sort -u)
  n=$(grep -o '?v=[a-f0-9]\{7\}' "$f" | wc -l | tr -d ' ')
  AFTER_TOTAL=$((AFTER_TOTAL + n))
  if [ "$vals" != "?v=$TARGET" ]; then
    echo "  FAIL $f -> $(echo "$vals" | tr '\n' ' ')" >&2
    FAIL=1
  else
    printf '  ok   %-26s %3d tags @ %s\n' "$f" "$n" "$TARGET"
  fi
done

if [ "$AFTER_TOTAL" -ne "$TOTAL" ]; then
  echo "FAIL: tag count changed $TOTAL -> $AFTER_TOTAL" >&2
  FAIL=1
fi

[ "$FAIL" -eq 0 ] || { echo "ACCEPTANCE FAILED — do not commit" >&2; exit 1; }

echo
echo "ACCEPTED: ${#SHELLS[@]} shells, $AFTER_TOTAL tags, one value ($TARGET)."
echo "Suggested commit message body (real per-file numbers, per RESTAMP_SPEC §4.4):"
for f in "${SHELLS[@]}"; do
  printf '  %s %s\n' "$(grep -o '?v=[a-f0-9]\{7\}' "$f" | wc -l | tr -d ' ')" "$f"
done
