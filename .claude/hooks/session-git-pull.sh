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

# 仅当「已跟踪文件」有未提交改动时才跳过 pull（未跟踪文件不影响 ff-only，不拦截）。
if [ -n "$(git status --porcelain --untracked-files=no 2>/dev/null)" ]; then
  echo "[启动同步] ⚠ 检测到本地有未提交改动（已跟踪文件），已跳过自动 git pull，避免冲突。"
  echo "[启动同步] 请先提交或暂存本地改动，再手动 git pull；或让 Claude 协助处理。"
  git status --short --untracked-files=no 2>/dev/null | head -10
else
  echo "[启动同步] 拉取最新代码 (git pull)…"
  if git pull --ff-only 2>&1; then
    echo "[启动同步] ✓ 已是最新（或已快进到最新）。"
  else
    echo "[启动同步] ⚠ git pull 未成功（可能是网络、或远程与本地分叉）。请手动检查，会话照常继续。"
  fi
fi

# 程序级注入「在建方案台账」+「最新接力末尾」到上下文——无论 pull 成功/跳过都执行，
# 不依赖 LLM 记不记得读，接回讨论思路。
if [ -f DECISIONS.md ]; then
  echo ""
  echo "===== DECISIONS.md（在建/讨论中的方案，接回思路用）====="
  cat DECISIONS.md
fi
LATEST_LOG="$(ls -t conversation-log-*.md 2>/dev/null | head -1)"
if [ -n "$LATEST_LOG" ]; then
  echo ""
  echo "===== 最新接力 $LATEST_LOG（末尾 30 行）====="
  tail -30 "$LATEST_LOG"
fi

exit 0
