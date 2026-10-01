#!/bin/sh
# Size ladder populations: Qwen 7B, standard and partner-only memory.
set -u
cd "$(dirname "$0")/.."
step() { echo "=== $(date -u +%H:%M) start: $*"; env "$@" node scripts/run-headless.mjs; echo "=== $(date -u +%H:%M) end: $*"; }
step CONDS=F SEEDS=0
step CONDS=F SEEDS=0 WORDING=partners
echo "=== queue7 finished"
