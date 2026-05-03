# AI Agent Workspace 技术设计文档

## 1. 文档信息

- 文档名称：AI Agent Workspace Technical Design
- 对应需求文档：`docs/PRD.md`
- 文档版本：v0.1
- 当前阶段：MVP 技术设计
- 目标平台：macOS、Windows

## 2. 设计目标

本文档用于把 `docs/PRD.md` 中已经明确的产品定义落成可实现的技术方案，重点覆盖以下内容：

- Electron 桌面应用整体架构
- CLI Agent 优先的 Runtime 接入方式
- Team 模式与自由模式的实现策略
- 工作窗口、成员切换、转交任务、关联窗口的状态模型
- 本地数据存储、凭据保存和恢复机制
- IPC、进程管理、事件流和 UI 数据同步方式
- MVP 需要直接做出的技术决策

本文档默认以“先做稳、先做清晰、先做可维护”为原则，不追求首版把多 Agent 自动编排做满。

## 3. 关键技术决策

### 3.1 已确定决策

1. 产品采用 Electron 桌面端架构，主进程负责系统能力、CLI 进程、数据持久化和安全边界。
2. MVP 采用 `CLI Agent First` 策略，优先支持：
   - Claude Code CLI
   - Codex CLI
   - Custom CLI
3. API Provider 不进入 MVP 执行链路，但在数据结构与 Runtime 抽象层预留扩展接口。
4. 本地业务数据使用 `SQLite` 作为主存储。
5. 凭据不直接落入普通业务表，使用系统凭据存储保存敏感值，业务库仅保存引用信息。
6. 工作窗口在产品概念上是独立工作空间，但 MVP UI 先实现为主窗口内的工作区页面，不强依赖多个原生 `BrowserWindow`。
7. 每个工作窗口最多绑定一个当前激活执行者：
   - Team 成员
   - 或单独 Runtime
8. 所有 CLI Agent 进程只允许由 Electron 主进程启动与控制。

### 3.2 推荐技术栈

- 桌面容器：Electron
- 前端：React + TypeScript
- 构建工具：Vite
- 路由：React Router
- 状态管理：Zustand
- 本地数据库：SQLite
- 数据访问层：Drizzle ORM 或等价轻量封装
- 凭据管理：`keytar` 或系统 Keychain/Credential Manager 封装
- Electron 安全桥：`preload` + `contextBridge`
- 子进程控制：Node.js `child_process.spawn`

说明：

- React + Zustand 足够支撑 MVP 的多视图、多工作窗口状态同步，不需要过早引入更重的全局架构。
- SQLite 更适合项目、消息、运行事件、指标聚合和后续检索，不建议用 JSON 文件作为主存储。
- 原生多窗口先不做成硬依赖，可以减少状态同步和窗口恢复复杂度。

## 4. 总体架构

### 4.1 分层结构

系统分为四层：

1. `Renderer UI Layer`
   - 页面、组件、表单、工作窗口、消息流、项目列表
2. `Renderer State Layer`
   - 当前项目、工作窗口、运行状态、过滤器、草稿输入
3. `Electron Application Layer`
   - IPC、用例服务、权限提示、窗口生命周期
4. `Infrastructure Layer`
   - SQLite、凭据存储、CLI Adapter、进程管理、文件系统访问

### 4.2 进程职责划分

#### 主进程职责

- 应用启动和单实例管理
- 本地数据库初始化与迁移
- 系统凭据读写
- 启动、停止、跟踪 CLI Agent 子进程
- 统一 Runtime Adapter 调度
- 文件系统访问与项目目录校验
- 向渲染进程推送运行事件
- 应用退出时恢复与清理

#### Preload 职责

- 暴露最小可用 IPC API
- 对渲染进程隐藏 Node 原生能力
- 参数校验与数据脱敏

#### 渲染进程职责

- 页面渲染
- 用户交互
- 表单校验与草稿状态
- 列表查询、筛选、排序
- 工作窗口消息流展示
- 运行状态提示、恢复入口、转交流程 UI

### 4.3 架构图

```text
+---------------------------+
|        Renderer UI        |
| Project / Team / Session  |
+-------------+-------------+
              |
              | IPC via preload
              v
+-------------+-------------+
|        Electron Main      |
| App Service / IPC / ACL   |
+------+------+------+------+
       |      |      |
       |      |      +------------------+
       |      |                         |
       v      v                         v
+------+--+ +--+----------------+ +-----+----------------+
| SQLite  | | Secret Store      | | CLI Runtime Manager  |
| DB      | | keytar / keychain | | spawn / parse / stop |
+---------+ +-------------------+ +----------------------+
```

## 5. MVP 信息架构与运行模型

### 5.1 顶层对象关系

```text
Project
 ├─ optional default AgentProfile
 ├─ optional default AITeam
 ├─ many WorkSession
 ├─ many ContextItem
 └─ many ProjectMetricSnapshot

AgentProfile
 ├─ reusable behavior template
 └─ can be referenced by Runtime / Team Member / Project / Session

AITeam
 └─ many AITeamMember
      └─ binds one AIRuntimeConfig

WorkSession
 ├─ belongs to Project
 ├─ optional belongs to AITeam
 ├─ optional current AITeamMember
 ├─ optional direct AIRuntimeConfig
 ├─ many Message
 ├─ many RuntimeEvent
 └─ optional parent WorkSession

AIRuntimeConfig
 ├─ one runtime definition
 ├─ optional referenced AgentProfile
 └─ optional many secret references
```

