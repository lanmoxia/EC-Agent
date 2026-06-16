#!/bin/bash
# 一次性破局脚本：解决"旧钩子因 settings.local.json 脏而永远跳过 pull"的死锁。
#
# 背景：commit c363e34 之前，.claude/settings.local.json 被 git 追踪且每次会话被改写，
# 导致旧机器的 SessionStart 钩子检测到未提交改动 → 跳过 pull → 永远拿不到修复。
# 任何"还没拿到 c363e34"的机器（如家里那台首次打开），手动跑一次本脚本即可破局。
#
# 幂等：已经修好的机器跑它也安全，不会破坏任何东西。

cd "${CLAUDE_PROJECT_DIR:-.}" 2>/dev/null || { echo "无法进入项目目录"; exit 1; }

LOCAL_CFG=".claude/settings.local.json"
BACKUP="/tmp/ec-agent-settings.local.backup"

echo "[破局] 1) 备份本机 Claude 权限配置…"
cp "$LOCAL_CFG" "$BACKUP" 2>/dev/null && echo "    已备份到 $BACKUP" || echo "    （无本机配置或无需备份）"

# 只有当该文件还被 git 追踪时，才需要放弃改动来解锁 pull（已修好的机器它不再被追踪，跳过）
if git ls-files --error-unmatch "$LOCAL_CFG" >/dev/null 2>&1; then
  echo "[破局] 2) 该文件仍被旧版 git 追踪，放弃其本地改动以解锁 pull…"
  git checkout -- "$LOCAL_CFG" 2>/dev/null || true
else
  echo "[破局] 2) 该文件已不被追踪（机制已是新版），无需解锁。"
fi

echo "[破局] 3) 拉取最新代码（含修复提交）…"
if git pull --ff-only 2>&1; then
  echo "    ✓ pull 成功"
else
  echo "    ⚠ pull 未成功，请检查网络或分叉情况"
fi

echo "[破局] 4) 还原本机 Claude 权限配置…"
cp "$BACKUP" "$LOCAL_CFG" 2>/dev/null && echo "    已还原" || echo "    （无备份可还原，新窗口会自动重建）"

echo ""
echo "[破局] === 验证 ==="
echo -n "check-ignore（应输出文件名）: "; git check-ignore "$LOCAL_CFG" || echo "（未忽略——异常，请检查 .gitignore）"
echo -n "ls-files（应为空）: "; git ls-files "$LOCAL_CFG"; echo ""
echo "status:"; git status -sb
echo ""
echo "[破局] 完成。若上面 check-ignore 有输出、ls-files 为空、status 无 'M .claude/settings.local.json'，即破局成功。"
exit 0
