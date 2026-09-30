#!/bin/sh
# Runs a list of headless jobs one after another, detached from any terminal time limit.
# Every job resumes from its checkpoint, so rerunning this after a crash is safe.
#   nohup sh scripts/queue.sh > queue.log 2>&1 &
set -u
cd "$(dirname "$0")/.."
step() { echo "=== $(date -u +%H:%M) start: $*"; env "$@" node scripts/run-headless.mjs; echo "=== $(date -u +%H:%M) end: $*"; }
step CONDS=D SEEDS=1
step LABELS=colours CASCADE=Qwen2.5-1.5B-Instruct-q4f16_1-MLC TEMP=0.7 N=100
step CONDS=C SEEDS=0-1
step WORDING=plain CONDS=B SEEDS=0
step POOL=nonsense CONDS=B SEEDS=0
echo "=== queue finished"