### 5.2 Team 模式与自由模式实现策略

项目创建时不要求用户先手动选择模式，而是先选择默认协作对象，由系统自动推导 `Project.mode`。

#### Team 模式

- `Project.defaultAiTeamId` 有值
- 创建工作窗口时自动预填：
  - `aiTeamId`
  - 推荐成员
  - 推荐 Runtime
- 用户仍然可以覆盖为：
  - Team 中其他成员
  - 独立 Runtime

#### 自由模式

- `Project.defaultAiTeamId` 为空
- 且 `Project.defaultAiRuntimeConfigId` 可有值或为空
- 若存在 `defaultAiRuntimeConfigId`，新建工作窗口时优先预填该 Runtime
- 若不存在 `defaultAiRuntimeConfigId`，创建工作窗口时必须手动选择 Runtime，或可选绑定一个 Team 仅用于当前窗口

#### 模式推导规则

- 若 `defaultAiTeamId` 有值，则 `mode = team`
- 若 `defaultAiTeamId` 为空，则 `mode = manual`
- `defaultAiTeamId` 与 `defaultAiRuntimeConfigId` 可以同时存储，但项目默认协作入口以 Team 优先
- UI 中应把模式展示为“系统推导结果”，而不是要求用户显式选择

#### 模式切换

- `manual -> team`
  - 允许切换
  - 本质是补充 `defaultAiTeamId`
  - 不强制改动历史工作窗口
- `team -> manual`
  - 允许切换
  - 本质是移除 `defaultAiTeamId`
  - 已存在窗口继续保留自身绑定

原则：项目模式只影响默认行为，不回写改造历史消息与历史窗口。

## 6. 模块设计

### 6.1 应用模块

建议目录结构：

```text
src/
  main/
    app/
    db/
    ipc/
    runtime/
    security/
    services/
  preload/
    index.ts
    api/
  renderer/
    app/
    routes/
    components/
    features/
      dashboard/
      projects/
      runtimes/
      teams/
      sessions/
    stores/
    hooks/
    types/
docs/
  PRD.md
  TECH_DESIGN.md
```

### 6.2 主进程核心服务

#### `RuntimeRegistryService`

职责：

- 管理所有 Runtime Adapter 注册
- 根据 `AIRuntimeConfig.provider` 选择适配器
- 提供 `test/start/stop/resume` 入口

#### `AgentProfileService`

职责：

- 管理 Agent 公用配置 CRUD
- 计算被引用关系
- 合并 AgentProfile / Runtime / Team Member / Project / Session 配置
- 输出最终生效配置预览

#### `RuntimeProcessManager`

职责：

- 启动 CLI 子进程
- 维护 `workSessionId -> process handle`
- 读取 stdout/stderr
- 推送统一事件流
- 处理 kill、timeout、异常退出

#### `ProjectService`

职责：

- 创建、编辑、归档、删除项目
- 校验本地目录
- 计算项目指标
- 处理模式切换

#### `WorkSessionService`

职责：

- 新建工作窗口
- 切换成员或 Runtime
- 转交任务
- 创建关联窗口
- 持久化会话状态和消息

#### `ImportService`

职责：

- 解析 ccswitch deep link / 配置文本 / 文件
- 生成导入预览
- 执行字段映射
- 冲突检测
- 触发后续 Runtime 检测

#### `SecretService`

职责：

- 保存敏感字段到系统凭据存储
- 返回 `secretRef`
- 删除配置时清理无用 secret

### 6.3 渲染层功能模块

#### Dashboard 模块

- 项目列表
- 指标卡片 / 表格
- 风险提示
- 最近活动

#### Runtime 管理模块

- 配置列表
- 新建 / 编辑 / 删除
- ccswitch 导入
- 命令检测

#### AgentProfile 管理模块

- 配置列表
- 新建 / 编辑 / 复制 / 删除
- 被引用关系查看
- 最终生效配置预览

#### Team 管理模块

- Team 列表
- 成员角色
- 绑定 Runtime
- 使用影响提示

#### Project 模块

- 项目详情
- 新建项目向导
- 模式切换
- 项目资料管理

#### Session 模块

- 工作窗口列表
- 对话流
- 运行状态
- 成员切换
- 转交任务
- 关联窗口
- Runtime 日志

## 7. Runtime 抽象与 CLI 适配设计

### 7.1 统一接口

```ts
interface RuntimeAdapter {
  provider: RuntimeProvider;
  test(input: RuntimeTestInput): Promise<RuntimeTestResult>;
  start(input: RuntimeStartInput): Promise<RuntimeExecution>;
  stop(input: RuntimeStopInput): Promise<void>;
  parseStdout?(chunk: string, context: ParseContext): RuntimeEvent[];
  parseStderr?(chunk: string, context: ParseContext): RuntimeEvent[];
}
```

