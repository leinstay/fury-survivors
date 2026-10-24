#!/bin/sh
# Последовательный прогон гипотез на tuning seeds; каждая — та же когорта, что baseline.
cd "$(dirname "$0")/../../.."
for f in "$@"; do
  name=$(basename "$f" .json)
  node tools/simulation/audit-bots.mjs --n 40 --split tuning --lite --experiment "$f" \
    --out "tools/out/audit/$name.json" > "tools/out/audit/$name.summary.json" 2>/dev/null
  echo "done $name"
done
