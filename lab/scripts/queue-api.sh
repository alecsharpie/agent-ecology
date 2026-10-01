#!/bin/sh
# API batch (free tier): Gemma 4 only, paced under the per-minute limit. Gemini 3.8 Flash's
# free tier allows 20 requests per day, too few for a population run.
set -u
cd "$(dirname "$0")/.."
run() { echo "=== $(date -u +%H:%M) start: $*"; env "$@" node --experimental-strip-types --no-warnings scripts/run-api.ts; echo "=== $(date -u +%H:%M) end: $*"; }
run MODEL=gemma-4-26b-a4b-it MODE=probe K=5 RPM=25 CONCURRENCY=3
run MODEL=gemma-4-31b-it MODE=probe K=5 RPM=25 CONCURRENCY=3
run MODEL=gemma-4-26b-a4b-it MODE=run SEEDS=0 RPM=25 CONCURRENCY=3
echo "=== queue-api finished"
