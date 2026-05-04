# AI Agent Workspace Database Schema

## 1. 文档信息

- 文档名称：AI Agent Workspace Database Schema
- 对应需求文档：`docs/PRD.md`
- 对应技术设计：`docs/TECH_DESIGN.md`
- 文档版本：v0.1
- 当前阶段：MVP 数据库设计
- 目标数据库：SQLite
- 推荐访问层：Drizzle ORM 或等价轻量封装

## 2. 设计结论

基于现有 PRD 与技术设计，数据库设计不建议只围绕页面表单建表，而应围绕以下稳定领域对象建模：

- AI Runtime 配置
- Agent 公用配置
- AI Team 与成员
- 项目
- 工作窗口
- 对话消息
- Runtime 执行记录与事件流
- 项目上下文资料与压缩快照
- 项目指标快照

原因：

- 页面字段会随交互变化，但这些领域对象是产品核心概念。
- 工作窗口、消息、运行事件需要长期沉淀，不能只存为临时 UI 状态。
- CLI Agent 运行日志、上下文引用和配置快照需要可追踪，否则后续无法解释“某次输出是基于什么配置产生的”。
- 凭据不应进入普通业务表，业务库只保存凭据引用。

MVP 不建议过早拆出自动编排、云同步和向量检索表。权限模型建议从一开始独立建模，避免后续从单个枚举字段迁移到多层继承时影响 Runtime、Team、Project 和 Session 的核心链路。

## 3. 通用约定

### 3.1 ID 与时间

- 主键统一使用 `TEXT` 类型 ID，建议由应用层生成 UUID/ULID。
- 时间字段统一使用 ISO 8601 字符串，SQLite 类型为 `TEXT`。
- 所有主业务表保留：
  - `created_at`
  - `updated_at`
- 归档使用 `archived_at`，不使用硬删除表达归档。

### 3.2 JSON 字段

SQLite 中 JSON 字段统一使用 `TEXT` 存储 JSON 字符串。

命名约定：

- 数组或对象配置使用 `_json` 后缀
- 运行时快照使用 `_snapshot_json` 后缀
- 对展示层有直接影响的状态使用 `display_*_json`

JSON 字段适合承载：

- CLI 默认参数
- 环境变量白名单
- 输入包快照
- Runtime 配置快照
- token 用量
- 错误对象
- 上下文压缩结构

JSON 字段不适合承载：

- 可查询频率很高的状态字段
- 外键关系
- 敏感凭据明文
- 需要排序或聚合的核心指标

### 3.3 软删除与归档

MVP 默认优先使用归档和禁用：

- 项目归档：写入 `projects.archived_at`
- 工作窗口归档：写入 `work_sessions.archived_at`
- Runtime 禁用：写入 `ai_runtime_configs.enabled = 0`
- Team 成员禁用：写入 `ai_team_members.enabled = 0`

硬删除只用于用户明确确认删除历史数据的场景。

### 3.4 凭据处理

普通 SQLite 业务表不得保存 API Key、Token、Usage API Key 等敏感值明文。

凭据保存策略：

- 敏感值进入系统凭据存储，例如 Keychain 或 Credential Manager。
- SQLite 只保存 `secret_ref`、`secret_kind`、`masked_value` 和验证时间。
- 任何快照、日志、事件和错误字段写入前必须脱敏。

## 4. 枚举定义

### 4.1 Runtime

`runtime_type`

- `cli_agent`
- `api_provider`

MVP 仅启用 `cli_agent`，`api_provider` 作为预留值。

`provider`

- `claude_code_cli`
- `codex_cli`
- `gemini_cli`
- `custom_cli`

`runtime_source`

- `manual`
- `ccswitch`
- `imported`

`default_cwd_mode`

- `project_root`
- `custom_path`

`permission_preset`

- `read_only`
- `project_write`
- `command_approval`
- `full_access`

说明：`permission_preset` 只是快捷预设和 UI 摘要，不作为最终权限模型的唯一来源。最终权限由多个 `permission_policy_sets` 继承合并得到。

`permission_policy_owner_type`

- `agent_profile`
- `runtime_config`
- `team_member`
- `project`
- `work_session`

`permission_policy_scope`

- `workspace`
- `filesystem`
- `command`
- `network`
- `environment`
- `credential`
- `runtime`
- `tool`

`permission_policy_action`

- `read`
- `write`
- `create`
- `delete`
- `execute`
- `list`
- `request`
- `approve`
- `deny`

`permission_policy_decision`

- `allow`
- `ask`
- `deny`

`permission_policy_merge_strategy`

- `additive`
- `override`
- `restrictive`

合并语义：

- `additive`：追加权限规则，适合添加可访问目录、可执行命令白名单。
- `override`：同一 scope/action/path 命中时覆盖上一层规则，适合 Runtime 或 Session 临时覆盖。
- `restrictive`：只能收紧权限，适合项目或工作窗口的安全边界。

MVP 推荐内置权限设置：

