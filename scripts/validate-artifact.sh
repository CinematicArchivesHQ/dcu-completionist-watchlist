#!/usr/bin/env bash
set -euo pipefail
for file in index.html manifest.webmanifest hall-of-justice-logo.svg hall-of-justice-icon.svg service-worker.js; do
  if [[ ! -f "out/$file" ]]; then echo "Missing static export file: $(pwd)/out/$file"; exit 66; fi
done
echo "Hall of Justice Archives artifact validated."