### 7.2 统一执行对象

```ts
interface RuntimeExecution {
  runId: string;
  pid: number;
  workSessionId: string;
  provider: RuntimeProvider;
  startedAt: string;
  stdout: NodeJS.ReadableStream;
  stderr: NodeJS.ReadableStream;
  kill(signal?: NodeJS.Signals): void;
}
```

### 7.3 CLI 适配分层

每个 CLI Adapter 分为三段：

1. `Command Builder`
   - 根据 Runtime 配置、工作目录、上下文和用户输入构造命令行参数
2. `Process Runner`
   - 只负责启动进程和读取输出
3. `Event Translator`
   - 把 CLI 原始输出翻译为统一 `RuntimeEvent`

这样可以避免把“命令拼装”和“输出解析”写死在一个文件里。

### 7.4 Claude Code CLI 适配

职责：

- 检测 `claude --version`
- 识别一次性任务模式
- 优先开启结构化输出能力；若 CLI 版本不支持，则回退为文本事件流
- 解析：
  - 文本回复
  - 工具调用
  - 权限请求
  - 文件变更
  - 退出结果

### 7.5 Codex CLI 适配

职责：

- 检测 `codex --version`
- 支持审批模式参数透传
- 记录 shell / patch / file write 类事件
- 将审批等待映射为 `waiting_permission`

### 7.6 Custom CLI 适配

用户配置：

- 命令
- 参数模板
- 输出格式
- 工作目录策略
- 环境变量白名单

实现策略：

- `text`：按行记录 stdout
- `json`：整个进程输出按单个 JSON 解析
- `jsonl`：每行一个 JSON 事件
- `stream-json`：按 chunk 增量解析

### 7.7 RuntimeStartInput

```ts
interface RuntimeStartInput {
  workSessionId: string;
  projectId: string;
  projectPath: string;
  runtimeConfig: AIRuntimeConfig;
  assignee: {
    type: 'team-member' | 'runtime';
    teamId?: string;
    teamMemberId?: string;
  };
  prompt: string;
  contextItems: ResolvedContextItem[];
  resumeExternalSessionId?: string;
}
```

### 7.8 输入包组装与可视化

应用发送给 CLI Agent 的内容不是单一字符串，而是一个由多个部分拼装出来的输入包。

建议在主进程内部形成统一结构：

```ts
interface RuntimeInputEnvelope {
  workSessionId: string;
  prompt: string;
  projectContextSummary?: string;
  contextItems: ResolvedContextItem[];
  teamMemberInstruction?: string;
  runtimeSystemPrompt?: string;
  executionMetadata: {
    runtimeConfigId: string;
    provider: RuntimeProvider;
    cwd: string;
    permissionProfile: string;
  };
}
```

该结构的用途：

- 供 `RuntimeAdapter` 构造最终命令输入
- 供渲染层展示“本轮实际发送给 AI 的输入包”
- 供调试和问题排查

展示策略：

- 消息流默认显示用户原始输入
- 输入摘要信息从 `RuntimeInputEnvelope` 中提取
- 完整输入包默认折叠显示
- 敏感字段在进入展示层前必须脱敏

### 7.9 Agent 公用配置合并规则

Agent 公用配置用于承载跨 Runtime 与 Team 可复用的行为配置，不负责存储敏感凭据与一次性任务上下文。

推荐合并优先级：

1. `AgentProfile`
2. `AIRuntimeConfig`
3. `AITeamMember`
4. `Project`
5. `WorkSession`

字段示例：

- `permissionProfile`
- `baseSystemPrompt`
- `rolePromptTemplate`
- `defaultArgs`
- `defaultCwdMode`
- `approvalMode`
- `envWhitelist`

实现要求：

- 主进程在启动任务前计算最终生效配置
- 最终结果写入 `work_sessions.resolved_config_snapshot_json`
- UI 可查看每个字段的最终值，以及该字段来自哪一层
- 敏感字段不进入 AgentProfile 层

### 7.10 运行约束

- 每个工作窗口同时最多一个活动进程
- 同一工作窗口新任务启动前必须确认旧进程已结束或被停止
- 项目目录不存在时禁止启动
- Runtime 配置失效时禁止启动并返回恢复建议

## 8. IPC 设计

### 8.1 设计原则

- 渲染进程不直接接触数据库、文件系统、子进程
- IPC 使用领域动作命名，不使用过度通用的 `invoke('db:query')`
- 主动推送事件统一走订阅通道

### 8.2 主要 IPC 通道

#### Runtime

- `runtime:list`
- `runtime:create`
- `runtime:update`
- `runtime:delete`
- `runtime:test`
- `runtime:importCcswitchPreview`
- `runtime:importCcswitchCommit`

#### AgentProfile

- `agentProfile:list`
- `agentProfile:create`
- `agentProfile:update`
- `agentProfile:duplicate`
- `agentProfile:delete`
- `agentProfile:getUsage`
- `agentProfile:resolvePreview`

#### Team

- `team:list`
- `team:create`
- `team:update`
- `team:delete`