- `Project Read Only`：允许读取项目资料和用户显式选择文件，禁止写文件和执行命令。
- `Project Safe Write`：允许写入项目目录内非敏感文件，命中删除、覆盖、批量修改时请求确认。
- `Command Approval`：执行 shell 命令前请求确认，高风险命令默认拒绝。
- `Git Safe`：允许 `git status`、`git diff` 等只读命令，`commit`、`push`、`reset` 等请求确认或拒绝。
- `Network Restricted`：默认拒绝外部网络访问，只允许用户配置的域名或本地服务。
- `Env Minimal`：只透传白名单环境变量，拒绝读取未授权 secret。
- `Full Access`：作为显式高风险模板保留，必须在 UI 中二次确认。

`runtime_test_status`

- `success`
- `command_not_found`
- `version_incompatible`
- `auth_unavailable`
- `startup_failed`
- `unknown_error`

### 4.2 Agent Profile

`output_style`

- `concise`
- `structured`
- `detailed`

`approval_mode`

- `auto`
- `manual`

### 4.3 Project

`project_mode`

- `team`
- `manual`

说明：项目模式由 `default_ai_team_id` 推导。`default_ai_team_id` 有值时为 `team`，否则为 `manual`。

`project_phase`

- `requirements`
- `design`
- `development`
- `testing`
- `delivery`
- `archived`

`risk_status`

- `normal`
- `attention`
- `risk`

### 4.4 Team

`team_default_launch_mode`

- `analysis`
- `development`
- `custom`

`team_member_role`

- `analyst`
- `architect`
- `developer`
- `tester`
- `reviewer`
- `summarizer`
- `custom`

### 4.5 Work Session

`assignment_mode`

- `team_member`
- `runtime`

`active_assignee_type`

- `team_member`
- `runtime`

`work_session_status`

- `idle`
- `running`
- `waiting_input`
- `waiting_permission`
- `completed`
- `error`
- `archived`

### 4.6 Message

`message_role`

- `user`
- `assistant`
- `system`
- `tool`

`message_event_type`

- `message`
- `member_switch`
- `handoff`
- `child_session_created`
- `context_snapshot`
- `runtime_status`
- `error`

### 4.7 Runtime Run 与 Event

`runtime_run_status`

- `starting`
- `running`
- `waiting_input`
- `waiting_permission`
- `completed`
- `failed`
- `stopped`
- `interrupted`

`runtime_event_type`

- `stdout`
- `stderr`
- `status`
- `tool_call`
- `file_change`
- `permission_request`
- `command_execution`
- `exit`
- `error`

`runtime_event_display_category`

- `message`
- `tool_call`
- `file_change`
- `permission_request`
- `command_execution`
- `stderr`
- `status`
- `debug`

### 4.8 Context

`context_item_type`

- `project_note`
- `local_file`
- `session_output`
- `manual_text`
- `external_link`

`context_snapshot_source_type`

- `manual`
- `auto_compression`
- `handoff`
- `session_summary`

## 5. 表结构

### 5.1 `agent_profiles`

Agent 公用配置表，用于保存可被 Runtime、Team 成员、项目和工作窗口复用的行为配置。

| 字段 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `id` | TEXT | 是 |  | 主键 |
| `name` | TEXT | 是 |  | 配置名称 |
| `description` | TEXT | 否 |  | 描述 |
| `permission_preset` | TEXT | 否 | `read_only` | 权限预设摘要 |
| `base_system_prompt` | TEXT | 否 |  | 基础 System Prompt |
| `role_prompt_template` | TEXT | 否 |  | 角色 Prompt 模板 |
| `default_args_json` | TEXT | 否 |  | 默认命令参数数组 |
| `default_cwd_mode` | TEXT | 是 | `project_root` | 默认工作目录策略 |
| `custom_cwd` | TEXT | 否 |  | 自定义工作目录 |
| `output_style` | TEXT | 否 |  | 输出风格偏好 |
| `approval_mode` | TEXT | 否 |  | 审批模式 |
| `env_whitelist_json` | TEXT | 否 |  | 环境变量白名单 |
| `created_at` | TEXT | 是 |  | 创建时间 |
| `updated_at` | TEXT | 是 |  | 更新时间 |
| `last_used_at` | TEXT | 否 |  | 最近使用时间 |

约束：

- `name` 建议唯一。
- `permission_preset` 必须为 `permission_preset` 枚举值。
- `default_cwd_mode = custom_path` 时，`custom_cwd` 应有值。

### 5.2 `permission_policy_sets`

可复用权限设置表。一个权限设置可以被多个 Agent Profile、Runtime、Team 成员、项目或工作窗口引用。

| 字段 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `id` | TEXT | 是 |  | 主键 |
| `name` | TEXT | 是 |  | 权限设置名称 |
| `description` | TEXT | 否 |  | 描述 |
| `preset` | TEXT | 否 |  | 对应快捷预设，可为空 |
| `rules_json` | TEXT | 是 |  | 权限规则数组 |
| `enabled` | INTEGER | 是 | `1` | 是否启用 |
| `created_at` | TEXT | 是 |  | 创建时间 |
| `updated_at` | TEXT | 是 |  | 更新时间 |
| `last_used_at` | TEXT | 否 |  | 最近使用时间 |

`rules_json` 建议结构：

```json
[
  {
    "scope": "filesystem",
    "action": "write",
    "decision": "ask",
    "resources": ["${projectRoot}/src/**"],
    "description": "写入项目源代码前请求确认"
  },
  {
    "scope": "command",
    "action": "execute",
    "decision": "deny",
    "resources": ["rm", "git reset --hard"]
  }
]
```

