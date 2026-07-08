# AI Agent Workspace MVP Database Schema

## 1. 设计目标

MVP 数据库只支撑主链路：

```text
Runtime -> Project -> Brief -> Blueprint -> Task -> Work Session -> Run/Event -> Deliverable
```

数据库使用 SQLite。敏感凭据不进入普通业务表。

## 2. 通用约定

- 主键统一 `TEXT`。
- 时间统一 ISO 8601 字符串。
- JSON 使用 `TEXT` 存储，字段名使用 `_json` 后缀。
- 归档使用 `archived_at`。
- 默认不硬删除项目、窗口和历史消息。

## 3. 表

### 3.1 `ai_runtime_configs`

保存 CLI Agent Runtime。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | TEXT | 主键 |
| `name` | TEXT | 名称 |
| `provider` | TEXT | `claude_code_cli` / `codex_cli` / `gemini_cli` / `custom_cli` |
| `executable_path` | TEXT | 可执行命令 |
| `default_args_json` | TEXT | 默认参数 |
| `default_cwd_mode` | TEXT | `project_root` / `custom_path` |
| `custom_cwd` | TEXT | 自定义 cwd |
| `system_prompt` | TEXT | 可选提示词 |
| `enabled` | INTEGER | 是否启用 |
| `is_default` | INTEGER | 是否默认 |
| `last_test_status` | TEXT | 最近检测状态 |
| `last_test_message` | TEXT | 最近检测信息 |
| `last_tested_at` | TEXT | 最近检测时间 |
| `created_at` | TEXT | 创建时间 |
| `updated_at` | TEXT | 更新时间 |
| `last_used_at` | TEXT | 最近使用时间 |

### 3.2 `ai_teams`

保存轻量 Team。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | TEXT | 主键 |
| `name` | TEXT | 名称 |
| `goal` | TEXT | 目标 |
| `description` | TEXT | 描述 |
| `created_at` | TEXT | 创建时间 |
| `updated_at` | TEXT | 更新时间 |
| `last_used_at` | TEXT | 最近使用时间 |

### 3.3 `ai_team_members`

保存 Team 成员。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | TEXT | 主键 |
| `team_id` | TEXT | Team ID |
| `name` | TEXT | 名称 |
| `role` | TEXT | 角色 |
| `runtime_config_id` | TEXT | 绑定 Runtime |
| `task_instruction` | TEXT | 成员任务说明 |
| `enabled` | INTEGER | 是否启用 |
| `sort_order` | INTEGER | 排序 |
| `created_at` | TEXT | 创建时间 |
| `updated_at` | TEXT | 更新时间 |

### 3.4 `projects`

保存项目。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | TEXT | 主键 |
| `name` | TEXT | 名称 |
| `description` | TEXT | 描述 |
| `local_path` | TEXT | 本地目录 |
| `mode` | TEXT | `team` / `manual` |
| `phase` | TEXT | 当前阶段 |
| `initial_idea` | TEXT | 初始想法 |
| `default_ai_team_id` | TEXT | 默认 Team |
| `default_ai_runtime_config_id` | TEXT | 默认 Runtime |
| `archived_at` | TEXT | 归档时间 |
| `created_at` | TEXT | 创建时间 |
| `updated_at` | TEXT | 更新时间 |
| `last_active_at` | TEXT | 最近活动时间 |

### 3.5 `project_briefs`

保存项目简报。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | TEXT | 主键 |
| `project_id` | TEXT | 项目 ID |
| `raw_idea` | TEXT | 原始想法 |
| `summary` | TEXT | 摘要 |
| `target_users_json` | TEXT | 目标用户 |
| `core_features_json` | TEXT | 核心功能 |
| `technical_preferences_json` | TEXT | 技术偏好 |
| `non_goals_json` | TEXT | 非目标 |
| `open_questions_json` | TEXT | 未决问题 |
| `created_at` | TEXT | 创建时间 |
| `updated_at` | TEXT | 更新时间 |

### 3.6 `project_blueprints`

保存当前蓝图。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | TEXT | 主键 |
| `project_id` | TEXT | 项目 ID |
| `title` | TEXT | 标题 |
| `product_goal` | TEXT | 产品目标 |
| `mvp_scope_json` | TEXT | MVP 范围 |
| `technical_plan` | TEXT | 技术方案摘要 |
| `milestones_json` | TEXT | 里程碑 |
| `acceptance_criteria_json` | TEXT | 验收标准 |
| `risks_json` | TEXT | 风险 |
| `created_at` | TEXT | 创建时间 |
| `updated_at` | TEXT | 更新时间 |

### 3.7 `project_tasks`

