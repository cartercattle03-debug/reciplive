#!/usr/bin/env bash
# Offline tests (no database, no npm needed): the engine against the real workbook, then the save logic on the in-memory fake.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
TC=/tmp/rltc
python3 "$TC/genschema.py" "$HERE/../../prisma/schema.prisma" "$TC/schema2.json" >/dev/null
python3 "$TC/make-prisma-types.py" "$HERE/../../prisma/schema.prisma" "$TC/node_modules/@prisma/client/index.d.ts" >/dev/null
tsc -p "$HERE/tsconfig.test.json" >/dev/null || true
node -r "$HERE/stubs.js" "$TC/out/dev/t_flow.js"