#### Project

- `project:list`
- `project:get`
- `project:create`
- `project:update`
- `project:archive`
- `project:delete`
- `project:getMetrics`

#### WorkSession

- `session:listByProject`
- `session:get`
- `session:create`
- `session:update`
- `session:archive`
- `session:switchAssignee`
- `session:handoff`
- `session:createChild`
- `session:sendMessage`
- `session:stopRun`
- `session:retryLastRun`
- `session:getRuntimeEvents`

#### Context

- `context:listProjectItems`
- `context:createManualItem`
- `context:selectFiles`
- `context:resolveForSession`

#### Subscription

- `event:runtime`
- `event:sessionStatus`
- `event:projectMetricsUpdated`

### 8.3 预加载 API 示例

```ts
window.agentSpace.sessions.sendMessage({
  workSessionId,
  prompt,
  contextItemIds,
});
```

预加载层应提供语义化 API，而不是把 IPC channel 暴露给前端页面。

## 9. 数据存储设计

### 9.1 存储策略

#### SQLite 存储业务数据

存储内容：

- Runtime 元数据
- Team 与成员
- 项目
- 工作窗口
- 消息
- RuntimeEvent
- 上下文引用
- 项目指标快照

#### 系统凭据存储保存敏感字段

存储内容：

- apiKey
- token
- usageApiKey
- 其他导入凭据

业务表中只保存：

- `secretRef`
- `secretKind`
- `lastValidatedAt`

### 9.2 数据表草案

#### `ai_runtime_configs`

- `id`
- `name`
- `runtime_type`
- `provider`
- `agent_profile_id`
- `source`
- `source_ref`
- `model`
- `executable_path`
- `default_args_json`
- `default_cwd_mode`
- `custom_cwd`
- `system_prompt`
- `stream_enabled`
- `permission_profile`
- `is_default`
- `enabled`
- `notes`
- `created_at`
- `updated_at`
- `last_used_at`

#### `ai_runtime_secrets`

- `id`
- `runtime_config_id`
- `secret_kind`
- `secret_ref`
- `masked_value`
- `created_at`
- `updated_at`

#### `projects`

- `id`
- `name`
- `description`
- `local_path`
- `mode`
- `phase`
- `default_ai_team_id`
- `default_ai_runtime_config_id`
- `default_agent_profile_id`
- `risk_status`
- `archived_at`
- `created_at`
- `updated_at`
- `last_active_at`

#### `agent_profiles`

- `id`
- `name`
- `description`
- `permission_profile`
- `base_system_prompt`
- `role_prompt_template`
- `default_args_json`
- `default_cwd_mode`
- `custom_cwd`
- `output_style`
- `approval_mode`
- `env_whitelist_json`
- `created_at`
- `updated_at`
- `last_used_at`

#### `project_metric_snapshots`

- `id`
- `project_id`
- `active_session_count`
- `running_agent_count`
- `waiting_input_count`
- `waiting_permission_count`
- `error_session_count`
- `recent_output_at`
- `recent_failure_at`
- `recent_runtime_type`
- `file_change_count`
- `snapshot_at`

MVP 可只保留最新一条聚合结果，也支持后续扩展为时间序列。

#### `ai_teams`

- `id`
- `name`
- `goal`
- `description`
- `default_launch_mode`
- `created_at`
- `updated_at`
- `last_used_at`

#### `ai_team_members`

- `id`
- `team_id`
- `name`
- `role`
- `runtime_config_id`
- `agent_profile_id`
- `task_instruction`
- `enabled`
- `sort_order`
- `created_at`
- `updated_at`

#### `projects_ai_teams`

说明：

- 如果后续需要记录项目与 Team 的历史绑定，可以增加关联表
- MVP 阶段仅保留 `projects.default_ai_team_id` 即可

#### `work_sessions`

- `id`
- `project_id`
- `title`
- `goal`
- `status`
- `ai_team_id`
- `ai_team_member_id`
- `ai_runtime_config_id`
- `agent_profile_id`
- `assignment_mode`
- `active_assignee_type`
- `parent_work_session_id`
- `external_session_id`
- `latest_run_id`
- `summary`
- `resolved_config_snapshot_json`
- `archived_at`
- `created_at`
- `updated_at`
- `last_message_at`

#### `messages`

- `id`
- `work_session_id`
- `role`
- `event_type`
- `ai_team_member_id`
- `from_ai_team_member_id`
- `to_ai_team_member_id`
- `content`
- `input_summary_json`
- `input_envelope_snapshot_json`
- `display_state_json`
- `runtime_snapshot_json`
- `token_usage_json`
- `error_json`
- `created_at`

#### `runtime_runs`

- `id`
- `work_session_id`
- `runtime_config_id`
- `provider`
- `pid`
- `status`
- `command`
- `args_json`
- `cwd`
- `env_summary_json`
- `started_at`
- `ended_at`
- `exit_code`
- `exit_signal`
- `error_summary`

#### `runtime_events`

- `id`
- `run_id`
- `work_session_id`
- `runtime_config_id`
- `type`
- `content`
- `metadata_json`
- `display_category`
- `sequence_no`
- `created_at`

