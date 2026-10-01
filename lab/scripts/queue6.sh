#!/bin/sh
# Probes: does removing self-history unlock copying? And does copying turn on with size?
set -u
cd "$(dirname "$0")/.."
step() { echo "=== $(date -u +%H:%M) start: $*"; env "$@" node scripts/run-headless.mjs; echo "=== $(date -u +%H:%M) end: $*"; }
step PROBE=Qwen2.5-1.5B-Instruct-q4f16_1-MLC WORDINGS=partners
step PROBE=Qwen2.5-3B-Instruct-q4f16_1-MLC WORDINGS=game,partners
step PROBE=Qwen2.5-7B-Instruct-q4f16_1-MLC WORDINGS=game,partners
echo "=== queue6 finished"