约束：

- `preset` 有值时必须为 `permission_preset` 枚举值。
- `rules_json` 中的 `scope`、`action`、`decision` 必须使用对应枚举。
- `enabled` 使用 `0/1`。

### 5.3 `permission_policy_bindings`

权限设置绑定表。用于表达“某个对象继承多个权限设置”。

| 字段 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `id` | TEXT | 是 |  | 主键 |
| `owner_type` | TEXT | 是 |  | 绑定对象类型 |
| `owner_id` | TEXT | 是 |  | 绑定对象 ID |
| `permission_policy_set_id` | TEXT | 是 |  | 权限设置 ID |
| `merge_strategy` | TEXT | 是 | `additive` | 合并策略 |
| `priority` | INTEGER | 是 | `0` | 同层排序，数字越大越后应用 |
| `enabled` | INTEGER | 是 | `1` | 是否启用 |
| `created_at` | TEXT | 是 |  | 创建时间 |
| `updated_at` | TEXT | 是 |  | 更新时间 |

外键：

- `permission_policy_set_id` -> `permission_policy_sets.id`，删除权限设置时级联删除绑定。

约束：

- `owner_type` 必须为 `permission_policy_owner_type` 枚举值。
- `merge_strategy` 必须为 `permission_policy_merge_strategy` 枚举值。
- `enabled` 使用 `0/1`。
- `owner_type + owner_id + permission_policy_set_id` 唯一。
- `owner_id` 由于是多态引用，不建立数据库级外键，由服务层按 `owner_type` 校验。

说明：

- 选择多态绑定表，是为了避免为 Agent Profile、Runtime、Team Member、Project、Work Session 分别维护一张绑定表。
- 若后续需要更强数据库级约束，可以迁移为多张强类型绑定表。

### 5.4 `ai_runtime_configs`

AI Runtime 配置表。MVP 优先保存 CLI Agent 配置。

| 字段 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `id` | TEXT | 是 |  | 主键 |
| `name` | TEXT | 是 |  | 配置名称 |
| `runtime_type` | TEXT | 是 | `cli_agent` | Runtime 类型 |
| `provider` | TEXT | 是 |  | CLI Provider |
| `agent_profile_id` | TEXT | 否 |  | 引用的 Agent 公用配置 |
| `source` | TEXT | 是 | `manual` | 来源 |
| `source_ref` | TEXT | 否 |  | 导入来源摘要 |
| `model` | TEXT | 否 |  | 默认模型或模型偏好 |
| `executable_path` | TEXT | 否 |  | CLI 可执行命令或路径 |
| `default_args_json` | TEXT | 否 |  | 默认参数数组 |
| `default_cwd_mode` | TEXT | 是 | `project_root` | 工作目录策略 |
| `custom_cwd` | TEXT | 否 |  | 自定义工作目录 |
| `system_prompt` | TEXT | 否 |  | Runtime 自身 System Prompt 覆盖 |
| `stream_enabled` | INTEGER | 是 | `1` | 是否启用流式输出 |
| `permission_preset` | TEXT | 否 |  | Runtime 权限预设摘要 |
| `is_default` | INTEGER | 是 | `0` | 是否默认 Runtime |
| `enabled` | INTEGER | 是 | `1` | 是否启用 |
| `notes` | TEXT | 否 |  | 备注 |
| `last_test_status` | TEXT | 否 |  | 最近检测结果 |
| `last_test_message` | TEXT | 否 |  | 最近检测摘要 |
| `last_tested_at` | TEXT | 否 |  | 最近检测时间 |
| `created_at` | TEXT | 是 |  | 创建时间 |
| `updated_at` | TEXT | 是 |  | 更新时间 |
| `last_used_at` | TEXT | 否 |  | 最近使用时间 |

外键：

- `agent_profile_id` -> `agent_profiles.id`，删除 Agent Profile 时置空。

约束：

- `provider` 必须为 `provider` 枚举值。
- `source` 必须为 `runtime_source` 枚举值。
- `permission_preset` 有值时必须为 `permission_preset` 枚举值。
- `stream_enabled`、`is_default`、`enabled` 使用 `0/1`。
- 同一时间建议最多一个 `is_default = 1` 且 `enabled = 1` 的 Runtime，由应用服务保证。

### 5.5 `ai_runtime_secrets`

Runtime 凭据引用表。只保存凭据索引和脱敏展示，不保存明文。

| 字段 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `id` | TEXT | 是 |  | 主键 |
| `runtime_config_id` | TEXT | 是 |  | 所属 Runtime |
| `secret_kind` | TEXT | 是 |  | 凭据类型，例如 `api_key`、`token`、`usage_api_key` |
| `secret_ref` | TEXT | 是 |  | 系统凭据存储引用 |
| `masked_value` | TEXT | 否 |  | 脱敏展示值 |
| `last_validated_at` | TEXT | 否 |  | 最近验证时间 |
| `created_at` | TEXT | 是 |  | 创建时间 |
| `updated_at` | TEXT | 是 |  | 更新时间 |

外键：

- `runtime_config_id` -> `ai_runtime_configs.id`，删除 Runtime 时级联删除引用记录。

