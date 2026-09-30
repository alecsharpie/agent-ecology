#!/bin/sh
# The rest of the pre-registered grid: 5 seeds per condition (A–E), letters, "game" wording.
set -u
cd "$(dirname "$0")/.."
step() { echo "=== $(date -u +%H:%M) start: $*"; env "$@" node scripts/run-headless.mjs; echo "=== $(date -u +%H:%M) end: $*"; }
step CONDS=B SEEDS=3-4
step CONDS=A SEEDS=2-4
step CONDS=C SEEDS=2-4
step CONDS=D SEEDS=2-4
step CONDS=E SEEDS=0-4
echo "=== queue5 finished"
