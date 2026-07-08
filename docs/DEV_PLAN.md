# AI Agent Workspace MVP Development Plan

## 1. 当前判断

不从头开发。现有 Electron、SQLite、Runtime、Project、Session 基础有复用价值。接下来只围绕 MVP 主链路推进，非 MVP 页面和能力先隐藏或停止扩展。

MVP 主链路：

```text
Runtime
  -> Project
  -> Brief
  -> Blueprint
  -> Task
  -> Work Session
  -> CLI Run
  -> Deliverable
  -> Restart Recovery
```

## 2. 范围原则

开发期间只处理 MVP 主链路。已有非主链路代码可以保留，但不作为当前验收目标，也不继续扩展。

## 3. Phase 1：收敛文档和导航

目标：让产品判断只围绕 MVP。

任务：

- 精简 PRD、技术设计、IPC、DB、UI、开发计划。
- 隐藏非 MVP 导航入口。
- 保留主窗口、项目、Runtime、Team Lite、Session、Planning 相关入口。

验收：

- 文档里没有非 MVP 细节实现。
- UI 不引导用户进入非 MVP 功能。

## 4. Phase 2：Runtime 和 Project

目标：用户能创建 Runtime 和 Project。

任务：

- Runtime CRUD。
- Runtime 命令检测。
- Project CRUD。
- 创建项目时保存初始想法。
- 主窗口展示多项目状态。

验收：

- 创建一个 Custom CLI Runtime。
- 创建一个 Project。
- 主窗口能看到项目、阶段和基础状态。

## 5. Phase 3：Planning

目标：把项目想法转成任务。

任务：

- Project Brief CRUD。
- Blueprint CRUD。
- 使用模板从 Brief 生成 Blueprint。
- 使用模板从 Blueprint 生成 3-5 个 Task。
- Task 编辑和状态更新。

验收：

- 输入一个项目想法。
- 生成 Brief。
- 生成 Blueprint。
- 生成任务列表。

## 6. Phase 4：Work Session 和 CLI Run

目标：从任务启动 Agent。

任务：

- 从 Task 创建 Work Session。
- Session 消息保存。
- `session:sendMessage` 启动 CLI。
- Runtime Run 状态写入。
- Runtime Event 记录 stdout/stderr。
- 结束后写入 assistant message 或 error summary。

验收：

- 从任务打开工作窗口。
- 发送消息能启动 Custom CLI。
- UI 能看到运行状态和日志。

## 7. Phase 5：Deliverable 和恢复

目标：输出能沉淀，重启能恢复。

任务：

- 从 Message 保存 Deliverable。
- Deliverable 列表。
- 任务状态进入 review/done。
- 启动恢复 interrupted run。
- 项目指标刷新。

验收：

- 保存一次 Agent 输出为交付物。
- 重启应用后仍能看到项目、任务、窗口、消息、日志和交付物。
- 未完成 run 被标记为 interrupted/error。

## 8. 手动验收脚本

1. 创建 Custom CLI Runtime。
2. 创建项目并输入项目想法。
3. 在主窗口确认项目出现。
4. 打开项目详情。
5. 生成 Brief。
6. 生成 Blueprint。
7. 生成任务列表。
8. 从一个任务启动 Work Session。
9. 发送消息。
10. 查看 Runtime Event。
11. 保存 Agent 输出为 Deliverable。
12. 重启应用。
13. 确认数据恢复。

## 9. 发布门槛

- `pnpm typecheck` 通过。
- `pnpm lint` 通过。
- `pnpm test` 通过。
- MVP 手动验收脚本通过。
