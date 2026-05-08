# AI Agent Workspace IPC API

## 1. 文档信息

- 文档名称：AI Agent Workspace IPC API
- 对应需求文档：`docs/PRD.md`
- 对应技术设计：`docs/TECH_DESIGN.md`
- 对应数据库设计：`docs/DB_SCHEMA.md`
- 文档版本：v0.1
- 当前阶段：MVP IPC 契约设计

## 2. 设计原则

- Renderer 不直接访问数据库、文件系统、系统凭据或子进程。
- 所有能力通过 preload 暴露的 `window.agentSpace` API 访问。
- IPC channel 使用领域动作命名，例如 `runtime:create`，不暴露通用 `db:query`。
- 主进程负责参数二次校验、权限校验和敏感字段脱敏。
- 返回值统一使用可序列化对象，不返回类实例、Stream、Error 实例或 Node 原生对象。
- 长运行任务通过订阅事件推送状态，不让单次 invoke 长时间阻塞 UI。

## 3. 通用类型

```ts
type ID = string;
type ISODateTime = string;

interface ApiResult<T> {
  ok: boolean;
  data?: T;
  error?: ApiError;
}

interface ApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
  recoverable?: boolean;
  recoveryActions?: RecoveryAction[];
}

interface RecoveryAction {
  type:
    | 'retry'
    | 'open-runtime-settings'
    | 'switch-runtime'
    | 'switch-team-member'
    | 'select-directory'
    | 'reauthenticate'
    | 'grant-permission';
  label: string;
  payload?: Record<string, unknown>;
}

interface PageInput {
  cursor?: string;
  limit?: number;
}

interface PageResult<T> {
  items: T[];
  nextCursor?: string;
}
```

## 4. Preload 暴露结构

```ts
interface AgentSpaceAPI {
  app: AppAPI;
  runtimes: RuntimeAPI;
  agentProfiles: AgentProfileAPI;
  permissions: PermissionAPI;
  teams: TeamAPI;
  projects: ProjectAPI;
  sessions: SessionAPI;
  context: ContextAPI;
  events: EventAPI;
}

declare global {
  interface Window {
    agentSpace: AgentSpaceAPI;
  }
}
```

Preload 只暴露语义化函数，不把 `ipcRenderer.invoke` 和 channel 字符串直接暴露给 Renderer。

## 5. App API

### `app:getInfo`

用途：获取应用基础信息。

```ts
interface AppInfo {
  appVersion: string;
  platform: 'darwin' | 'win32' | 'linux';
  databaseReady: boolean;
}
```

Preload：

```ts
app.getInfo(): Promise<ApiResult<AppInfo>>
```

### `app:openExternalPath`

用途：打开项目目录或文件所在目录。

```ts
interface OpenExternalPathInput {
  path: string;
}
```

说明：

- 主进程必须校验路径存在。
- 不允许 Renderer 自行调用 shell open。

## 6. Runtime API

### `runtime:list`

```ts
interface RuntimeListInput {
  enabled?: boolean;
  provider?: RuntimeProvider;
  query?: string;
}

interface RuntimeSummary {
  id: ID;
  name: string;
  runtimeType: 'cli_agent' | 'api_provider';
  provider: RuntimeProvider;
  model?: string;
  executablePath?: string;
  permissionPreset?: PermissionPreset;
  enabled: boolean;
  isDefault: boolean;
  lastTestStatus?: RuntimeTestStatus;
  lastTestedAt?: ISODateTime;
  lastUsedAt?: ISODateTime;
}
```

说明：

- `permissionPreset` 仅用于快捷预设和 UI 摘要，不表示最终权限结果。
- 最终权限由 `permissionPolicySetIds` / `permission_policy_sets` 按合并规则计算。

Preload：

```ts
runtimes.list(input?: RuntimeListInput): Promise<ApiResult<RuntimeSummary[]>>
```

### `runtime:get`

```ts
interface RuntimeDetail extends RuntimeSummary {
  agentProfileId?: ID;
  source: 'manual' | 'ccswitch' | 'imported';
  sourceRef?: string;
  defaultArgs: string[];
  defaultCwdMode: 'project_root' | 'custom_path';
  customCwd?: string;
  systemPrompt?: string;
  streamEnabled: boolean;
  notes?: string;
  secrets: RuntimeSecretSummary[];
  permissionPolicyBindings: PermissionPolicyBindingSummary[];
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

interface RuntimeSecretSummary {
  id: ID;
  secretKind: string;
  maskedValue?: string;
  lastValidatedAt?: ISODateTime;
}
```

