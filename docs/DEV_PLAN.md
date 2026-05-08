# AI Agent Workspace Development Plan

## 1. 文档信息

- 文档名称：AI Agent Workspace Development Plan
- 对应需求文档：`docs/PRD.md`
- 对应技术设计：`docs/TECH_DESIGN.md`
- 对应数据库设计：`docs/DB_SCHEMA.md`
- 文档版本：v0.1
- 当前阶段：MVP 开发计划

## 2. 开发判断

当前可以进入开发阶段。已有文档已经覆盖：

- 产品范围：`docs/PRD.md`
- 技术架构：`docs/TECH_DESIGN.md`
- 数据模型：`docs/DB_SCHEMA.md`

最优开发方式不是先做完整 UI，也不是先把所有底层能力一次性做完，而是按“可运行骨架 -> 可保存配置 -> 可创建项目 -> 可打开工作窗口 -> 可启动 CLI Agent”的路径推进。这样每个阶段都有可验证产物。

## 3. MVP 开发目标

MVP 的最低可用目标：

- 用户可以创建或导入至少一个 CLI Runtime。
- 用户可以创建 Agent 公用配置和可组合权限设置。
- 用户可以创建 AI Team，并为成员绑定 Runtime。
- 用户可以创建项目，并由默认 Team 或 Runtime 推导项目模式。
- 用户可以在项目中创建工作窗口。
- 用户可以在工作窗口中发送消息，主进程启动 CLI Agent，并保存消息、Run 和 Runtime Event。
- 用户可以看到运行状态、错误摘要、权限等待和运行日志。
- 应用重启后可以恢复项目、窗口和历史消息。

## 4. 开发原则

- 主进程是数据库、文件系统、凭据和子进程的唯一入口。
- 渲染进程只通过 preload 暴露的语义化 API 访问能力。
- 先实现本地单用户，不引入账号、云同步和协作权限。
- 所有敏感值只进入系统凭据存储，SQLite 只保存引用。
- CLI 执行先支持稳定的启动、停止、事件记录，再优化结构化解析。
- UI 先满足高频工作流，不做营销式首页。
- 每个阶段结束必须有可手动验证的闭环。

## 5. 里程碑规划

### Phase 0：仓库与工程基线

目标：建立可以启动、构建、测试的 Electron + React + TypeScript 工程。

任务：

- 初始化 Electron + Vite + React + TypeScript。
- 建立 `main`、`preload`、`renderer` 三层目录。
- 配置 ESLint、TypeScript、格式化和基础测试。
- 配置 Electron 安全基线：
  - `contextIsolation = true`
  - `nodeIntegration = false`
  - preload 暴露最小 API
- 建立应用路由骨架：
  - Dashboard
  - Runtime
  - Agent Profile
  - Permission
  - Team
  - Project
  - Work Session

验收：

- 本地可以启动桌面应用。
- Renderer 可以通过 preload 调用一个 `app:getInfo` 示例接口。
- 主进程、preload、renderer 类型边界清晰。

### Phase 1：SQLite 与数据访问层

目标：完成基于 `Drizzle ORM + better-sqlite3` 的本地数据库初始化、迁移和基础 Repository。

任务：

- 根据 `docs/DB_SCHEMA.md` 建立 Drizzle schema。
- 建立迁移流程和数据库初始化服务。
- 启用 `PRAGMA foreign_keys = ON;`。
- 实现基础 Repository：
  - Runtime
  - Agent Profile
  - Permission Policy
  - Team
  - Project
  - Work Session
  - Message
  - Runtime Run
  - Runtime Event
  - Context
- 实现事务工具。
- 实现应用启动时的异常中断恢复：
  - `runtime_runs.status = running` 改为 `interrupted`
  - 对应 `work_sessions.status` 改为 `error`

验收：

- 应用首次启动能创建本地数据库。
- 基础表能创建、查询、更新。
- 迁移重复执行不会破坏数据。

### Phase 2：Runtime 与凭据管理

目标：用户可以创建、检测、禁用和导入 Runtime。

任务：

- 实现 Runtime CRUD。
- 实现 SecretService：
  - 保存敏感值到系统凭据存储
  - SQLite 保存 `secret_ref`
  - Renderer 只获得脱敏值
- 实现 Runtime 检测：
  - `claude --version`
  - `codex --version`
  - `gemini --version`
  - Custom CLI 可执行性检测
- 实现通用 Runtime 导入预览。
- 实现通用 Runtime 导入提交：
  - 新建
  - 重命名
  - 覆盖元数据
  - 跳过
- 实现 ccswitch Provider Import Adapter，但不唤起 ccswitch 应用。
- 实现 Runtime 列表和详情页。

验收：

- 能保存一个 Claude / Codex / Gemini / Custom Runtime。
- 能检测命令是否存在。
- 敏感字段不会明文出现在业务表、日志和 UI 明细里。
- Runtime 禁用后不会被新工作窗口默认选中。

### Phase 3：Agent Profile 与可组合权限

目标：用户可以创建行为模板和多个可继承权限设置。

任务：

- 实现 Agent Profile CRUD。
- 实现 Permission Policy Set CRUD。
- 实现 Permission Policy Binding：
  - Agent Profile
  - Runtime
  - Team Member
  - Project
  - Work Session
- 实现权限合并服务：
  - 继承顺序：Agent Profile -> Runtime -> Team Member -> Project -> Work Session
  - 同层按 `priority ASC`
  - 支持 `additive`、`override`、`restrictive`
- 实现最终生效配置预览。
- 初始化推荐权限模板：
  - Project Read Only
  - Project Safe Write
  - Command Approval
  - Git Safe
  - Network Restricted
  - Env Minimal
  - Full Access

验收：

