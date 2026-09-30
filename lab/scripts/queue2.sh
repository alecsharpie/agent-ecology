#!/bin/sh
# Second batch: robustness checks for the cascade conformity curve and Llama's habits.
set -u
cd "$(dirname "$0")/.."
L="$1"
until grep -q "=== queue finished" "$L" 2>/dev/null; do sleep 30; done
step() { echo "=== $(date -u +%H:%M) start: $*"; env "$@" node scripts/run-headless.mjs; echo "=== $(date -u +%H:%M) end: $*"; }
step LABELS=colours CASCADE=Llama-3.2-1B-Instruct-q4f16_1-MLC TEMP=0.7 N=100
step LABELS=colours CASCADE=Qwen2.5-1.5B-Instruct-q4f16_1-MLC TEMP=0 N=100
step PROBE=Llama-3.2-1B-Instruct-q4f16_1-MLC WORDINGS=game
echo "=== queue2 finished"