说明：

- `defaultArgs` 在返回详情时始终返回数组；未配置时返回空数组 `[]`

Preload：

```ts
runtimes.get(id: ID): Promise<ApiResult<RuntimeDetail>>
```

### `runtime:create`

```ts
interface RuntimeCreateInput {
  name: string;
  runtimeType: 'cli_agent';
  provider: RuntimeProvider;
  agentProfileId?: ID;
  model?: string;
  executablePath?: string;
  defaultArgs?: string[];
  defaultCwdMode?: 'project_root' | 'custom_path';
  customCwd?: string;
  systemPrompt?: string;
  streamEnabled?: boolean;
  permissionPreset?: PermissionPreset;
  permissionPolicySetIds?: ID[];
  secrets?: RuntimeSecretInput[];
  notes?: string;
  enabled?: boolean;
  isDefault?: boolean;
}

interface RuntimeSecretInput {
  secretKind: string;
  value: string;
}
```

Preload：

```ts
runtimes.create(input: RuntimeCreateInput): Promise<ApiResult<RuntimeDetail>>
```

说明：

- `secrets[].value` 只能在提交时进入主进程，不能写入业务表。
- 主进程保存 secret 后只返回脱敏摘要。

### `runtime:update`

```ts
interface RuntimeUpdateInput extends Partial<RuntimeCreateInput> {
  id: ID;
  replaceSecrets?: RuntimeSecretInput[];
}
```

Preload：

```ts
runtimes.update(input: RuntimeUpdateInput): Promise<ApiResult<RuntimeDetail>>
```

### `runtime:delete`

用途：删除或禁用 Runtime。

```ts
interface RuntimeDeleteInput {
  id: ID;
  mode: 'disable' | 'hard_delete';
}
```

规则：

- 被 Team、Project、Session、Run 引用时，默认只允许 `disable`。
- `hard_delete` 需要主进程返回影响范围并要求 UI 二次确认。

### `runtime:test`

```ts
interface RuntimeTestInput {
  runtimeConfigId?: ID;
  provider?: RuntimeProvider;
  executablePath?: string;
  defaultArgs?: string[];
}

interface RuntimeTestResult {
  status: RuntimeTestStatus;
  message: string;
  version?: string;
  authenticated?: boolean;
  testedAt: ISODateTime;
}
```

Preload：

```ts
runtimes.test(input: RuntimeTestInput): Promise<ApiResult<RuntimeTestResult>>
```

### `runtime:importPreview`

```ts
interface RuntimeImportPreviewInput {
  sourceType: 'text' | 'deep_link_text' | 'json_text' | 'file' | 'clipboard';
  formatHint?: 'auto' | 'ccswitch' | 'generic_json';
  content?: string;
  filePath?: string;
}

interface RuntimeImportPreview {
  tempId: ID;
  name: string;
  provider: RuntimeProvider;
  model?: string;
  containsSecrets: boolean;
  secretKinds: string[];
  conflict: 'none' | 'name_exists';
  rawSummary?: string;
  warnings: string[];
}
```

说明：

- `deep_link_text` 只表示把 deep link 当作文本解析，不表示打开外部协议或唤起外部应用。
- MVP 首个格式适配器为 `ccswitch`，但 IPC channel 保持通用命名。

### `runtime:importCommit`

```ts
interface RuntimeImportCommitInput {
  importSessionId?: ID;
  previews: {
    tempId: ID;
    action: 'create' | 'rename' | 'overwrite' | 'skip';
    targetRuntimeId?: ID;
    newName?: string;
    importSecrets?: boolean;
  }[];
}

interface RuntimeImportCommitResult {
  createdCount: number;
  updatedCount: number;
  skippedCount: number;
  failed: { tempId: ID; reason: string }[];
}
```

## 7. Permission API

### `permission:listPolicySets`

```ts
interface PermissionPolicySetSummary {
  id: ID;
  name: string;
  description?: string;
  preset?: PermissionPreset;
  enabled: boolean;
  lastUsedAt?: ISODateTime;
}
```

### `permission:getPolicySet`