- 一个对象可以绑定多个权限设置。
- 能预览最终权限摘要。
- 工作窗口启动前可以拿到最终权限快照。

### Phase 4：Team 与项目管理

目标：用户可以创建 Team、项目和项目模式。

任务：

- 实现 Team CRUD。
- 实现 Team Member 管理。
- 实现项目 CRUD。
- 实现项目创建向导：
  - 基本信息
  - 协作对象设置
  - 创建确认
- 实现模式推导：
  - 有 `default_ai_team_id` -> `team`
  - 无 `default_ai_team_id` -> `manual`
- 实现项目归档。
- 实现项目指标初始化。

验收：

- 可以创建自由模式项目。
- 可以创建 Team 模式项目。
- 切换项目默认 Team 不改写历史工作窗口。
- 项目列表能显示模式、阶段、风险状态和最近活动。

### Phase 5：工作窗口与消息历史

目标：用户可以在项目中创建工作窗口，并保存对话历史。

任务：

- 实现 Work Session CRUD。
- 实现工作窗口列表。
- 实现消息分页查询。
- 实现用户消息保存。
- 实现输入摘要和输入包快照保存。
- 实现成员切换：
  - 写入 `messages.event_type = member_switch`
  - 后续消息使用新执行者
- 实现转交任务：
  - 当前窗口内转交
  - 新开关联窗口
- 实现归档工作窗口。

验收：

- 工作窗口拥有独立消息流。
- 父子关联窗口可以互相导航。
- 成员切换后历史消息不变，后续消息使用新成员。

### Phase 6：CLI Runtime 执行闭环

目标：工作窗口可以启动 CLI Agent，记录运行过程和输出。

任务：

- 实现 RuntimeRegistryService。
- 实现 RuntimeProcessManager。
- 实现 RuntimeAdapter：
  - Claude Code CLI
  - Codex CLI
  - Custom CLI text 模式
- 实现 `session:sendMessage`：
  - 保存用户消息
  - 组装 RuntimeInputEnvelope
  - 创建 `runtime_runs`
  - 按 Runtime Adapter 能力透传 `resumeExternalSessionId`
  - 启动子进程
  - 流式写入 `runtime_events`
  - 写入 assistant 消息
  - 更新 session 状态
  - 更新项目指标
- 实现停止运行。
- 实现失败恢复入口。

验收：

- 从工作窗口发送消息能启动 CLI 进程。
- stdout / stderr 能进入 Runtime Event。
- 正常结束后 session 状态为 `completed`。
- 异常退出后 session 状态为 `error`，UI 显示错误摘要。

### Phase 7：上下文与文件选择

目标：用户可以显式选择项目资料和本地文件作为上下文。

任务：

- 实现项目资料管理。
- 实现本地文件选择器。
- 实现 `context_items` 和 `session_context_refs`。
- 实现上下文解析服务。
- 实现上下文大小提示。
- 实现输入包展开查看。

验收：

- 发送消息前用户能看到本轮包含哪些上下文。
- 本地文件内容只在用户显式选择后进入输入包。
- `local_file` 默认只保存引用路径、hash、大小和摘要。
- 上下文超限时不能静默自动压缩，需要用户确认并保留关键问题、关键结论和关键决策。
- 输入包展示前完成敏感字段脱敏。

### Phase 8：Dashboard 与项目指标

目标：主工作台能帮助用户识别当前要处理的项目。

任务：

- 实现项目列表卡片视图。
- 实现项目表格视图。
- 实现指标聚合：
  - 活跃窗口数
  - 运行中 Agent 数
  - 等待输入数
  - 等待权限数
  - 出错窗口数
  - 最近产出时间
  - 最近失败时间
  - 文件变更数量
- 实现风险状态计算。
- 实现项目指标更新事件。

验收：

- 主工作台不需要进入项目详情就能看到风险项目。
- 运行状态变化后项目指标能刷新。

## 6. 推荐首个 Sprint

首个 Sprint 不建议做 CLI Agent 完整执行。推荐范围：

1. 工程骨架
2. SQLite 初始化
3. DB schema 迁移
4. preload API 基线
5. Runtime 配置 CRUD
6. Agent Profile 与 Permission 基础 CRUD

交付结果：

- App 可启动。
- 数据库可迁移。
- Runtime / Agent Profile / Permission 页面可创建和保存数据。
- 为后续 Team、Project、Session 打好基础。

## 7. 测试策略

### 单元测试

- 权限合并规则
- 项目模式推导
- Session 状态机
- Runtime 命令构建
- 外部 Runtime 配置导入解析

### 集成测试

- Runtime 创建 -> 检测 -> 保存
- Agent Profile + Permission 绑定 -> 最终配置预览
- Team 创建 -> 成员绑定 Runtime
- Project 创建 -> 模式推导 -> 指标初始化
- Session 发送消息 -> Run/Event/Message 落库

### 端到端测试

- 首次启动引导
- 创建 Runtime
- 创建 Team
- 创建项目
- 创建工作窗口
- 发送一次 CLI 任务
- 停止或失败恢复

## 8. 暂不进入 MVP 的开发项

- API Provider 真实调用
- 多 Agent 自动编排
- 同窗口多人自动群聊
- 云同步
- 用户账号
- 插件市场
- 完整向量知识库
- 高级审批工单系统
- 原生多 BrowserWindow 工作区

## 9. 开发完成定义

一个功能完成需要满足：

- 数据落库与恢复行为明确。
- IPC 输入输出有类型定义。
- Renderer 不直接访问 Node、DB、文件系统或子进程。
- 失败路径有用户可理解的错误信息。
- 敏感字段不进入普通日志和 UI 明细。
- 至少有单元测试或可重复手动验收步骤。