#### `context_items`

- `id`
- `project_id`
- `work_session_id`
- `type`
- `title`
- `path`
- `content`
- `content_hash`
- `created_at`
- `updated_at`

#### `context_snapshots`

- `id`
- `project_id`
- `work_session_id`
- `source_type`
- `title`
- `summary`
- `decision_summary_json`
- `open_questions_json`
- `constraints_json`
- `next_actions_json`
- `preserved_refs_json`
- `is_pinned`
- `created_at`
- `updated_at`

#### `session_context_refs`

- `id`
- `work_session_id`
- `context_item_id`
- `included_by`
- `created_at`

### 9.3 关键索引

- `projects(last_active_at desc)`
- `projects(risk_status, last_active_at desc)`
- `work_sessions(project_id, archived_at, updated_at desc)`
- `messages(work_session_id, created_at asc)`
- `runtime_events(run_id, sequence_no asc)`
- `ai_team_members(team_id, sort_order asc)`

### 9.4 删除策略

#### 删除项目

- 删除 `projects`
- 级联删除：
  - `work_sessions`
  - `messages`
  - `runtime_runs`
  - `runtime_events`
  - `context_items` 中属于项目的手工资料
- 不删除：
  - `ai_teams`
  - `ai_runtime_configs`
  - 系统内其他项目共用的数据

#### 删除 Runtime

- 若被 Team 成员或工作窗口引用，默认禁止硬删除
- MVP 推荐改为：
  - `enabled = false`
  - 保留历史快照

## 10. 工作窗口与状态机设计

### 10.1 WorkSession 状态机

```text
idle
  -> running
  -> archived

running
  -> waiting_input
  -> waiting_permission
  -> completed
  -> error
  -> idle (stop)

waiting_input
  -> running
  -> archived

waiting_permission
  -> running
  -> error
  -> archived

completed
  -> running (retry/new prompt)
  -> archived

error
  -> running (retry)
  -> archived
```

### 10.2 状态映射规则

- `running`
  - 主进程存在活动子进程，且未退出
- `waiting_input`
  - CLI 输出要求用户补充信息
- `waiting_permission`
  - CLI 输出审批请求或权限确认事件
- `completed`
  - 本次 run 正常退出，且有可展示输出
- `error`
  - 命令不存在、启动失败、异常退出、解析失败

### 10.3 会话状态持久化模型

当前会话状态不依赖外部 CLI 自己保存，而由本应用作为权威状态源持久化。

状态分为两层：

#### 第一层：工作窗口级状态

工作窗口级状态用于表达用户在 UI 中看到的“这个任务当前处于什么阶段”，保存在 `work_sessions` 表中。

建议持久化字段：

- `status`
- `latest_run_id`
- `last_message_at`
- `updated_at`
- `external_session_id`
- `active_assignee_type`
- `ai_team_member_id`
- `ai_runtime_config_id`
- `summary`

必要时可补充：

- `last_error_code`
- `last_error_message`
- `last_status_reason`

工作窗口级状态建议值：

- `idle`
- `running`
- `waiting_input`
- `waiting_permission`
- `completed`
- `error`
- `archived`

该层状态用于：

- 项目列表指标聚合
- 工作窗口列表展示
- 项目风险状态计算
- 应用重启后的快速恢复

#### 第二层：单次运行级状态

单次运行级状态用于表达“一次真实 CLI 执行”的生命周期，保存在 `runtime_runs` 表中。

建议状态值：

- `starting`
- `running`
- `waiting_input`
- `waiting_permission`
- `completed`
- `failed`
- `stopped`
- `interrupted`

建议持久化字段：

- `id`
- `work_session_id`
- `runtime_config_id`
- `provider`
- `pid`
- `command`
- `args_json`
- `cwd`
- `status`
- `started_at`
- `ended_at`
- `exit_code`
- `exit_signal`
- `error_summary`

该层状态用于：

- 精确记录每次执行过程
- 展示退出原因和失败细节
- 支持重试、恢复、诊断
- 区分“窗口状态”和“最近一次执行结果”

### 10.4 状态更新规则

状态更新采用“CLI 事件驱动 + 应用侧落库”的方式执行。

典型流程：

#### 用户发送消息

1. 创建新的 `runtime_runs`
2. 更新 `work_sessions.latest_run_id`
3. 更新 `work_sessions.status = running`
4. 插入用户消息

#### CLI 正常输出中

1. 持续写入 `runtime_events`
2. 若有结构化文本回复，批量写入 `messages`
3. `work_sessions.status` 保持 `running`

#### CLI 请求用户补充信息

1. `runtime_runs.status = waiting_input`
2. `work_sessions.status = waiting_input`
3. 写入 `runtime_events.type = status`
4. 可选写入一条系统消息说明等待原因

#### CLI 请求权限确认

1. `runtime_runs.status = waiting_permission`
2. `work_sessions.status = waiting_permission`
3. 写入 `runtime_events.type = permission_request`

#### CLI 正常结束