保存任务。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | TEXT | 主键 |
| `project_id` | TEXT | 项目 ID |
| `blueprint_id` | TEXT | 蓝图 ID |
| `title` | TEXT | 标题 |
| `type` | TEXT | 任务类型 |
| `phase` | TEXT | 阶段 |
| `status` | TEXT | 状态 |
| `recommended_role` | TEXT | 推荐角色 |
| `ai_team_member_id` | TEXT | 指定成员 |
| `ai_runtime_config_id` | TEXT | 指定 Runtime |
| `goal` | TEXT | 目标 |
| `acceptance_criteria_json` | TEXT | 验收标准 |
| `work_session_id` | TEXT | 关联工作窗口 |
| `sort_order` | INTEGER | 排序 |
| `created_at` | TEXT | 创建时间 |
| `updated_at` | TEXT | 更新时间 |

### 3.8 `work_sessions`

保存工作窗口。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | TEXT | 主键 |
| `project_id` | TEXT | 项目 ID |
| `project_task_id` | TEXT | 任务 ID |
| `title` | TEXT | 标题 |
| `goal` | TEXT | 目标 |
| `status` | TEXT | 状态 |
| `ai_team_member_id` | TEXT | 当前成员 |
| `ai_runtime_config_id` | TEXT | 当前 Runtime |
| `latest_run_id` | TEXT | 最新 Run |
| `summary` | TEXT | 摘要 |
| `archived_at` | TEXT | 归档时间 |
| `created_at` | TEXT | 创建时间 |
| `updated_at` | TEXT | 更新时间 |
| `last_message_at` | TEXT | 最近消息时间 |

### 3.9 `messages`

保存消息。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | TEXT | 主键 |
| `work_session_id` | TEXT | 工作窗口 ID |
| `role` | TEXT | `user` / `assistant` / `system` |
| `content` | TEXT | 内容 |
| `input_summary_json` | TEXT | 输入摘要 |
| `error_json` | TEXT | 错误信息 |
| `created_at` | TEXT | 创建时间 |

### 3.10 `runtime_runs`

保存一次 CLI 执行。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | TEXT | 主键 |
| `work_session_id` | TEXT | 工作窗口 ID |
| `runtime_config_id` | TEXT | Runtime ID |
| `provider` | TEXT | Provider |
| `pid` | INTEGER | 进程 ID |
| `status` | TEXT | 状态 |
| `command` | TEXT | 命令 |
| `args_json` | TEXT | 参数 |
| `cwd` | TEXT | 工作目录 |
| `started_at` | TEXT | 开始时间 |
| `ended_at` | TEXT | 结束时间 |
| `exit_code` | INTEGER | 退出码 |
| `exit_signal` | TEXT | 信号 |
| `error_summary` | TEXT | 错误摘要 |

### 3.11 `runtime_events`

保存 CLI 输出和关键事件。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | TEXT | 主键 |
| `run_id` | TEXT | Run ID |
| `work_session_id` | TEXT | 工作窗口 ID |
| `runtime_config_id` | TEXT | Runtime ID |
| `type` | TEXT | 事件类型 |
| `content` | TEXT | 内容 |
| `metadata_json` | TEXT | 元数据 |
| `display_category` | TEXT | 展示分类 |
| `sequence_no` | INTEGER | 顺序 |
| `created_at` | TEXT | 创建时间 |

### 3.12 `project_deliverables`

保存交付物。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | TEXT | 主键 |
| `project_id` | TEXT | 项目 ID |
| `project_task_id` | TEXT | 任务 ID |
| `work_session_id` | TEXT | 工作窗口 ID |
| `source_message_id` | TEXT | 来源消息 ID |
| `title` | TEXT | 标题 |
| `type` | TEXT | 类型 |
| `content` | TEXT | 内容 |
| `created_at` | TEXT | 创建时间 |
| `updated_at` | TEXT | 更新时间 |

### 3.13 `project_metric_snapshots`

保存主窗口项目状态摘要。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | TEXT | 主键 |
| `project_id` | TEXT | 项目 ID |
| `active_session_count` | INTEGER | 活跃窗口数 |
| `running_agent_count` | INTEGER | 运行中 Agent 数 |
| `waiting_input_count` | INTEGER | 等待输入数 |
| `error_session_count` | INTEGER | 错误窗口数 |
| `recent_output_at` | TEXT | 最近产出 |
| `recent_failure_at` | TEXT | 最近失败 |
| `snapshot_at` | TEXT | 快照时间 |

## 4. 索引

建议索引：

- `ai_runtime_configs(enabled, provider)`
- `projects(last_active_at)`
- `project_tasks(project_id, status, sort_order)`
- `work_sessions(project_id, status)`
- `messages(work_session_id, created_at)`
- `runtime_runs(work_session_id, started_at)`
- `runtime_events(run_id, sequence_no)`
- `project_deliverables(project_id, created_at)`

## 5. 范围边界

不支撑 MVP 主链路的表不进入当前数据库文档。
