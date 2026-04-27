#!/usr/bin/env bash
#
# verify-retry0.sh — Run vitest N times at retry=0 to characterize stability.
#
# Use this when verifying that the test suite passes reliably without retries
# (per ZF0-1322's "retry: 2 removed" hard requirement). Hand-rolling 10× shell
# loops was repeated across ZF0-1322 attempt 1, ZF0-1333, and ZF0-1354 before
# this script was checked in — file a new ticket if you find yourself writing
# yet another version instead of extending this one.
#
# Usage:
#   scripts/verify-retry0.sh                       # 10× --project browser
#   scripts/verify-retry0.sh --runs 5              # 5× --project browser
#   scripts/verify-retry0.sh --coverage            # 10× full test:coverage
#   scripts/verify-retry0.sh --coverage --runs 3   # 3× full test:coverage
#   scripts/verify-retry0.sh --out /tmp/my-verify  # custom output directory
#
# Output:
#   <out>/run-NN.log        per-iteration full vitest output
#   <out>/summary.txt       pass/fail tally + per-run timing + failing test names
#
# Exit code: 0 if all runs green; 1 if any run failed (caller decides whether
# the failure pattern is a regression or a documented pre-existing flake).
#
# HARD RULE (binding from ZF0-1322 acceptance):
# Do NOT use this script to "tune" retry counts, vi.waitFor timeouts, or
# setTimeout durations to make runs green. Failures must be classified:
#   (a) genuine extraction/regression — fix in the owning sub-issue
#   (b) pre-existing flake — surface as a NEW sub-ticket, do NOT absorb
# Bandaid fixes (retry:N, widened waits) are how ZF0-1322 attempt 1 failed.

set -u

# --- Argument parsing ------------------------------------------------------
runs=10
mode="browser"   # browser | coverage
out=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --runs)
      runs="${2:?--runs requires a number}"
      shift 2
      ;;
    --browser)
      mode="browser"
      shift
      ;;
    --coverage)
      mode="coverage"
      shift
      ;;
    --out)
      out="${2:?--out requires a directory path}"
      shift 2
      ;;
    -h|--help)
      sed -n '2,30p' "$0"
      exit 0
      ;;
    *)
      echo "verify-retry0.sh: unknown argument '$1' (try --help)" >&2
      exit 2
      ;;
  esac
done

if ! [[ "$runs" =~ ^[0-9]+$ ]] || (( runs < 1 )); then
  echo "verify-retry0.sh: --runs must be a positive integer (got '$runs')" >&2
  exit 2
fi

# --- Setup -----------------------------------------------------------------

# Resolve cortex-editor directory from the script location, regardless of cwd.
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
project_dir="$(dirname "$script_dir")"

if [[ ! -f "$project_dir/vitest.config.ts" ]]; then
  echo "verify-retry0.sh: expected vitest.config.ts in $project_dir" >&2
  exit 2
fi

if [[ -z "$out" ]]; then
  out="/tmp/verify-retry0-${mode}-$(date +%Y%m%dT%H%M%S)"
fi
mkdir -p "$out"

summary="$out/summary.txt"
: > "$summary"

case "$mode" in
  browser)
    cmd=(npx vitest run --project browser --retry=0)
    label="browser"
    ;;
  coverage)
    cmd=(npm run test:coverage -- --retry=0)
    label="coverage"
    ;;
esac

# --- Run loop --------------------------------------------------------------

cd "$project_dir"

pass=0
fail=0

{
  echo "verify-retry0.sh: mode=$mode runs=$runs out=$out"
  echo "command: ${cmd[*]}"
  echo "started: $(date -Iseconds)"
  echo
} | tee -a "$summary"

# Padded run index for stable filename sort (run-01.log, run-02.log, ...)
pad=$(( ${#runs} > 2 ? ${#runs} : 2 ))

for i in $(seq 1 "$runs"); do
  printf -v idx "%0${pad}d" "$i"
  log="$out/run-${idx}.log"

  echo "=== Run $idx start: $(date -Iseconds) ===" | tee -a "$summary"

  start=$(date +%s)
  CI=true "${cmd[@]}" > "$log" 2>&1
  rc=$?
  end=$(date +%s)
  dur=$((end - start))

  if (( rc == 0 )); then
    pass=$((pass + 1))
    echo "Run $idx: PASS  (${dur}s)" | tee -a "$summary"
  else
    fail=$((fail + 1))
    echo "Run $idx: FAIL  (${dur}s)  rc=$rc" | tee -a "$summary"
    # Capture the failing-test summary lines (vitest's red FAIL banner +
    # Test Files / Tests counts) so the summary is useful without grepping
    # through full per-run logs.
    grep -E "(FAIL|✗|×|AssertionError|Test Files|Process completed)" "$log" \
      | tail -30 >> "$summary"
    echo "---" >> "$summary"
  fi
done

{
  echo
  echo "TOTAL: ${pass} passed, ${fail} failed (out of ${runs})"
  echo "DONE:  $(date -Iseconds)"
} | tee -a "$summary"

(( fail == 0 ))