```ts
interface PermissionPolicySetDetail extends PermissionPolicySetSummary {
  rules: PermissionRule[];
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

interface PermissionRule {
  scope:
    | 'workspace'
    | 'filesystem'
    | 'command'
    | 'network'
    | 'environment'
    | 'credential'
    | 'runtime'
    | 'tool';
  action:
    | 'read'
    | 'write'
    | 'create'
    | 'delete'
    | 'execute'
    | 'list'
    | 'request'
    | 'approve'
    | 'deny';
  decision: 'allow' | 'ask' | 'deny';
  resources?: string[];
  description?: string;
}
```

### `permission:createPolicySet`

```ts
interface PermissionPolicySetCreateInput {
  name: string;
  description?: string;
  preset?: PermissionPreset;
  rules: PermissionRule[];
  enabled?: boolean;
}
```

### `permission:updatePolicySet`

```ts
interface PermissionPolicySetUpdateInput
  extends Partial<PermissionPolicySetCreateInput> {
  id: ID;
}
```

### `permission:bindPolicySet`

```ts
interface PermissionPolicyBindingInput {
  ownerType:
    | 'agent_profile'
    | 'runtime_config'
    | 'team_member'
    | 'project'
    | 'work_session';
  ownerId: ID;
  permissionPolicySetId: ID;
  mergeStrategy?: 'additive' | 'override' | 'restrictive';
  priority?: number;
  enabled?: boolean;
}

interface PermissionPolicyBindingSummary extends PermissionPolicyBindingInput {
  id: ID;
  policySetName: string;
}
```

### `permission:resolvePreview`

```ts
interface PermissionResolvePreviewInput {
  agentProfileId?: ID;
  runtimeConfigId?: ID;
  teamMemberId?: ID;
  projectId?: ID;
  workSessionId?: ID;
}

interface PermissionResolvePreview {
  summary: string;
  effectiveRules: PermissionRule[];
  sources: {
    ownerType: string;
    ownerId: ID;
    policySetId: ID;
    policySetName: string;
    mergeStrategy: string;
    priority: number;
  }[];
}
```

## 8. Agent Profile API

### `agentProfile:list`

```ts
interface AgentProfileSummary {
  id: ID;
  name: string;
  description?: string;
  permissionPreset?: PermissionPreset;
  outputStyle?: 'concise' | 'structured' | 'detailed';
  approvalMode?: 'auto' | 'manual';
  lastUsedAt?: ISODateTime;
}
```

说明：

- `permissionPreset` 仅用于摘要展示和快捷初始化，不作为最终权限模型来源。

### `agentProfile:create`

```ts
interface AgentProfileCreateInput {
  name: string;
  description?: string;
  permissionPreset?: PermissionPreset;
  permissionPolicySetIds?: ID[];
  baseSystemPrompt?: string;
  rolePromptTemplate?: string;
  defaultArgs?: string[];
  defaultCwdMode?: 'project_root' | 'custom_path';
  customCwd?: string;
  outputStyle?: 'concise' | 'structured' | 'detailed';
  approvalMode?: 'auto' | 'manual';
  envWhitelist?: string[];
}
```

说明：

- `permissionPolicySetIds` 才是最终权限边界的主要来源。
- `permissionPreset` 只用于帮助用户快速生成默认权限设置和展示摘要。

### `agentProfile:resolvePreview`

用途：预览 Agent Profile 与 Runtime、Team Member、Project、Session 合并后的最终配置。

```ts
interface ResolvedAgentConfigPreview {
  permissionSummary: string;
  systemPromptSummary?: string;
  defaultArgs: string[];
  cwdMode: string;
  envWhitelist: string[];
  sources: Record<string, string>;
}
```

## 9. Team API

### `team:list`

```ts
interface TeamSummary {
  id: ID;
  name: string;
  goal?: string;
  memberCount: number;
  lastUsedAt?: ISODateTime;
}
```

### `team:create`

```ts
interface TeamCreateInput {
  name: string;
  goal?: string;
  description?: string;
  defaultLaunchMode?: 'analysis' | 'development' | 'custom';
  members?: TeamMemberCreateInput[];
}

interface TeamMemberCreateInput {
  name: string;
  role:
    | 'analyst'
    | 'architect'
    | 'developer'
    | 'tester'
    | 'reviewer'
    | 'summarizer'
    | 'custom';
  runtimeConfigId: ID;
  agentProfileId?: ID;
  permissionPolicySetIds?: ID[];
  taskInstruction?: string;
  enabled?: boolean;
  sortOrder?: number;
}
```

### `team:update`

