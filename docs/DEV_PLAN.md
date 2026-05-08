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

开发优先级应围绕一条最小主链路展开：

```text
创建 Runtime
  -> 创建 Project
  -> 创建 Work Session
  -> 发送 Message
  -> 创建 Runtime Run
  -> 写入 Runtime Event
  -> 写入 Assistant Message
  -> 重启后恢复 Project / Session / Message
```

主链路未打通前，不优先投入复杂 Dashboard、自动编排、高级导入导出和完整上下文压缩体验。

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
- 每个阶段至少覆盖一种自动化测试；无法自动化时必须留下可重复的手动验收步骤。
- 每完成一个阶段，必须确认主链路是否仍可运行，避免局部功能破坏整体闭环。

## 5. 里程碑规划

### 5.1 阶段推进策略

阶段推进分为三类：

- 基线阶段：Phase 0 到 Phase 1，目标是让工程、数据库和 IPC 边界稳定。
- 配置阶段：Phase 2 到 Phase 4，目标是让 Runtime、权限、Team 和 Project 可保存、可查询、可预览。
- 执行阶段：Phase 5 到 Phase 7，目标是让 Work Session、消息、CLI Run、上下文形成可恢复闭环。

Phase 8 之后再增强 Dashboard、项目指标和体验优化。Dashboard 只依赖已有状态做聚合，不应反向阻塞主执行链路。

### 5.2 主链路准入门槛

进入下一类阶段前必须满足：

- 进入配置阶段前：应用可启动，preload API 可调用，数据库迁移可重复执行。
- 进入执行阶段前：Runtime、Project、Work Session 的基础 CRUD 已完成，并有最小 UI 或调试入口可操作。
- 进入 Dashboard 优化前：至少一个 Custom CLI text 模式可完成发送、输出记录、状态回写和重启恢复。

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

测试：

- `pnpm typecheck`
- `pnpm lint`
- `pnpm test`
- 手动启动应用，确认主窗口、基础路由和 `app:getInfo` 可用。

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

测试：

- Drizzle schema 与迁移快照测试。
- Repository CRUD 集成测试使用临时 SQLite 数据库。
- 事务回滚测试覆盖创建项目、创建窗口等跨表写入。
- 启动恢复测试覆盖 `running -> interrupted` 和 session 状态回写。

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

测试：

- Runtime 输入校验、默认参数 `[]`、provider 枚举测试。
- SecretService 使用 mock keychain 测试保存、读取、删除和脱敏返回。
- CLI 检测使用 fake executable 或 mock process runner。
- 导入预览覆盖新建、重命名、覆盖、跳过。

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

测试：

- 权限合并单元测试覆盖 `additive`、`override`、`restrictive`。
- 同层 `priority ASC` 排序测试。
- Agent Profile / Runtime / Team Member / Project / Work Session 多层继承测试。
- 最终配置预览 IPC 集成测试。

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
- 实现默认协作对象单选：
  - 默认 AI Team
  - 默认 AI Runtime
  - 留空
- 实现模式推导：
  - 有 `default_ai_team_id` -> `team`
  - 无 `default_ai_team_id` -> `manual`
- 实现首个工作窗口创建失败处理：
  - 项目记录保留
  - 返回 warning
- 实现项目归档。
- 实现项目指标初始化。

验收：

- 可以创建自由模式项目。
- 可以创建 Team 模式项目。
- 切换项目默认 Team 不改写历史工作窗口。
- 项目列表能显示模式、阶段、风险状态和最近活动。

测试：

- 默认协作对象互斥校验测试。
- 模式推导测试覆盖 Team、Runtime、留空。
- 项目创建事务测试覆盖取消创建不落库。
- 首个工作窗口失败时项目保留并返回 warning。
- 项目归档与硬删除行为测试。

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

测试：

- Work Session 状态机单元测试。
- 消息分页和输入包快照 Repository 测试。
- 成员切换事件测试，确认历史消息不被改写。
- 父子窗口关系测试，确认运行状态不互相污染。

### Phase 6：CLI Runtime 执行闭环

目标：工作窗口可以启动 CLI Agent，记录运行过程和输出。

任务：

- 实现 RuntimeRegistryService。
- 实现 RuntimeProcessManager。
- 实现 RuntimeAdapter：
  - Claude Code CLI
  - Codex CLI
  - Gemini CLI
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
- 每次 `session:sendMessage` 都创建新的 `runtime_runs`。
- `resumeExternalSessionId` 是否透传由 Runtime Adapter 决定。

测试：