1. `runtime_runs.status = completed`
2. 写入退出事件与退出码
3. `work_sessions.status = completed`
4. 更新 `recent_output_at` 等聚合指标

#### CLI 启动失败或异常退出

1. `runtime_runs.status = failed`
2. 记录 `exit_code`、`stderr` 摘要、`error_summary`
3. `work_sessions.status = error`
4. 更新项目风险状态

#### 用户主动停止

1. 主进程发送 kill/stop
2. `runtime_runs.status = stopped`
3. `work_sessions.status` 回到 `idle` 或保留为 `completed`

MVP 推荐规则：

- 如果停止前已有可读输出，则回到 `completed`
- 如果几乎没有有效输出，则回到 `idle`

### 10.5 状态恢复规则

应用重启后，`work_sessions` 是 UI 恢复的主要来源，`runtime_runs` 是运行诊断的主要来源。

恢复规则：

#### 恢复工作窗口列表

- 直接读取 `work_sessions`
- 按 `updated_at` 或 `last_message_at` 排序
- 渲染最近状态、负责人、最近输出时间

#### 恢复消息流

- 从 `messages` 恢复主对话
- 从 `runtime_events` 恢复运行轨迹

#### 恢复中断中的运行

如果应用启动时发现：

- `runtime_runs.status = running`
- 但主进程当前没有对应活动子进程

则不能继续把窗口显示为“运行中”。

MVP 推荐处理：

1. 将该次 `runtime_runs.status` 改写为 `interrupted`
2. 将 `work_sessions.status` 改写为 `error`
3. 在 UI 中提示“上次运行已中断”
4. 提供以下恢复入口：
   - 重试当前任务
   - 切换 Runtime
   - 切换 Team 成员
   - 若 CLI 支持，则恢复外部会话

原因：

- 应用进程重启后无法假定外部 CLI 进程仍可被安全接管
- 避免 UI 长时间错误显示为“仍在运行”

#### 使用外部会话恢复

若某个 CLI 支持基于 `external_session_id` 恢复连续会话：

- 可将该 ID 保存在 `work_sessions.external_session_id`
- 重试时由对应 Runtime Adapter 决定是否透传
- 该 ID 仅作为恢复线索，不作为应用主状态来源

### 10.6 上下文压缩策略

上下文压缩不是简单截断历史，而是生成结构化压缩快照，优先保留任务连续性和决策链。

#### 触发条件

- 上下文 token 预计接近模型限制
- 单窗口引用文件过多
- 历史消息过长
- 用户主动要求压缩

#### 压缩内容

压缩结果至少保留：

- 当前任务目标
- 已确认的关键决策
- 仍未解决的关键问题
- 技术或产品约束
- 已有结论或阶段性产出
- 下一步建议动作
- 必要来源引用

#### 数据结构

建议将压缩结果持久化为 `context_snapshots`：

- `summary` 用于人类快速浏览
- `decision_summary_json` 存关键决策
- `open_questions_json` 存未决问题
- `constraints_json` 存约束
- `next_actions_json` 存下一步动作
- `preserved_refs_json` 存保留下来的来源引用
- `is_pinned` 表示是否固定保留

#### 保留规则

- 关键决策、关键问题和关键约束可被标记为 pinned
- pinned 内容在后续压缩中优先保留
- 新压缩结果应引用旧压缩结果的关键条目，而不是直接替代全部历史
- 压缩结果可以作为后续会话的上下文资产再次引用

#### 交互规则

- 压缩前提示用户当前上下文过大
- 展示将要保留和将要舍弃的内容摘要
- 用户可以手动确认压缩
- 压缩后在 UI 中可查看压缩包，并一键引用到后续任务

#### 恢复规则

- 工作窗口打开后应优先读取最近一条未归档 `context_snapshot`
- 若存在 pinned 压缩结果，则作为后续窗口默认上下文候选
- 压缩结果可被转交任务和关联窗口继续引用

### 10.7 单一激活成员规则

MVP 中一个工作窗口的当前执行者只允许一个：

- `activeAssigneeType = team-member`
- 或 `activeAssigneeType = runtime`

成员切换时执行以下动作：

1. 终止当前未完成 run，或要求用户先停止
2. 更新 `work_sessions.ai_team_member_id` / `ai_runtime_config_id`
3. 插入 `messages.event_type = member_switch`
4. 后续消息继承新执行者

### 10.8 转交任务

#### 当前窗口内转交

1. 用户选择目标成员
2. 系统生成任务摘要
3. 插入一条 `handoff` 事件消息
4. 更新当前激活成员
5. 后续输入继续在同一窗口执行

#### 新开关联窗口转交

1. 复制任务标题、摘要、必要上下文引用
2. 创建 `child session`
3. 写入 `parent_work_session_id`
4. 父窗口插入“已派生子任务”事件

### 10.9 关联窗口策略

- 子窗口独立持有消息流和 run 记录
- 父子关系只用于导航与任务脉络，不共享运行状态
- 父窗口关闭不影响子窗口
- 子窗口可继续派生孙级窗口，但 UI 首版仅展示直接父级和直接子级

## 11. 项目指标设计

### 11.1 聚合方式

