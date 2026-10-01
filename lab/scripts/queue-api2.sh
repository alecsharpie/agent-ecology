#!/bin/sh
# Gemma follow-ups: individual baseline, more seeds (collective bias), tipping from seed 0.
set -u
cd "$(dirname "$0")/.."
until grep -q "=== queue-api finished" "$1" 2>/dev/null; do sleep 30; done
run() { echo "=== $(date -u +%H:%M) start: $*"; env "$@" node --experimental-strip-types --no-warnings scripts/run-api.ts; echo "=== $(date -u +%H:%M) end: $*"; }
G="MODEL=gemma-4-26b-a4b-it RPM=25 CONCURRENCY=3"
run $G MODE=baseline N=200
run $G MODE=tip FROM=naming-gemma-4-26b-a4b-it-letters-game-s0 K=5
run $G MODE=run SEEDS=1-2
run $G MODE=tip FROM=naming-gemma-4-26b-a4b-it-letters-game-s0 K=3
run $G MODE=tip FROM=naming-gemma-4-26b-a4b-it-letters-game-s0 K=7
echo "=== queue-api2 finished"