- 使用 fake CLI 覆盖 stdout、stderr、exit code、timeout、stop。
- `session:sendMessage` 集成测试覆盖 Message、Run、Event、Session 状态落库。
- 异常退出和用户停止测试覆盖错误摘要与状态回写。
- 重启恢复测试覆盖运行中 run 标记为 interrupted。
- Adapter 测试覆盖 Claude / Codex / Gemini / Custom 的命令组装和 resume 能力开关。

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

测试：

- `local_file` 保存测试确认不默认保存完整正文。
- 输入包构建测试覆盖引用、片段、摘要和显式全文发送。
- 上下文超限测试确认只提示用户，不静默压缩。
- 压缩结果结构测试确认保留关键问题、关键结论、关键决策、关键约束和来源引用。
- 脱敏测试覆盖输入包展示、日志和 Runtime Event。

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

测试：

- 指标聚合单元测试覆盖运行中、等待输入、等待权限、错误、最近活动。
- 项目指标更新事件集成测试。
- 手动验收多个项目同时存在时的排序、过滤和风险展示。

## 6. 推荐首个 Sprint

首个 Sprint 不建议做 CLI Agent 完整执行。推荐范围是把工程基线和配置保存能力打稳：

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

首个 Sprint 完成标准：

- `pnpm typecheck`、`pnpm lint`、`pnpm test` 通过。
- 应用启动后能通过 preload 调用主进程 API。
- SQLite 数据库可以初始化、迁移、重复启动。
- Runtime / Agent Profile / Permission 的最小 CRUD 具备手动验收路径。

## 7. 推荐第二个 Sprint

第二个 Sprint 目标是打通项目与工作窗口，不急于接真实 CLI：

1. Team CRUD 和成员绑定 Runtime
2. Project CRUD 和创建向导
3. 默认协作对象单选与模式推导
4. Work Session CRUD
5. Message 保存和分页查询
6. Custom CLI fake runner 或 mock runner 调试入口

交付结果：

- 可以创建 Runtime、Team、Project、Work Session。
- 可以在工作窗口里保存用户消息。
- 可以用 fake runner 模拟一次 run，写入 `runtime_runs` 和 `runtime_events`。
- 重启后项目、窗口和消息仍可恢复。

## 8. 测试策略

### 单元测试

- 权限合并规则
- 项目模式推导
- Session 状态机
- Runtime 命令构建
- 外部 Runtime 配置导入解析
- 上下文输入包构建
- 项目指标聚合

### 集成测试

- Runtime 创建 -> 检测 -> 保存
- Agent Profile + Permission 绑定 -> 最终配置预览
- Team 创建 -> 成员绑定 Runtime
- Project 创建 -> 模式推导 -> 指标初始化
- Session 发送消息 -> Run/Event/Message 落库
- 应用启动恢复 interrupted run
- 本地文件引用 -> 输入包快照 -> 脱敏展示

### 端到端测试

- 首次启动引导
- 创建 Runtime
- 创建 Team
- 创建项目
- 创建工作窗口
- 发送一次 CLI 任务
- 停止或失败恢复

### 手动验收清单

每个阶段完成后至少执行一次：

1. 启动应用。
2. 创建或选择 Runtime。
3. 创建项目。
4. 打开工作窗口。
5. 发送或模拟发送一条消息。
6. 查看消息、Run、Event 和状态变化。
7. 重启应用，确认项目、窗口、消息和异常 run 状态可恢复。

## 9. 发布前主链路门槛

进入 MVP 发布候选前，必须完整通过以下链路：

```text
创建 Runtime
  -> 创建 Project
  -> 打开 Work Session
  -> 发送一条消息
  -> 主进程启动 CLI 或 fake CLI
  -> 保存 user message
  -> 创建 runtime_run
  -> 写入 runtime_events
  -> 保存 assistant message 或 error summary
  -> 更新 session 和 project metrics
  -> 重启应用后恢复历史与状态
```

该链路不通过时，不进入体验优化、Dashboard 强化或发布打包阶段。

## 10. 暂不进入 MVP 的开发项

- API Provider 真实调用
- 多 Agent 自动编排
- 同窗口多人自动群聊
- 云同步
- 用户账号
- 插件市场
- 完整向量知识库
- 高级审批工单系统
- 原生多 BrowserWindow 工作区

## 11. 开发完成定义

一个功能完成需要满足：

- 数据落库与恢复行为明确。
- IPC 输入输出有类型定义。
- Renderer 不直接访问 Node、DB、文件系统或子进程。
- 失败路径有用户可理解的错误信息。
- 敏感字段不进入普通日志和 UI 明细。
- 至少有单元测试或集成测试；确实不适合自动化的 UI 行为必须有可重复手动验收步骤。
- 不破坏发布前主链路门槛。