约束：

- `runtime_config_id + secret_kind` 唯一。

### 5.6 `ai_teams`

AI Team 表。

| 字段 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `id` | TEXT | 是 |  | 主键 |
| `name` | TEXT | 是 |  | Team 名称 |
| `goal` | TEXT | 否 |  | 团队目标 |
| `description` | TEXT | 否 |  | 团队描述 |
| `default_launch_mode` | TEXT | 否 |  | 默认启动模式 |
| `created_at` | TEXT | 是 |  | 创建时间 |
| `updated_at` | TEXT | 是 |  | 更新时间 |
| `last_used_at` | TEXT | 否 |  | 最近使用时间 |

约束：

- `name` 建议唯一。

### 5.7 `ai_team_members`

AI Team 成员表。每个成员绑定一个 Runtime。

| 字段 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `id` | TEXT | 是 |  | 主键 |
| `team_id` | TEXT | 是 |  | 所属 Team |
| `name` | TEXT | 是 |  | 成员名称 |
| `role` | TEXT | 是 |  | 成员角色 |
| `runtime_config_id` | TEXT | 是 |  | 绑定 Runtime |
| `agent_profile_id` | TEXT | 否 |  | 成员级 Agent Profile |
| `task_instruction` | TEXT | 否 |  | 成员任务说明 |
| `enabled` | INTEGER | 是 | `1` | 是否启用 |
| `sort_order` | INTEGER | 是 | `0` | 排序 |
| `created_at` | TEXT | 是 |  | 创建时间 |
| `updated_at` | TEXT | 是 |  | 更新时间 |

外键：

- `team_id` -> `ai_teams.id`，删除 Team 时级联删除成员。
- `runtime_config_id` -> `ai_runtime_configs.id`，Runtime 被引用时默认禁止硬删除。
- `agent_profile_id` -> `agent_profiles.id`，删除 Agent Profile 时置空。

约束：

- `role` 必须为 `team_member_role` 枚举值。
- `enabled` 使用 `0/1`。

### 5.8 `projects`

项目表。项目模式由默认协作对象推导，但为了列表查询效率仍保留 `mode` 字段作为冗余快照。

| 字段 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `id` | TEXT | 是 |  | 主键 |
| `name` | TEXT | 是 |  | 项目名称 |
| `description` | TEXT | 否 |  | 项目描述 |
| `local_path` | TEXT | 是 |  | 本地项目目录 |
| `mode` | TEXT | 是 | `manual` | 推导后的项目模式 |
| `phase` | TEXT | 是 | `requirements` | 当前阶段 |
| `default_ai_team_id` | TEXT | 否 |  | 默认 AI Team |
| `default_ai_runtime_config_id` | TEXT | 否 |  | 默认 Runtime |
| `default_agent_profile_id` | TEXT | 否 |  | 项目级默认 Agent Profile |
| `risk_status` | TEXT | 是 | `normal` | 风险状态 |
| `archived_at` | TEXT | 否 |  | 归档时间 |
| `created_at` | TEXT | 是 |  | 创建时间 |
| `updated_at` | TEXT | 是 |  | 更新时间 |
| `last_active_at` | TEXT | 否 |  | 最近活动时间 |

外键：

- `default_ai_team_id` -> `ai_teams.id`，删除 Team 时置空。
- `default_ai_runtime_config_id` -> `ai_runtime_configs.id`，删除 Runtime 时置空或禁止硬删除。
- `default_agent_profile_id` -> `agent_profiles.id`，删除 Agent Profile 时置空。

约束：

- `mode` 必须为 `project_mode` 枚举值。
- `phase` 必须为 `project_phase` 枚举值。
- `risk_status` 必须为 `risk_status` 枚举值。
- `default_ai_team_id` 有值时，`mode` 应为 `team`。
- `default_ai_team_id` 为空时，`mode` 应为 `manual`。

### 5.9 `project_metric_snapshots`

项目指标快照表，用于主工作台聚合展示。

| 字段 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `id` | TEXT | 是 |  | 主键 |
| `project_id` | TEXT | 是 |  | 所属项目 |
| `active_session_count` | INTEGER | 是 | `0` | 活跃窗口数 |
| `running_agent_count` | INTEGER | 是 | `0` | 运行中 Agent 数 |
| `waiting_input_count` | INTEGER | 是 | `0` | 等待用户输入数 |
| `waiting_permission_count` | INTEGER | 是 | `0` | 等待权限确认数 |
| `error_session_count` | INTEGER | 是 | `0` | 出错窗口数 |
| `recent_output_at` | TEXT | 否 |  | 最近产出时间 |
| `recent_failure_at` | TEXT | 否 |  | 最近失败时间 |
| `recent_runtime_type` | TEXT | 否 |  | 最近使用 Runtime Provider |
| `file_change_count` | INTEGER | 是 | `0` | 文件变更数量摘要 |
| `snapshot_at` | TEXT | 是 |  | 快照时间 |

外键：

- `project_id` -> `projects.id`，删除项目时级联删除。

说明：

- MVP 可以只保留每个项目最新一条快照，由服务层覆盖式更新。
- 如果后续需要趋势图，可以改为保留时间序列。

### 5.10 `work_sessions`

