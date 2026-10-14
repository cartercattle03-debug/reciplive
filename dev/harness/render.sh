#!/usr/bin/env bash
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
sed -i 's#"/home/claude/reciplive/dev/t_flow.ts"\]#"/home/claude/reciplive/dev/t_flow.ts", "/home/claude/reciplive/dev/t_render.ts"]#' "$HERE/tsconfig.render.json"
tsc -p "$HERE/tsconfig.render.json" >/dev/null || true
RL_OUT=/tmp/rltc/outr node -r "$HERE/stubs.js" /tmp/rltc/outr/dev/t_render.js
