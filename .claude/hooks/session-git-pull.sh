#!/bin/bash
# SessionStart 钩子：每次新会话自动拉取最新代码。
# 由 Claude Code 的 harness 在会话启动时自动执行（不依赖 LLM 记忆）。
# 失败绝不阻塞会话启动——始终 exit 0，只把结果作为上下文打印给 Claude。

# 切到项目根（钩子 cwd 已是项目目录，CLAUDE_PROJECT_DIR 兜底）
cd "${CLAUDE_PROJECT_DIR:-.}" 2>/dev/null || true

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "[启动同步] 当前目录不是 git 仓库，跳过 git pull。"
  exit 0
fi

# 有未提交改动时，pull 可能冲突——先提示，不强行 pull 覆盖
if [ -n "$(git status --porcelain 2>/dev/null)" ]; then
  echo "[启动同步] ⚠ 检测到本地有未提交改动，已跳过自动 git pull，避免冲突。"
  echo "[启动同步] 请先提交或暂存本地改动，再手动 git pull；或让 Claude 协助处理。"
  git status --short 2>/dev/null | head -10
  exit 0
fi

echo "[启动同步] 拉取最新代码 (git pull)…"
if git pull --ff-only 2>&1; then
  echo "[启动同步] ✓ 已是最新（或已快进到最新）。"
else
  echo "[启动同步] ⚠ git pull 未成功（可能是网络、或远程与本地分叉）。请手动检查，会话照常继续。"
fi

exit 0
