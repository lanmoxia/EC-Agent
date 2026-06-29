# PROGRESS.md — 实时位置（progress-writer 钩子每轮自动覆盖，勿手改）

> 看这个文件 = 知道「当前任务内做到哪一步、哪些文件还没存」。
> 粗粒度的「在做第几个任务」看 `TASKS.md`；来龙去脉看 `conversation-log` / `DECISIONS.md`。

- 更新时间：2026-06-29T01:38:57.061Z
- 分支：main
- 最新 commit：3cbef08 fix: start.ps1 转 UTF-8 BOM 修复 PowerShell 中文解析闪退

## 当前位置（取自最近一次回复的锚点）
- current_task：排查并修复桌面快捷方式闪退
- changed：手动跑 start.ps1 复现解析错误(第9行)→定位为UTF-8无BOM中文被GBK误读→PowerShell转文件为UTF-8 BOM→Parser校验无语法错→提交推送 commit 3cbef08
- next：等你再次双击「启动 EC-Agent」确认不再闪退

## 工作树脏文件（git status --short）
```
(干净，无未提交改动)
```

## 原始锚点行
```
ANCHOR: lanmoxia | current_task=排查并修复桌面快捷方式闪退 | changed=手动跑 start.ps1 复现解析错误(第9行)→定位为UTF-8无BOM中文被GBK误读→PowerShell转文件为UTF-8 BOM→Parser校验无语法错→提交推送 commit 3cbef08 | next=等你再次双击「启动 EC-Agent」确认不再闪退
```