```ts
interface TeamUpdateInput extends Partial<TeamCreateInput> {
  id: ID;
}
```

### `team:get`

```ts
interface TeamDetail extends TeamSummary {
  description?: string;
  defaultLaunchMode?: string;
  members: TeamMemberDetail[];
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

interface TeamMemberDetail extends TeamMemberCreateInput {
  id: ID;
  runtimeName: string;
  runtimeProvider: RuntimeProvider;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}
```

## 10. Project API

### `project:list`

```ts
interface ProjectListInput {
  archived?: boolean;
  riskStatus?: 'normal' | 'attention' | 'risk';
  phase?: ProjectPhase;
  sortBy?: 'last_active_at' | 'risk_status' | 'phase';
}

interface ProjectSummary {
  id: ID;
  name: string;
  localPath: string;
  mode: 'team' | 'manual';
  phase: ProjectPhase;
  riskStatus: 'normal' | 'attention' | 'risk';
  defaultAiTeamId?: ID;
  defaultAiRuntimeConfigId?: ID;
  metrics?: ProjectMetrics;
  lastActiveAt?: ISODateTime;
}

interface ProjectMetrics {
  activeSessionCount: number;
  runningAgentCount: number;
  waitingInputCount: number;
  waitingPermissionCount: number;
  errorSessionCount: number;
  recentOutputAt?: ISODateTime;
  recentFailureAt?: ISODateTime;
  recentRuntimeType?: RuntimeProvider;
  fileChangeCount: number;
}
```

### `project:create`

```ts
interface ProjectCreateInput {
  name: string;
  description?: string;
  localPath: string;
  phase: ProjectPhase;
  defaultAiTeamId?: ID;
  defaultAiRuntimeConfigId?: ID;
  defaultAgentProfileId?: ID;
  permissionPolicySetIds?: ID[];
  postCreateAction?: 'open_project' | 'open_dashboard' | 'open_first_session';
}

interface ProjectCreateResult {
  project: ProjectDetail;
  createdSessionId?: ID;
  postCreateWarning?: string;
}
```

规则：

- 主进程根据 `defaultAiTeamId` 推导 `mode`。
- 项目创建与指标初始化在同一事务中完成。
- 如果创建首个工作窗口失败，项目保留并返回 `postCreateWarning`。
- `postCreateAction` 属于创建后的附加动作，不影响项目主记录是否创建成功。
- `defaultAiTeamId` 与 `defaultAiRuntimeConfigId` 在请求中只能传一个；主进程应拒绝同时传值的输入。

### `project:update`

```ts
interface ProjectUpdateInput extends Partial<ProjectCreateInput> {
  id: ID;
  archived?: boolean;
}
```

### `project:get`

```ts
interface ProjectDetail extends ProjectSummary {
  description?: string;
  defaultAgentProfileId?: ID;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
  archivedAt?: ISODateTime;
}
```

### `project:archive`

```ts
interface ProjectArchiveInput {
  id: ID;
  archiveSessions?: boolean;
}
```

### `project:delete`

```ts
interface ProjectDeleteInput {
  id: ID;
  deleteHistory: boolean;
  confirmName: string;
}
```

规则：

- `deleteHistory = false` 时，主进程应将项目归档，而不是删除项目主记录。
- `deleteHistory = true` 时，主进程删除项目记录及其本地历史数据。

## 11. Work Session API

### `session:listByProject`

```ts
interface SessionListByProjectInput {
  projectId: ID;
  archived?: boolean;
  status?: WorkSessionStatus;
  page?: PageInput;
}

interface WorkSessionSummary {
  id: ID;
  projectId: ID;
  title: string;
  goal?: string;
  status: WorkSessionStatus;
  aiTeamId?: ID;
  aiTeamMemberId?: ID;
  aiRuntimeConfigId?: ID;
  activeAssigneeType: 'team_member' | 'runtime';
  parentWorkSessionId?: ID;
  latestRunId?: ID;
  summary?: string;
  lastMessageAt?: ISODateTime;
  updatedAt: ISODateTime;
}
```

### `session:create`

```ts
interface SessionCreateInput {
  projectId: ID;
  title: string;
  goal?: string;
  aiTeamId?: ID;
  aiTeamMemberId?: ID;
  aiRuntimeConfigId?: ID;
  agentProfileId?: ID;
  activeAssigneeType: 'team_member' | 'runtime';
  parentWorkSessionId?: ID;
  contextItemIds?: ID[];
  permissionPolicySetIds?: ID[];
}
```