工作窗口表。一个工作窗口是独立的 AI 工作空间。

| 字段 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `id` | TEXT | 是 |  | 主键 |
| `project_id` | TEXT | 是 |  | 所属项目 |
| `title` | TEXT | 是 |  | 窗口名称 |
| `goal` | TEXT | 否 |  | 任务目标 |
| `status` | TEXT | 是 | `idle` | 窗口状态 |
| `ai_team_id` | TEXT | 否 |  | 当前绑定 Team |
| `ai_team_member_id` | TEXT | 否 |  | 当前激活 Team 成员 |
| `ai_runtime_config_id` | TEXT | 否 |  | 当前直接 Runtime 或成员 Runtime 快照 |
| `agent_profile_id` | TEXT | 否 |  | 窗口级 Agent Profile 覆盖 |
| `assignment_mode` | TEXT | 是 |  | 分配模式 |
| `active_assignee_type` | TEXT | 是 |  | 当前执行者类型 |
| `parent_work_session_id` | TEXT | 否 |  | 父窗口 |
| `external_session_id` | TEXT | 否 |  | 外部 CLI 会话 ID |
| `latest_run_id` | TEXT | 否 |  | 最近一次 Runtime Run |
| `summary` | TEXT | 否 |  | 窗口摘要 |
| `resolved_config_snapshot_json` | TEXT | 否 |  | 最终生效配置快照 |
| `archived_at` | TEXT | 否 |  | 归档时间 |
| `created_at` | TEXT | 是 |  | 创建时间 |
| `updated_at` | TEXT | 是 |  | 更新时间 |
| `last_message_at` | TEXT | 否 |  | 最近消息时间 |

外键：

- `project_id` -> `projects.id`，删除项目时级联删除。
- `ai_team_id` -> `ai_teams.id`，删除 Team 时置空。
- `ai_team_member_id` -> `ai_team_members.id`，删除成员时置空。
- `ai_runtime_config_id` -> `ai_runtime_configs.id`，Runtime 被引用时默认禁止硬删除。
- `agent_profile_id` -> `agent_profiles.id`，删除 Agent Profile 时置空。
- `parent_work_session_id` -> `work_sessions.id`，删除父窗口时置空或保留孤儿子窗口。
- `latest_run_id` -> `runtime_runs.id`，可延迟建立或由服务层维护，避免循环建表问题。

约束：

- `status` 必须为 `work_session_status` 枚举值。
- `assignment_mode` 必须为 `assignment_mode` 枚举值。
- `active_assignee_type` 必须为 `active_assignee_type` 枚举值。
- `active_assignee_type = team_member` 时，`ai_team_member_id` 应有值。
- `active_assignee_type = runtime` 时，`ai_runtime_config_id` 应有值。

### 5.11 `messages`

消息表。用于保存主对话流和关键系统事件。

| 字段 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `id` | TEXT | 是 |  | 主键 |
| `work_session_id` | TEXT | 是 |  | 所属工作窗口 |
| `role` | TEXT | 是 |  | 消息角色 |
| `event_type` | TEXT | 是 | `message` | 消息事件类型 |
| `ai_team_member_id` | TEXT | 否 |  | AI 输出所属成员 |
| `from_ai_team_member_id` | TEXT | 否 |  | 转交来源成员 |
| `to_ai_team_member_id` | TEXT | 否 |  | 转交目标成员 |
| `content` | TEXT | 是 |  | 可读正文 |
| `input_summary_json` | TEXT | 否 |  | 用户输入摘要 |
| `input_envelope_snapshot_json` | TEXT | 否 |  | 完整输入包快照 |
| `display_state_json` | TEXT | 否 |  | 展示状态摘要 |
| `runtime_snapshot_json` | TEXT | 否 |  | 本条消息关联 Runtime 快照 |
| `token_usage_json` | TEXT | 否 |  | Token 用量 |
| `error_json` | TEXT | 否 |  | 错误对象 |
| `created_at` | TEXT | 是 |  | 创建时间 |

外键：

- `work_session_id` -> `work_sessions.id`，删除工作窗口时级联删除。
- `ai_team_member_id` -> `ai_team_members.id`，删除成员时置空。
- `from_ai_team_member_id` -> `ai_team_members.id`，删除成员时置空。
- `to_ai_team_member_id` -> `ai_team_members.id`，删除成员时置空。

约束：

- `role` 必须为 `message_role` 枚举值。
- `event_type` 必须为 `message_event_type` 枚举值。

### 5.12 `runtime_runs`

Runtime 单次执行记录表。用于记录一次真实 CLI 进程生命周期。

| 字段 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `id` | TEXT | 是 |  | 主键 |
| `work_session_id` | TEXT | 是 |  | 所属工作窗口 |
| `runtime_config_id` | TEXT | 是 |  | 使用的 Runtime |
| `provider` | TEXT | 是 |  | Provider 快照 |
| `pid` | INTEGER | 否 |  | 子进程 PID |
| `status` | TEXT | 是 | `starting` | Run 状态 |
| `command` | TEXT | 否 |  | 启动命令摘要 |
| `args_json` | TEXT | 否 |  | 启动参数 |
| `cwd` | TEXT | 否 |  | 工作目录 |
| `env_summary_json` | TEXT | 否 |  | 环境变量脱敏摘要 |
| `started_at` | TEXT | 是 |  | 启动时间 |
| `ended_at` | TEXT | 否 |  | 结束时间 |
| `exit_code` | INTEGER | 否 |  | 退出码 |
| `exit_signal` | TEXT | 否 |  | 退出信号 |
| `error_summary` | TEXT | 否 |  | 错误摘要 |