项目指标不在每次列表查询时实时全量扫描消息表，而是使用“事件驱动增量更新 + 必要时重算”的方式。

触发聚合更新的事件：

- 工作窗口创建
- 工作窗口状态变化
- Runtime run 开始 / 结束
- 生成输出成功
- 文件变更事件写入
- 权限等待事件写入
- 错误事件写入

### 11.2 聚合服务

`ProjectMetricsService` 负责：

- 计算最新状态
- 更新 `projects.risk_status`
- 更新 `project_metric_snapshots`
- 向渲染层推送 `projectMetricsUpdated`

### 11.3 风险状态计算

- `risk`
  - `error_session_count > 0`
  - 或最近一次 run 失败且未恢复
- `attention`
  - `waiting_input_count > 0`
  - 或 `waiting_permission_count > 0`
- `normal`
  - 其他情况

## 12. 项目创建向导实现

### 12.1 向导步骤

1. 基本信息
2. 协作对象设置
3. 创建确认

### 12.2 前端交互状态

```ts
interface ProjectWizardDraft {
  name: string;
  description?: string;
  localPath: string;
  phase: ProjectPhase;
  defaultAiTeamId?: string;
  defaultAiRuntimeConfigId?: string;
  derivedMode: 'team' | 'manual';
  postCreateAction: 'open-project' | 'open-dashboard' | 'open-first-session';
  autoOpenBlankSession?: boolean;
}
```

### 12.3 创建流程

1. 前端校验字段
2. 调用 `project:create`
3. 主进程：
   - 校验目录存在与访问权限
   - 校验 Team 可用性
   - 校验 Runtime 可用性
   - 根据默认协作对象推导 `mode`
   - 落库
   - 初始化指标快照
4. 若选择创建首个工作窗口：
   - Team 模式自动带入默认成员建议
   - 自由模式优先带入项目默认 Runtime；若未配置默认 Runtime，则要求用户手动选择 Runtime

### 12.4 失败回滚

- `project:create` 采用单事务
- 若项目创建成功但默认动作失败：
  - 项目仍保留
  - UI 提示“项目已创建，后续动作未完成”

## 13. ccswitch 导入设计

### 13.1 支持输入源

- deep link 文本
- JSON 片段
- 导出文件

### 13.2 导入流程

1. 用户输入原始内容
2. `ImportService` 识别格式
3. 解析 Provider 配置
4. 映射为内部 `RuntimeImportPreview[]`
5. 检查重名、敏感字段、可映射的 CLI 类型
6. 渲染预览页
7. 用户确认后执行导入
8. 写入业务表
9. 写入敏感凭据
10. 触发 CLI 检测

### 13.3 字段映射

#### 基础映射

- `app -> provider`
- `name -> name`
- `model -> model`
- `endpoint -> source_ref / notes`
- `config -> raw import payload`
- `enabled -> enabled`

#### 敏感映射

- `apiKey`
- `token`
- `usageApiKey`

这些字段只进入 `SecretService`，不落入明文数据库列。

### 13.4 冲突策略

- `rename`
- `overwrite`
- `skip`

其中 `overwrite` 实际为“更新元数据 + 可选替换 secret”，不删除历史引用。

## 14. 安全设计

### 14.1 Electron 安全基线

- `contextIsolation = true`
- `nodeIntegration = false`
- 渲染层禁用直接 `require`
- 所有文件系统与进程能力经 `preload` 暴露

### 14.2 凭据保存

推荐方案：

- macOS：Keychain
- Windows：Credential Manager

通过统一 `SecretService` 封装，渲染层永远拿不到明文 secret，最多拿到：

- 是否已配置
- 脱敏摘要
- 最近验证时间

### 14.3 CLI 执行安全

- 默认工作目录限制在项目目录
- 环境变量采用白名单透传
- 日志中不记录完整敏感参数
- 权限请求事件必须显式展示到 UI

### 14.4 数据隔离

- 项目之间不共享上下文引用
- 工作窗口之间不自动共享消息
- 仅通过显式引用或派生子窗口共享摘要

## 15. 恢复与容错设计

### 15.1 应用重启恢复

应用启动后恢复：

- 项目列表
- 工作窗口列表
- 最近打开会话
- 未完成输入草稿
- 历史消息和运行日志

### 15.2 活动进程恢复策略

MVP 不保证崩溃后自动接管原 CLI 进程，采用以下策略：

- 启动时检查 `runtime_runs.status = running`
- 标记为 `interrupted`
- 对应工作窗口展示：
  - 上次运行异常中断
  - 可重试
  - 可恢复外部会话（若 CLI 支持）

### 15.3 Runtime 不可用恢复入口

当命令不存在、版本不兼容或认证失效时，UI 统一提供：

- 重新检测
- 切换 Runtime
- 切换 Team 成员
- 打开 Runtime 配置页

## 16. 性能设计

### 16.1 列表性能

- 项目列表查询不 join 全量消息表
- 指标基于聚合表或缓存字段
- 工作窗口列表按项目分页

### 16.2 消息流性能