规则：

- Team 模式项目创建窗口时默认带入项目 Team。
- 自由模式项目优先带入项目默认 Runtime。
- Runtime 不可用时返回可恢复错误，不创建半成品窗口。
- `activeAssigneeType = 'team_member'` 时，`aiTeamMemberId` 必填，`aiRuntimeConfigId` 不作为必填输入。
- `activeAssigneeType = 'runtime'` 时，`aiRuntimeConfigId` 必填。
- 当执行者为 Team 成员时，实际 Runtime 由主进程在启动 Run 时从 `aiTeamMemberId` 解析，并写入 `runtime_runs.runtime_config_id` 与相关快照。

### `session:get`

```ts
interface WorkSessionDetail extends WorkSessionSummary {
  resolvedConfigSnapshot?: Record<string, unknown>;
  externalSessionId?: string;
  archivedAt?: ISODateTime;
  createdAt: ISODateTime;
}
```

### `session:switchAssignee`

```ts
interface SessionSwitchAssigneeInput {
  workSessionId: ID;
  activeAssigneeType: 'team_member' | 'runtime';
  aiTeamMemberId?: ID;
  aiRuntimeConfigId?: ID;
  reason?: string;
}
```

规则：

- 如果窗口有运行中的 Run，主进程返回错误并要求先停止。
- 成功后插入 `member_switch` 系统消息。

### `session:handoff`

```ts
interface SessionHandoffInput {
  workSessionId: ID;
  toAiTeamMemberId: ID;
  mode: 'same_session' | 'child_session';
  summary: string;
  contextItemIds?: ID[];
}

interface SessionHandoffResult {
  workSessionId: ID;
  childWorkSessionId?: ID;
  messageId: ID;
}
```

### `session:sendMessage`

```ts
interface SessionSendMessageInput {
  workSessionId: ID;
  prompt: string;
  contextItemIds?: ID[];
  resumeExternalSessionId?: string;
}

interface SessionSendMessageResult {
  userMessageId: ID;
  runId: ID;
  workSessionId: ID;
  status: 'running';
}
```

规则：

- 主进程创建用户消息、输入包快照和 Runtime Run。
- CLI 输出通过订阅事件推送。
- 同一工作窗口同时只能有一个活动 Run。
- 每次调用都创建新的 `runtime_runs` 记录。
- `resumeExternalSessionId` 仅作为外部 CLI 会话恢复线索，是否透传由 Runtime Adapter 决定。
- `waiting_input` 后的用户补充输入仍通过本接口发送；是否复用外部 CLI 会话取决于对应 Adapter 能力。

### `session:stopRun`

```ts
interface SessionStopRunInput {
  workSessionId: ID;
  runId?: ID;
}
```

### `session:getMessages`

```ts
interface SessionMessagesInput {
  workSessionId: ID;
  page?: PageInput;
}

interface MessageView {
  id: ID;
  workSessionId: ID;
  role: 'user' | 'assistant' | 'system' | 'tool';
  eventType: string;
  aiTeamMemberId?: ID;
  content: string;
  inputSummary?: Record<string, unknown>;
  displayState?: Record<string, unknown>;
  tokenUsage?: Record<string, unknown>;
  error?: ApiError;
  createdAt: ISODateTime;
}
```

### `session:getRuntimeEvents`

```ts
interface RuntimeEventsInput {
  workSessionId: ID;
  runId?: ID;
  page?: PageInput;
}

interface RuntimeEventView {
  id: ID;
  runId: ID;
  workSessionId: ID;
  type: string;
  content?: string;
  metadata?: Record<string, unknown>;
  displayCategory: string;
  sequenceNo: number;
  createdAt: ISODateTime;
}
```

## 12. Context API

### `context:listProjectItems`

```ts
interface ContextListProjectItemsInput {
  projectId: ID;
  type?: 'project_note' | 'local_file' | 'session_output' | 'manual_text' | 'external_link';
}
```

### `context:createManualItem`

```ts
interface ContextCreateManualItemInput {
  projectId: ID;
  workSessionId?: ID;
  type: 'project_note' | 'manual_text' | 'external_link';
  title: string;
  path?: string;
  content?: string;
}
```

### `context:selectFiles`