外键：

- `work_session_id` -> `work_sessions.id`，删除工作窗口时级联删除。
- `runtime_config_id` -> `ai_runtime_configs.id`，Runtime 被引用时默认禁止硬删除。

约束：

- `status` 必须为 `runtime_run_status` 枚举值。
- `provider` 必须为 `provider` 枚举值。

### 5.13 `runtime_events`

Runtime 事件流表。用于保存 stdout、stderr、工具调用、权限请求、文件变更等运行细节。

| 字段 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `id` | TEXT | 是 |  | 主键 |
| `run_id` | TEXT | 是 |  | 所属 Runtime Run |
| `work_session_id` | TEXT | 是 |  | 冗余所属工作窗口，便于查询 |
| `runtime_config_id` | TEXT | 是 |  | Runtime 快照引用 |
| `type` | TEXT | 是 |  | 事件类型 |
| `content` | TEXT | 否 |  | 事件可读内容 |
| `metadata_json` | TEXT | 否 |  | 结构化事件数据 |
| `display_category` | TEXT | 是 | `status` | UI 展示分组 |
| `sequence_no` | INTEGER | 是 |  | Run 内顺序号 |
| `created_at` | TEXT | 是 |  | 创建时间 |

外键：

- `run_id` -> `runtime_runs.id`，删除 Run 时级联删除。
- `work_session_id` -> `work_sessions.id`，删除工作窗口时级联删除。
- `runtime_config_id` -> `ai_runtime_configs.id`，Runtime 被引用时默认禁止硬删除。

约束：

- `type` 必须为 `runtime_event_type` 枚举值。
- `display_category` 必须为 `runtime_event_display_category` 枚举值。
- `run_id + sequence_no` 唯一。

### 5.14 `context_items`

项目上下文资料表。保存项目资料、手动文本、文件引用和历史产出引用。

| 字段 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `id` | TEXT | 是 |  | 主键 |
| `project_id` | TEXT | 是 |  | 所属项目 |
| `work_session_id` | TEXT | 否 |  | 所属或来源工作窗口 |
| `type` | TEXT | 是 |  | 上下文类型 |
| `title` | TEXT | 是 |  | 标题 |
| `path` | TEXT | 否 |  | 本地路径或引用路径 |
| `content` | TEXT | 否 |  | 文本内容或缓存片段 |
| `content_hash` | TEXT | 否 |  | 内容哈希 |
| `created_at` | TEXT | 是 |  | 创建时间 |
| `updated_at` | TEXT | 是 |  | 更新时间 |

外键：

- `project_id` -> `projects.id`，删除项目时级联删除。
- `work_session_id` -> `work_sessions.id`，删除工作窗口时置空或级联，具体取决于上下文类型。

约束：

- `type` 必须为 `context_item_type` 枚举值。
- `type = local_file` 时，`path` 应有值。

### 5.15 `context_snapshots`

上下文压缩快照表。用于保存结构化压缩结果。

| 字段 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `id` | TEXT | 是 |  | 主键 |
| `project_id` | TEXT | 是 |  | 所属项目 |
| `work_session_id` | TEXT | 否 |  | 所属工作窗口 |
| `source_type` | TEXT | 是 |  | 快照来源 |
| `title` | TEXT | 是 |  | 标题 |
| `summary` | TEXT | 否 |  | 人类可读摘要 |
| `decision_summary_json` | TEXT | 否 |  | 关键决策 |
| `open_questions_json` | TEXT | 否 |  | 未决问题 |
| `constraints_json` | TEXT | 否 |  | 约束 |
| `next_actions_json` | TEXT | 否 |  | 下一步动作 |
| `preserved_refs_json` | TEXT | 否 |  | 保留来源引用 |
| `is_pinned` | INTEGER | 是 | `0` | 是否固定保留 |
| `created_at` | TEXT | 是 |  | 创建时间 |
| `updated_at` | TEXT | 是 |  | 更新时间 |

外键：

- `project_id` -> `projects.id`，删除项目时级联删除。
- `work_session_id` -> `work_sessions.id`，删除工作窗口时置空。

约束：

- `source_type` 必须为 `context_snapshot_source_type` 枚举值。
- `is_pinned` 使用 `0/1`。

### 5.16 `session_context_refs`

工作窗口引用上下文资料的关联表。

| 字段 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `id` | TEXT | 是 |  | 主键 |
| `work_session_id` | TEXT | 是 |  | 工作窗口 |
| `context_item_id` | TEXT | 是 |  | 上下文资料 |
| `included_by` | TEXT | 否 |  | 引入来源，例如 `user`、`system`、`handoff` |
| `created_at` | TEXT | 是 |  | 创建时间 |

外键：

- `work_session_id` -> `work_sessions.id`，删除工作窗口时级联删除。
- `context_item_id` -> `context_items.id`，删除上下文资料时级联删除。