- 消息分页加载
- RuntimeEvent 与 Message 分开展示和按需加载
- 长输出先流式追加到内存，再批量落库，避免每个 chunk 触发一次数据库写入

### 16.3 输入与输出渲染规则

工作窗口消息流需要把 `Message` 作为主内容源，把 `RuntimeEvent` 作为可展开的运行细节源。

#### 输入渲染

用户消息展示分三层：

1. 主消息内容
   - 直接显示用户输入文本
2. 输入摘要
   - 来自 `messages.input_summary_json`
   - 展示引用文件数量、项目资料数量、当前成员、Runtime、工作目录、权限级别
3. 完整输入包
   - 来自 `messages.input_envelope_snapshot_json`
   - 默认折叠，仅在用户展开时显示

#### 输出渲染

AI 回复展示分三层：

1. 主内容层
   - 以 `messages.content` 作为最终可读答案
   - 支持 Markdown 渲染与流式追加
2. 结果摘要层
   - 来自 `messages.display_state_json`
   - 展示当前结果是完成、等待输入、等待权限、失败还是中断
3. 运行细节层
   - 来自关联 `runtime_events`
   - 按 `display_category` 分组展示：
     - `tool_call`
     - `file_change`
     - `permission_request`
     - `command_execution`
     - `stderr`
     - `status`

#### 展示原则

- 默认优先展示可读答案，不把运行日志直接混入主回复正文
- Team 模式下每条 AI 回复都必须显示成员标识
- 失败结果优先展示人类可理解的错误摘要，再允许展开查看原始错误
- 工具调用、文件变更、权限请求、原始 stderr 默认折叠
- 敏感字段在任何展示层都必须脱敏

### 16.3 文件处理性能

- 文件选择采用异步扫描
- 默认只读取用户显式选择文件
- 大文件只做摘要或片段引用

## 17. 日志与可观测性

### 17.1 业务日志

记录：

- 项目创建
- Team 绑定变更
- 会话创建
- 成员切换
- 转交任务
- Runtime 检测结果

### 17.2 运行日志

记录：

- 启动命令摘要
- 工作目录
- 退出码
- stderr 摘要
- 关键事件

### 17.3 日志约束

- 不记录 secret 明文
- 不记录完整上下文文件内容到普通诊断日志
- 调试模式和生产模式日志级别分离

## 18. 测试策略

### 18.1 单元测试

覆盖：

- ccswitch 解析器
- RuntimeAdapter 命令构建
- 事件翻译器
- 指标聚合规则
- 状态机转换

### 18.2 集成测试

覆盖：

- 新建 Runtime -> 检测 -> 保存
- 新建 Team -> 绑定成员
- 新建项目 -> 创建工作窗口
- 发送消息 -> 启动 CLI -> 写入消息/事件
- 切换成员 -> 插入事件 -> 后续运行使用新成员
- 运行失败 -> 恢复入口展示

### 18.3 端到端测试

覆盖：

- 首次启动引导
- Team 模式与自由模式创建项目
- ccswitch 导入
- 项目列表指标刷新
- 关联窗口创建与返回父窗口

## 19. MVP 实施顺序

### Phase 1：应用骨架

- Electron + React + preload 基础搭建
- SQLite 初始化
- 路由与页面骨架

### Phase 2：Runtime 管理

- Runtime 配置 CRUD
- CLI 检测
- SecretService
- ccswitch 导入预览

### Phase 3：Team 与项目

- Team CRUD
- 项目 CRUD
- 创建项目向导
- Dashboard 指标展示

### Phase 4：工作窗口与 CLI 执行

- WorkSession CRUD
- 消息流 UI
- RuntimeProcessManager
- Claude / Codex / Custom Adapter

### Phase 5：协作规则

- 成员切换
- 转交任务
- 关联窗口
- 恢复入口

## 20. 非 MVP 预留点

以下能力在设计上已预留接口，但不在首版完整实现：

- API Provider 适配器
- 同窗口多人自动群聊
- 多 Agent 自动分工编排
- 文件写入审批 diff 面板
- 云同步
- 多语言界面
- 原生多 BrowserWindow 工作区

## 21. 待确认但本设计已给出推荐值的问题

### 21.1 本地存储

- 推荐：SQLite
- 不推荐：JSON 作为主存储

原因：消息、事件、指标、过滤与恢复都更适合关系型本地库。

### 21.2 工作窗口形态

- 推荐：主窗口内工作区页面 / 标签式工作区
- 后续可扩展：独立 BrowserWindow

原因：MVP 更稳，状态恢复更简单。

### 21.3 凭据保存

- 推荐：系统 Keychain / Credential Manager
- 备选：应用级主密钥

原因：桌面端首版优先复用系统安全能力。

### 21.4 Gemini CLI

- 推荐：不进入首版承诺范围
- 原因：先把 Claude / Codex / Custom 三类适配层打稳

## 22. 进入开发前的输出物建议

基于本技术设计，下一步建议补充两类文档：

1. `docs/DB_SCHEMA.md`
   - 落具体建表 SQL / ORM schema
2. `docs/IMPLEMENTATION_PLAN.md`
   - 把 MVP 分解为开发任务、里程碑和验收清单