```ts
interface ContextSelectFilesInput {
  projectId: ID;
  workSessionId?: ID;
  allowMultiple?: boolean;
}

interface ContextSelectedFile {
  path: string;
  title: string;
  contentHash?: string;
  sizeBytes: number;
  contentSummary?: string;
}
```

说明：

- 文件选择由主进程打开系统选择器。
- 默认限制在项目目录内，跨目录需要 UI 明确提示。
- `context:selectFiles` 默认只返回文件引用信息和可选摘要，不返回完整文件内容。
- 完整文件内容仅在用户确认发送时进入单次输入包。

### `context:resolveForSession`

```ts
interface ContextResolveForSessionInput {
  workSessionId: ID;
  contextItemIds: ID[];
}

interface ResolvedContextItem {
  id: ID;
  type: string;
  title: string;
  path?: string;
  contentPreview?: string;
  tokenEstimate?: number;
}
```

## 13. Event API

订阅 API 统一返回取消订阅函数。

```ts
type Unsubscribe = () => void;
```

### `event:runtime`

```ts
interface RuntimeEventPayload {
  workSessionId: ID;
  runId: ID;
  event: RuntimeEventView;
}

events.onRuntimeEvent(listener: (payload: RuntimeEventPayload) => void): Unsubscribe
```

### `event:sessionStatus`

```ts
interface SessionStatusPayload {
  workSessionId: ID;
  projectId: ID;
  status: WorkSessionStatus;
  latestRunId?: ID;
  updatedAt: ISODateTime;
}
```

### `event:projectMetricsUpdated`

```ts
interface ProjectMetricsUpdatedPayload {
  projectId: ID;
  metrics: ProjectMetrics;
  riskStatus: 'normal' | 'attention' | 'risk';
}
```

## 14. Channel 清单

| Domain | Channel |
| --- | --- |
| App | `app:getInfo` |
| App | `app:openExternalPath` |
| Runtime | `runtime:list` |
| Runtime | `runtime:get` |
| Runtime | `runtime:create` |
| Runtime | `runtime:update` |
| Runtime | `runtime:delete` |
| Runtime | `runtime:test` |
| Runtime | `runtime:importPreview` |
| Runtime | `runtime:importCommit` |
| Permission | `permission:listPolicySets` |
| Permission | `permission:getPolicySet` |
| Permission | `permission:createPolicySet` |
| Permission | `permission:updatePolicySet` |
| Permission | `permission:deletePolicySet` |
| Permission | `permission:bindPolicySet` |
| Permission | `permission:unbindPolicySet` |
| Permission | `permission:resolvePreview` |
| AgentProfile | `agentProfile:list` |
| AgentProfile | `agentProfile:get` |
| AgentProfile | `agentProfile:create` |
| AgentProfile | `agentProfile:update` |
| AgentProfile | `agentProfile:duplicate` |
| AgentProfile | `agentProfile:delete` |
| AgentProfile | `agentProfile:getUsage` |
| AgentProfile | `agentProfile:resolvePreview` |
| Team | `team:list` |
| Team | `team:get` |
| Team | `team:create` |
| Team | `team:update` |
| Team | `team:delete` |
| Project | `project:list` |
| Project | `project:get` |
| Project | `project:create` |
| Project | `project:update` |
| Project | `project:archive` |
| Project | `project:delete` |
| Project | `project:getMetrics` |
| Session | `session:listByProject` |
| Session | `session:get` |
| Session | `session:create` |
| Session | `session:update` |
| Session | `session:archive` |
| Session | `session:switchAssignee` |
| Session | `session:handoff` |
| Session | `session:createChild` |
| Session | `session:sendMessage` |
| Session | `session:stopRun` |
| Session | `session:retryLastRun` |
| Session | `session:getMessages` |
| Session | `session:getRuntimeEvents` |
| Context | `context:listProjectItems` |
| Context | `context:createManualItem` |
| Context | `context:selectFiles` |
| Context | `context:resolveForSession` |
| Event | `event:runtime` |
| Event | `event:sessionStatus` |
| Event | `event:projectMetricsUpdated` |

## 15. 安全要求

- 所有输入在 preload 和主进程服务层都要校验。
- Renderer 不接收 secret 明文。
- Runtime 命令、参数、环境变量写入日志前必须脱敏。
- 文件选择和项目路径访问必须由主进程执行。
- 子进程 PID 不作为 Renderer 控制进程的能力凭据，停止进程必须通过 `session:stopRun`。
- 订阅事件中不得推送完整敏感输入包。
