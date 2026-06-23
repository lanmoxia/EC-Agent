# PROGRESS.md — 实时位置（progress-writer 钩子每轮自动覆盖，勿手改）

> 看这个文件 = 知道「当前任务内做到哪一步、哪些文件还没存」。
> 粗粒度的「在做第几个任务」看 `TASKS.md`；来龙去脉看 `conversation-log` / `DECISIONS.md`。
>
> ⚠ 本文件由 `.claude/hooks/progress-writer.js` 在每轮回复结束时自动覆盖 + 单独 commit/push。
> 钩子需会话重启后才加载——下个新会话起，这里会自动反映"当前位置"。本条是初始种子。

- 更新时间：(待钩子接管)
- 分支：main
- 最新 commit：(待钩子接管)

## 当前位置（取自最近一次回复的锚点）
- current_task：建「进度追踪 + 任务编排」系统（钩子+TASKS.md+PROGRESS.md+注册+文档）
- changed：新建 progress-writer.js/.sh（DRYRUN 验证通过）+ TASKS.md + 本文件 + settings.json 注册钩子
- next：更新 CLAUDE.md 启动清单与铁律 + DECISIONS 锁定 + commit/push

## 工作树脏文件（git status --short）
```
(钩子接管后自动填充 git status)
```

## 原始锚点行
```
(钩子接管后自动填充最近一次回复的 ANCHOR 行)
```
