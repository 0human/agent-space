# AI Agent Workspace MVP Technical Design

## 1. 设计目标

本文档只描述 MVP 技术方案。MVP 目标是打通一条本地闭环：

```text
Runtime -> Project -> Brief -> Blueprint -> Task -> Work Session -> CLI Run -> Deliverable
```

技术设计优先保证：

- 本地可运行。
- 数据可恢复。
- CLI 执行可追踪。
- UI 能同时展示多个项目的 Agent 状态。
- 后续可以扩展，但当前不为非 MVP 能力增加实现复杂度。

## 2. 技术栈

- Electron。
- React + TypeScript。
- Vite。
- Tailwind CSS。
- shadcn/ui 源码组件。
- React Router。
- Zustand。
- SQLite。
- Drizzle ORM + better-sqlite3。
- `preload` + `contextBridge`。
- `child_process.spawn`。

包管理使用 `pnpm`。

## 3. 进程边界

### 3.1 Main

负责：

- 应用启动。
- SQLite 初始化和迁移。
- Runtime、Project、Task、Session、Message、Run、Event、Deliverable 的读写。
- CLI 子进程启动、停止和状态跟踪。
- 文件系统只读访问。
- 向 Renderer 推送 Session 状态变化。

### 3.2 Preload

负责：

- 暴露 `window.agentSpace`。
- 隐藏 Node、数据库、文件系统和子进程能力。
- 做最小参数校验和脱敏。

### 3.3 Renderer

负责：

- 主窗口多项目状态总览。
- 项目详情。
- Runtime、Team、Project、Task、Session 表单。
- 消息流和运行日志展示。
- 交付物保存入口。

Renderer 不直接访问 Node、数据库、文件系统或子进程。

## 4. MVP 对象关系

```text
Runtime
  └─ used by TeamMember / WorkSession

Team
  └─ TeamMember -> Runtime

Project
  ├─ ProjectBrief
  ├─ ProjectBlueprint
  ├─ ProjectTask[]
  ├─ WorkSession[]
  ├─ ProjectDeliverable[]
  └─ ProjectMetricSnapshot

WorkSession
  ├─ Message[]
  ├─ RuntimeRun[]
  └─ RuntimeEvent[]
```

## 5. 服务划分

### 5.1 RuntimeService

- Runtime CRUD。
- Runtime 启用/禁用。
- 命令检测。
- 返回脱敏配置。

### 5.2 TeamService

- Team Lite CRUD。
- Team Member CRUD。
- 成员绑定 Runtime。

### 5.3 ProjectService

- Project CRUD。
- 创建项目时保存初始想法。
- 更新项目阶段。
- 归档项目。
- 聚合项目状态摘要。

### 5.4 PlanningService

- Project Brief CRUD。
- 从 Brief 生成 Blueprint 草稿。
- 从 Blueprint 生成 Task 草稿。
- Task CRUD。
- 从 Task 创建 Work Session。
- 从 Message 保存 Deliverable。

MVP 可以先用模板规则生成 Blueprint 和 Task：

- 需求分析。
- 技术设计。
- 开发实现。
- 测试审查。
- 交付总结。

### 5.5 SessionService

- Work Session CRUD。
- 消息保存和分页。
- 发送消息。
- 创建 Runtime Run。
- 写入 Runtime Event。
- 停止运行。
- 更新 Session 状态。

### 5.6 StartupRecoveryService

应用启动时：

- `running` / `starting` 的 Runtime Run 改为 `interrupted`。
- 对应 Work Session 改为 `error`。
- Project 指标重算或刷新。

## 6. CLI 执行模型

### 6.1 Runtime Adapter

MVP 支持：

- Claude Code CLI。
- Codex CLI。
- Gemini CLI。
- Custom CLI。

Adapter 负责：

- 生成 command、args、cwd、stdin。
- 声明是否支持外部 session resume。
- 将用户 prompt 注入 CLI。

### 6.2 Run 流程

```text
session:sendMessage
  -> 保存 user message
  -> 构造 RuntimeInputEnvelope
  -> 创建 RuntimeRun(starting)
  -> spawn CLI
  -> RuntimeRun(running)
  -> stdout/stderr 写入 RuntimeEvent
  -> 进程结束
  -> 保存 assistant message 或 error summary
  -> 更新 WorkSession 状态
  -> 更新 Project 指标
```

### 6.3 状态

Work Session 状态：

- `idle`
- `running`
- `waiting_input`
- `completed`
- `error`
- `archived`

Runtime Run 状态：

- `starting`
- `running`
- `completed`
- `failed`
- `stopped`
- `interrupted`

Task 状态独立维护，不和 Work Session 状态混用。

## 7. 主窗口状态聚合

主窗口展示项目级状态：

- 活跃工作窗口数。
- 运行中 Agent 数。
- 等待输入数。
- 错误窗口数。
- 最近产出时间。
- 最近失败时间。

聚合来源：

- Work Session 状态变化。
- Runtime Run 完成或失败。
- Deliverable 创建。

MVP 可以使用最新一条 `project_metric_snapshots`，不做复杂历史图表。

## 8. 文件能力

MVP 文件能力只做：

- 读取项目目录下的文件列表。
- 只读预览文本文件。
- 选择文件作为任务或 Session 上下文。

文件能力不参与当前执行闭环的写入流程。

## 9. 安全约束

- `contextIsolation = true`。
- `nodeIntegration = false`。
- CLI 只能由 Main 启动。
- Renderer 不能直接访问文件系统。
- Runtime 敏感信息不能写入普通日志。
- 默认 cwd 使用项目目录。

权限能力只保留基础安全边界，不展开独立权限系统。

## 10. 实施顺序

1. 确认工程、DB、IPC 可运行。
2. Runtime CRUD 和命令检测。
3. Project CRUD 和主窗口状态总览。
4. Team Lite。
5. Brief / Blueprint / Task / Deliverable。
6. Work Session 消息和 CLI Run。
7. 从 Task 启动 Session。
8. 重启恢复。
9. UI 收敛和手动验收。