约束：

- `work_session_id + context_item_id` 唯一。

## 6. 推荐索引

### 6.1 Runtime 与 Agent Profile

```sql
CREATE INDEX idx_ai_runtime_configs_enabled_provider
ON ai_runtime_configs(enabled, provider);

CREATE INDEX idx_ai_runtime_configs_last_used
ON ai_runtime_configs(last_used_at DESC);

CREATE INDEX idx_agent_profiles_last_used
ON agent_profiles(last_used_at DESC);
```

### 6.2 Permission

```sql
CREATE INDEX idx_permission_policy_sets_enabled
ON permission_policy_sets(enabled);

CREATE INDEX idx_permission_policy_bindings_owner
ON permission_policy_bindings(owner_type, owner_id, enabled, priority ASC);

CREATE INDEX idx_permission_policy_bindings_policy_set
ON permission_policy_bindings(permission_policy_set_id);
```

### 6.3 Team

```sql
CREATE INDEX idx_ai_team_members_team_sort
ON ai_team_members(team_id, sort_order ASC);

CREATE INDEX idx_ai_team_members_runtime
ON ai_team_members(runtime_config_id);
```

### 6.4 Project

```sql
CREATE INDEX idx_projects_last_active
ON projects(last_active_at DESC);

CREATE INDEX idx_projects_risk_last_active
ON projects(risk_status, last_active_at DESC);

CREATE INDEX idx_projects_archived
ON projects(archived_at);
```

### 6.5 Work Session

```sql
CREATE INDEX idx_work_sessions_project_updated
ON work_sessions(project_id, archived_at, updated_at DESC);

CREATE INDEX idx_work_sessions_project_status
ON work_sessions(project_id, status);

CREATE INDEX idx_work_sessions_parent
ON work_sessions(parent_work_session_id);
```

### 6.6 Message 与 Runtime Event

```sql
CREATE INDEX idx_messages_session_created
ON messages(work_session_id, created_at ASC);

CREATE INDEX idx_runtime_runs_session_started
ON runtime_runs(work_session_id, started_at DESC);

CREATE INDEX idx_runtime_events_run_sequence
ON runtime_events(run_id, sequence_no ASC);

CREATE INDEX idx_runtime_events_session_created
ON runtime_events(work_session_id, created_at ASC);
```

### 6.7 Context

```sql
CREATE INDEX idx_context_items_project_type
ON context_items(project_id, type);

CREATE INDEX idx_context_snapshots_session_created
ON context_snapshots(work_session_id, created_at DESC);

CREATE INDEX idx_context_snapshots_project_pinned
ON context_snapshots(project_id, is_pinned, created_at DESC);
```

## 7. 关系与删除策略

### 7.1 项目删除

用户确认删除项目历史数据时，级联删除：

- `project_metric_snapshots`
- `work_sessions`
- `messages`
- `runtime_runs`
- `runtime_events`
- `context_items`
- `context_snapshots`
- `session_context_refs`

不删除：

- `ai_teams`
- `ai_team_members`
- `ai_runtime_configs`
- `agent_profiles`
- `permission_policy_sets`
- 系统凭据存储中仍被其他 Runtime 引用的 secret

### 7.2 Runtime 删除

Runtime 如果被以下对象引用，默认禁止硬删除：

- `ai_team_members.runtime_config_id`
- `projects.default_ai_runtime_config_id`
- `work_sessions.ai_runtime_config_id`
- `runtime_runs.runtime_config_id`
- `runtime_events.runtime_config_id`

MVP 推荐做法：

- 将 `ai_runtime_configs.enabled` 设为 `0`
- 保留历史运行快照
- 清理不再使用的 `ai_runtime_secrets`

### 7.3 Agent Profile 删除

Agent Profile 被引用时允许删除，但引用字段置空：

- `ai_runtime_configs.agent_profile_id`
- `ai_team_members.agent_profile_id`
- `projects.default_agent_profile_id`
- `work_sessions.agent_profile_id`

历史消息和工作窗口中的 `resolved_config_snapshot_json` 不回写。

### 7.4 Team 删除

Team 被项目或工作窗口引用时，推荐先禁用或提示影响范围。

若用户确认硬删除：

- 删除 `ai_teams`
- 级联删除 `ai_team_members`
- `projects.default_ai_team_id` 置空，并重新推导 `mode = manual`
- `work_sessions.ai_team_id`、`work_sessions.ai_team_member_id` 置空
- 历史消息中的成员字段可置空，但 `runtime_snapshot_json` 和正文保留

### 7.5 Permission Policy 删除

权限设置被引用时允许删除，但需要提示影响范围。

若用户确认删除：

- 删除 `permission_policy_sets`
- 级联删除 `permission_policy_bindings`
- 已有工作窗口的 `resolved_config_snapshot_json` 不回写
- 已有消息中的 `input_summary_json` 和 `input_envelope_snapshot_json` 不回写

## 8. 状态一致性规则

### 8.1 项目模式

项目模式由默认 Team 推导：

```text
if default_ai_team_id is not null:
  mode = team
else:
  mode = manual
```

`default_ai_team_id` 与 `default_ai_runtime_config_id` 可以同时保存，但默认协作入口以 Team 优先。

