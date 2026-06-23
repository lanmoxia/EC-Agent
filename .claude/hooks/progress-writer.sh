#!/bin/bash
# Stop 钩子入口：把 stdin 透传给 progress-writer.js（写 PROGRESS.md + commit/push）。
# node 不一定在默认 PATH（公司机在 /c/nvm4w/nodejs），故在此稳健定位；双机通用。
# 定位不到 node 或脚本不存在 → 放行(exit 0)，不卡用户。

DIR="${CLAUDE_PROJECT_DIR:-.}"
JS="$DIR/.claude/hooks/progress-writer.js"

NODE=""
if command -v node >/dev/null 2>&1; then
  NODE="node"
else
  for cand in /c/nvm4w/nodejs/node.exe "/c/Program Files/nodejs/node.exe" /usr/bin/node /usr/local/bin/node; do
    if [ -x "$cand" ]; then NODE="$cand"; break; fi
  done
fi

[ -z "$NODE" ] && exit 0
[ -f "$JS" ] || exit 0

exec "$NODE" "$JS"
