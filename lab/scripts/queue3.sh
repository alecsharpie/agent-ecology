#!/bin/sh
# Third batch: individual baselines for the other models, to test "populations drift to their model's favourites".
set -u
cd "$(dirname "$0")/.."
until grep -q "=== queue2 finished" "$1" 2>/dev/null; do sleep 30; done
echo "=== $(date -u +%H:%M) start baselines C,D"; BASELINE=1 CONDS=C,D node scripts/run-headless.mjs; echo "=== queue3 finished"