### 8.2 工作窗口执行者

一个工作窗口同一时刻只有一个当前激活执行者。

规则：

- `active_assignee_type = team_member` 时，必须有 `ai_team_member_id`。
- `active_assignee_type = runtime` 时，必须有 `ai_runtime_config_id`。
- 切换成员或 Runtime 时，历史消息不变，后续消息使用新配置。
- 每次启动任务前写入新的 `runtime_runs`，并更新 `work_sessions.latest_run_id`。

### 8.3 权限继承与合并

权限合并顺序与 Agent 公用配置合并顺序保持一致：

1. `agent_profile`
2. `runtime_config`
3. `team_member`
4. `project`
5. `work_session`

同一层可以绑定多个 `permission_policy_sets`，按 `priority ASC` 应用。跨层按上面的顺序逐层应用。

最终权限计算规则：

- `deny` 优先级最高，除非后续层使用 `override` 明确覆盖。
- `restrictive` 只能把 `allow` 收紧为 `ask` 或 `deny`，不能放宽权限。
- `ask` 表示运行前或命中操作时需要用户确认。
- `allow` 表示该操作在当前权限边界内可执行。
- 未命中任何规则时，默认按最小权限处理为 `ask` 或 `deny`，具体由 Runtime Adapter 的安全策略决定。

启动任务前，主进程需要把最终权限写入：

- `work_sessions.resolved_config_snapshot_json`
- `messages.input_summary_json`
- `messages.input_envelope_snapshot_json`

输入摘要中展示的“权限级别”应来自最终权限摘要，而不是单个 `permission_preset` 字段。

### 8.4 Run 与 Session 状态

`runtime_runs.status` 是单次进程状态，`work_sessions.status` 是 UI 层窗口状态。

典型映射：

| Runtime Run 状态 | Work Session 状态 |
| --- | --- |
| `starting` | `running` |
| `running` | `running` |
| `waiting_input` | `waiting_input` |
| `waiting_permission` | `waiting_permission` |
| `completed` | `completed` |
| `failed` | `error` |
| `stopped` | `idle` 或 `completed` |
| `interrupted` | `error` |

### 8.5 项目指标

项目指标由事件驱动更新，不建议每次列表查询全量扫描消息和运行事件。

触发更新：

- 工作窗口创建或归档
- 工作窗口状态变化
- Runtime Run 开始或结束
- AI 输出成功生成
- 权限等待事件写入
- 错误事件写入
- 文件变更事件写入

风险状态计算：

```text
if error_session_count > 0 or recent_failure_at is not null:
  risk_status = risk
else if waiting_input_count > 0 or waiting_permission_count > 0:
  risk_status = attention
else:
  risk_status = normal
```

## 9. 初始迁移顺序

推荐首个迁移按依赖关系建表：

1. `agent_profiles`
2. `permission_policy_sets`
3. `permission_policy_bindings`
4. `ai_runtime_configs`
5. `ai_runtime_secrets`
6. `ai_teams`
7. `ai_team_members`
8. `projects`
9. `project_metric_snapshots`
10. `work_sessions`
11. `messages`
12. `runtime_runs`
13. `runtime_events`
14. `context_items`
15. `context_snapshots`
16. `session_context_refs`
17. 补充 `work_sessions.latest_run_id` 外键或由服务层维护引用完整性
18. 创建索引

说明：

- `work_sessions.latest_run_id` 与 `runtime_runs.work_session_id` 存在循环引用。实现时可以不建立数据库级外键，改由服务层事务维护。
- SQLite 外键需要显式执行 `PRAGMA foreign_keys = ON;`。

## 10. MVP 暂缓表

以下表不进入 MVP 初始 Schema：

- 用户账号表：当前为本地单用户桌面应用，暂不需要。
- 云同步表：非 MVP 范围。
- 插件市场表：非 MVP 范围。
- API Provider 细分表：MVP 仅预留 `runtime_type = api_provider`。
- 复杂权限审批流表：MVP 先使用 `permission_policy_sets` 描述权限边界，并用 `permission_request` 事件记录单次审批请求；暂不拆审批工单表。
- 向量索引表：完整知识库检索不在 MVP 范围。
- 自动任务编排表：多 AI 自动任务调度不在 MVP 范围。

这些能力后续可在不破坏核心表关系的前提下通过迁移扩展。

## 11. 与现有文档的对应关系

| PRD / TECH_DESIGN 概念 | 数据表 |
| --- | --- |
| AI Runtime 配置 | `ai_runtime_configs`、`ai_runtime_secrets` |
| Agent 公用配置 | `agent_profiles` |
| 可组合权限配置 | `permission_policy_sets`、`permission_policy_bindings` |
| AI Team | `ai_teams`、`ai_team_members` |
| 项目 | `projects`、`project_metric_snapshots` |
| 工作窗口 | `work_sessions` |
| 对话历史 | `messages` |
| CLI 进程与运行日志 | `runtime_runs`、`runtime_events` |
| 项目上下文 | `context_items`、`session_context_refs` |
| 上下文压缩 | `context_snapshots` |
| 关联窗口 | `work_sessions.parent_work_session_id` |
| 转交任务 | `messages.event_type = handoff` |
| 成员切换 | `messages.event_type = member_switch` |
