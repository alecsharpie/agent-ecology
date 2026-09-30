#!/bin/sh
# Fourth batch: which situations flip when the wording changes? Probes with the "plain" wording.
set -u
cd "$(dirname "$0")/.."
until grep -q "=== queue3 finished" "$1" 2>/dev/null; do sleep 30; done
echo "=== $(date -u +%H:%M) start probes plain"; PROBE=Qwen2.5-1.5B-Instruct-q4f16_1-MLC WORDINGS=plain node scripts/run-headless.mjs; echo "=== queue4 finished"
