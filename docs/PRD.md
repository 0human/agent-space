# AI Agent Workspace MVP PRD

## 1. 产品定位

AI Agent Workspace 是一个本地桌面端 Agent 工作台。MVP 只验证一件事：

> 用户能在一个主窗口里同时看多个项目的 Agent 运行状态，并把一个项目想法推进成可执行任务、工作窗口和可沉淀交付物。

产品形态：Electron 桌面应用。

目标平台：macOS 优先，Windows 保持兼容设计。

## 2. MVP 目标

- 管理本地 CLI Agent Runtime。
- 在主窗口同时查看多个项目及其 Agent 状态。
- 创建项目并输入项目想法。
- 将项目想法整理为项目简报、蓝图和任务。
- 从任务打开工作窗口并运行一个 CLI Agent。
- 保存消息、运行日志和 Agent 输出。
- 将有价值输出保存为交付物。
- 应用重启后能恢复项目、任务、窗口、消息和运行状态。

## 3. 目标用户

- 个人开发者：同时使用多个 CLI Agent 做需求、设计、开发和测试。
- AI 工具重度用户：需要在多个项目之间跟踪 Agent 状态和历史输出。

## 4. MVP 核心体验

### 4.1 主窗口

主窗口是多项目工作台，而不是聊天首页。

用户可以看到：

- 项目列表。
- 每个项目的运行中 Agent 数。
- 等待输入数量。
- 错误窗口数量。
- 最近产出时间。
- 当前阶段。

主窗口支持：

- 创建项目。
- 打开项目详情。
- 快速进入运行中的工作窗口。

### 4.2 项目详情

项目详情在主窗口内打开，MVP 不做独立原生子窗口。

项目详情包含：

- 项目简报。
- 项目蓝图。
- 任务列表。
- 工作窗口列表。
- 交付物列表。
- 运行日志入口。
- 简单文件查看入口。

文件能力仅做只读浏览或选择为上下文。

### 4.3 项目推进链路

MVP 主链路：

```text
创建 Runtime
  -> 创建 Project
  -> 输入项目想法
  -> 保存 Project Brief
  -> 生成或编辑 Project Blueprint
  -> 生成 3-5 个 Project Task
  -> 从 Task 打开 Work Session
  -> 发送消息并启动 CLI Agent
  -> 保存 Runtime Run / Runtime Event / Message
  -> 保存 Agent 输出为 Deliverable
  -> 重启后恢复
```

## 5. 核心概念

### 5.1 Runtime

Runtime 是一个可执行的 CLI Agent 配置。

MVP 支持：

- 名称。
- Provider：Claude Code CLI、Codex CLI、Gemini CLI、Custom CLI。
- 可执行命令。
- 默认参数。
- 工作目录策略。
- 启用/禁用。
- 命令检测。

Runtime 仅支持本地 CLI Agent。

### 5.2 Project

Project 是项目级工作容器。

字段：

- 名称。
- 本地目录。
- 当前阶段。
- 初始想法。
- 默认 Runtime。
- 可选默认 Team。

项目模式由默认 Team 推导：

- 有默认 Team：Team 模式。
- 无默认 Team：自由模式。

### 5.3 Team Lite

MVP 只做轻量 Team：

- Team 名称。
- Team 目标。
- 成员列表。
- 每个成员绑定一个 Runtime。
- 每个成员有一个角色：Analyst、Architect、Developer、Tester、Reviewer、Summarizer、Custom。

Team Lite 只用于默认成员推荐和手动选择。

### 5.4 Project Brief

项目简报保存用户想法和结构化理解。

字段：

- 原始想法。
- 摘要。
- 目标用户。
- 核心功能。
- 技术偏好。
- 非目标。
- 未决问题。

### 5.5 Project Blueprint

项目蓝图是项目推进草案。

字段：

- 产品目标。
- MVP 范围。
- 技术方案摘要。
- 里程碑。
- 验收标准。
- 风险。

MVP 只保留一个当前蓝图，不做复杂版本管理。

### 5.6 Project Task

任务是可执行单元。

字段：

- 标题。
- 类型。
- 阶段。
- 推荐角色。
- 目标。
- 验收标准。
- 状态。
- 关联工作窗口。

任务状态：

- `draft`
- `todo`
- `in_progress`
- `review`
- `done`
- `blocked`
- `cancelled`

### 5.7 Work Session

工作窗口是一次独立 Agent 工作空间。

字段：

- 所属项目。
- 可选关联任务。
- 当前 Runtime 或 Team 成员。
- 消息历史。
- 运行状态。
- 最新 Runtime Run。

### 5.8 Deliverable

交付物是可复用成果。

MVP 支持：

- 标题。
- 类型。
- 内容。
- 来源任务。
- 来源工作窗口。
- 来源消息。

MVP 不做复杂版本树。

## 6. MVP 功能范围

### 6.1 必做

- Runtime CRUD。
- Runtime 命令检测。
- Team Lite CRUD。
- Project CRUD。
- 主窗口多项目状态总览。
- Project Brief CRUD。
- Blueprint 生成或编辑。
- Task 生成、编辑和状态更新。
- 从 Task 创建 Work Session。
- Work Session 消息保存。
- CLI Agent 启动、停止、stdout/stderr 记录。
- Runtime Run 和 Runtime Event 保存。
- Agent 输出保存为 Deliverable。
- 应用重启恢复未完成 run 为 interrupted/error。

### 6.2 可简化

- Blueprint 和 Task 生成可以先用模板规则生成，不要求真实 AI 规划。
- Custom CLI 可以作为第一条稳定执行链路。
- 文件能力只做只读列表和简单预览。

### 6.3 范围边界

任何不直接支撑 MVP 主链路的能力，当前文档不展开设计，也不作为开发验收目标。

## 7. MVP 验收标准

- 用户可以创建一个 Runtime 并通过命令检测。
- 用户可以创建项目并在主窗口看到项目状态。
- 用户可以输入项目想法并形成简报。
- 用户可以生成或编辑蓝图。
- 用户可以生成 3-5 个任务。
- 用户可以从任务打开工作窗口。
- 用户可以发送一条消息并启动 CLI Agent。
- 用户可以看到运行日志和 Agent 输出。
- 用户可以保存输出为交付物。
- 用户重启应用后仍能看到项目、任务、窗口、消息、日志和交付物。
