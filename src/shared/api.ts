export type ApiResult<T> =
  | {
      ok: true
      data: T
    }
  | {
      ok: false
      error: ApiError
    }

export interface ApiError {
  code: string
  message: string
  details?: Record<string, unknown>
  recoverable?: boolean
}

export interface AppInfo {
  appVersion: string
  platform: NodeJS.Platform
  databaseReady: boolean
  databasePath?: string
}

export type RuntimeProvider = 'claude_code_cli' | 'codex_cli' | 'gemini_cli' | 'custom_cli'
export type RuntimeType = 'cli_agent' | 'api_provider'
export type RuntimeSource = 'manual' | 'ccswitch' | 'imported'
export type DefaultCwdMode = 'project_root' | 'custom_path'
export type PermissionPreset = 'read_only' | 'project_write' | 'command_approval' | 'full_access'
export type PermissionPolicyOwnerType =
  | 'agent_profile'
  | 'runtime_config'
  | 'team_member'
  | 'project'
  | 'work_session'
export type PermissionPolicyMergeStrategy = 'additive' | 'override' | 'restrictive'
export type PermissionScope =
  | 'workspace'
  | 'filesystem'
  | 'command'
  | 'network'
  | 'environment'
  | 'credential'
  | 'runtime'
  | 'tool'
export type PermissionAction =
  | 'read'
  | 'write'
  | 'create'
  | 'delete'
  | 'execute'
  | 'list'
  | 'request'
  | 'approve'
  | 'deny'
export type PermissionDecision = 'allow' | 'ask' | 'deny'
export type ProjectMode = 'team' | 'manual'
export type ProjectPhase =
  | 'requirements'
  | 'design'
  | 'development'
  | 'testing'
  | 'delivery'
  | 'archived'
export type RiskStatus = 'normal' | 'attention' | 'risk'
export type WorkSessionStatus =
  | 'idle'
  | 'running'
  | 'waiting_input'
  | 'waiting_permission'
  | 'completed'
  | 'error'
  | 'archived'
export type WorkSessionAssignmentMode = 'team_member' | 'runtime' | 'manual'
export type WorkSessionAssigneeType = 'team_member' | 'runtime' | 'user'
export type MessageRole = 'user' | 'assistant' | 'system' | 'tool'
export type MessageEventType = 'message' | 'member_switch' | 'handoff'
export type TeamDefaultLaunchMode = 'analysis' | 'development' | 'custom'
export type TeamMemberRole =
  | 'analyst'
  | 'architect'
  | 'developer'
  | 'tester'
  | 'reviewer'
  | 'summarizer'
  | 'custom'
export type RuntimeTestStatus =
  | 'success'
  | 'command_not_found'
  | 'version_incompatible'
  | 'auth_unavailable'
  | 'startup_failed'
  | 'unknown_error'

export interface RuntimeListInput {
  enabled?: boolean
  provider?: RuntimeProvider
  query?: string
}

export interface RuntimeSummary {
  id: string
  name: string
  runtimeType: RuntimeType
  provider: RuntimeProvider
  model?: string
  executablePath?: string
  permissionPreset?: PermissionPreset
  enabled: boolean
  isDefault: boolean
  lastTestStatus?: RuntimeTestStatus
  lastTestedAt?: string
  lastUsedAt?: string
}

export interface RuntimeSecretSummary {
  id: string
  secretKind: string
  maskedValue?: string
  lastValidatedAt?: string
}

export interface RuntimeDetail extends RuntimeSummary {
  agentProfileId?: string
  source: RuntimeSource
  sourceRef?: string
  defaultArgs: string[]
  defaultCwdMode: DefaultCwdMode
  customCwd?: string
  systemPrompt?: string
  streamEnabled: boolean
  notes?: string
  secrets: RuntimeSecretSummary[]
  createdAt: string
  updatedAt: string
}

export interface RuntimeSecretInput {
  secretKind: string
  value: string
}

export interface RuntimeCreateInput {
  name: string
  runtimeType?: 'cli_agent'
  provider: RuntimeProvider
  agentProfileId?: string
  model?: string
  executablePath?: string
  defaultArgs?: string[]
  defaultCwdMode?: DefaultCwdMode
  customCwd?: string
  systemPrompt?: string
  streamEnabled?: boolean
  permissionPreset?: PermissionPreset
  secrets?: RuntimeSecretInput[]
  notes?: string
  enabled?: boolean
  isDefault?: boolean
}

export interface RuntimeUpdateInput extends Partial<RuntimeCreateInput> {
  id: string
  replaceSecrets?: RuntimeSecretInput[]
}

export interface RuntimeDeleteInput {
  id: string
  mode: 'disable' | 'hard_delete'
}

export interface RuntimeTestInput {
  runtimeConfigId?: string
  provider?: RuntimeProvider
  executablePath?: string
  defaultArgs?: string[]
}

export interface RuntimeTestResult {
  status: RuntimeTestStatus
  message: string
  version?: string
  authenticated?: boolean
  testedAt: string
}

export interface RuntimeImportPreviewInput {
  sourceType: 'text' | 'deep_link_text' | 'json_text' | 'file' | 'clipboard'
  formatHint?: 'auto' | 'ccswitch' | 'generic_json'
  content?: string
  filePath?: string
}

export interface RuntimeImportPreview {
  tempId: string
  name: string
  provider: RuntimeProvider
  model?: string
  containsSecrets: boolean
  secretKinds: string[]
  conflict: 'none' | 'name_exists'
  rawSummary?: string
  warnings: string[]
}

export interface RuntimeImportPreviewResult {
  importSessionId: string
  previews: RuntimeImportPreview[]
}

export interface RuntimeImportCommitInput {
  importSessionId?: string
  previews: {
    tempId: string
    action: 'create' | 'rename' | 'overwrite' | 'skip'
    targetRuntimeId?: string
    newName?: string
    importSecrets?: boolean
  }[]
}

export interface RuntimeImportCommitResult {
  createdCount: number
  updatedCount: number
  skippedCount: number
  failed: { tempId: string; reason: string }[]
}

export interface PermissionRule {
  scope: PermissionScope
  action: PermissionAction
  decision: PermissionDecision
  resources?: string[]
  description?: string
}

export interface PermissionPolicySetSummary {
  id: string
  name: string
  description?: string
  preset?: PermissionPreset
  enabled: boolean
  lastUsedAt?: string
}

export interface PermissionPolicySetDetail extends PermissionPolicySetSummary {
  rules: PermissionRule[]
  createdAt: string
  updatedAt: string
}

export interface PermissionPolicySetCreateInput {
  name: string
  description?: string
  preset?: PermissionPreset
  rules: PermissionRule[]
  enabled?: boolean
}

export interface PermissionPolicySetUpdateInput extends Partial<PermissionPolicySetCreateInput> {
  id: string
}

export interface PermissionPolicyBindingInput {
  ownerType: PermissionPolicyOwnerType
  ownerId: string
  permissionPolicySetId: string
  mergeStrategy?: PermissionPolicyMergeStrategy
  priority?: number
  enabled?: boolean
}

export interface PermissionPolicyBindingSummary extends PermissionPolicyBindingInput {
  id: string
  policySetName: string
}

export interface PermissionResolvePreviewInput {
  agentProfileId?: string
  runtimeConfigId?: string
  teamMemberId?: string
  projectId?: string
  workSessionId?: string
}

export interface PermissionResolvePreview {
  summary: string
  effectiveRules: PermissionRule[]
  sources: {
    ownerType: string
    ownerId: string
    policySetId: string
    policySetName: string
    mergeStrategy: string
    priority: number
  }[]
}

export interface AgentProfileSummary {
  id: string
  name: string
  description?: string
  permissionPreset?: PermissionPreset
  outputStyle?: 'concise' | 'structured' | 'detailed'
  approvalMode?: 'auto' | 'manual'
  lastUsedAt?: string
}

export interface AgentProfileDetail extends AgentProfileSummary {
  baseSystemPrompt?: string
  rolePromptTemplate?: string
  defaultArgs: string[]
  defaultCwdMode: DefaultCwdMode
  customCwd?: string
  envWhitelist: string[]
  createdAt: string
  updatedAt: string
}

export interface AgentProfileCreateInput {
  name: string
  description?: string
  permissionPreset?: PermissionPreset
  permissionPolicySetIds?: string[]
  baseSystemPrompt?: string
  rolePromptTemplate?: string
  defaultArgs?: string[]
  defaultCwdMode?: DefaultCwdMode
  customCwd?: string
  outputStyle?: 'concise' | 'structured' | 'detailed'
  approvalMode?: 'auto' | 'manual'
  envWhitelist?: string[]
}

export interface AgentProfileUpdateInput extends Partial<AgentProfileCreateInput> {
  id: string
}

export interface TeamSummary {
  id: string
  name: string
  goal?: string
  memberCount: number
  lastUsedAt?: string
}

export interface TeamMemberCreateInput {
  name: string
  role: TeamMemberRole
  runtimeConfigId: string
  agentProfileId?: string
  permissionPolicySetIds?: string[]
  taskInstruction?: string
  enabled?: boolean
  sortOrder?: number
}

export interface TeamCreateInput {
  name: string
  goal?: string
  description?: string
  defaultLaunchMode?: TeamDefaultLaunchMode
  members?: TeamMemberCreateInput[]
}

export interface TeamUpdateInput extends Partial<TeamCreateInput> {
  id: string
}

export interface TeamMemberDetail extends TeamMemberCreateInput {
  id: string
  runtimeName: string
  runtimeProvider: RuntimeProvider
  createdAt: string
  updatedAt: string
}

export interface TeamDetail extends TeamSummary {
  description?: string
  defaultLaunchMode?: TeamDefaultLaunchMode
  members: TeamMemberDetail[]
  createdAt: string
  updatedAt: string
}

export interface ProjectMetrics {
  activeSessionCount: number
  runningAgentCount: number
  waitingInputCount: number
  waitingPermissionCount: number
  errorSessionCount: number
  recentOutputAt?: string
  recentFailureAt?: string
  recentRuntimeType?: RuntimeProvider
  fileChangeCount: number
}

export interface ProjectListInput {
  archived?: boolean
  riskStatus?: RiskStatus
  phase?: ProjectPhase
  sortBy?: 'last_active_at' | 'risk_status' | 'phase'
}

export interface ProjectSummary {
  id: string
  name: string
  localPath: string
  mode: ProjectMode
  phase: ProjectPhase
  riskStatus: RiskStatus
  defaultAiTeamId?: string
  defaultAiRuntimeConfigId?: string
  metrics?: ProjectMetrics
  lastActiveAt?: string
}

export interface ProjectCreateInput {
  name: string
  description?: string
  localPath: string
  phase?: ProjectPhase
  defaultAiTeamId?: string
  defaultAiRuntimeConfigId?: string
  defaultAgentProfileId?: string
  permissionPolicySetIds?: string[]
  postCreateAction?: 'open_project' | 'open_dashboard' | 'open_first_session'
}

export interface ProjectDetail extends ProjectSummary {
  description?: string
  defaultAgentProfileId?: string
  createdAt: string
  updatedAt: string
  archivedAt?: string
}

export interface ProjectCreateResult {
  project: ProjectDetail
  createdSessionId?: string
  postCreateWarning?: string
}

export interface ProjectUpdateInput extends Partial<ProjectCreateInput> {
  id: string
  archived?: boolean
}

export interface ProjectArchiveInput {
  id: string
  archiveSessions?: boolean
}

export interface WorkSessionListInput {
  projectId?: string
  archived?: boolean
  status?: WorkSessionStatus
}

export interface WorkSessionSummary {
  id: string
  projectId: string
  projectName: string
  title: string
  goal?: string
  status: WorkSessionStatus
  assignmentMode: WorkSessionAssignmentMode
  activeAssigneeType: WorkSessionAssigneeType
  aiTeamId?: string
  aiTeamMemberId?: string
  aiRuntimeConfigId?: string
  agentProfileId?: string
  parentWorkSessionId?: string
  latestRunId?: string
  summary?: string
  lastMessageAt?: string
  createdAt: string
  updatedAt: string
  archivedAt?: string
  messageCount: number
}

export interface WorkSessionDetail extends WorkSessionSummary {
  externalSessionId?: string
  resolvedConfigSnapshot?: Record<string, unknown>
}

export interface WorkSessionCreateInput {
  projectId: string
  title: string
  goal?: string
  aiTeamId?: string
  aiTeamMemberId?: string
  aiRuntimeConfigId?: string
  agentProfileId?: string
  assignmentMode?: WorkSessionAssignmentMode
  parentWorkSessionId?: string
  permissionPolicySetIds?: string[]
}

export interface WorkSessionUpdateInput {
  id: string
  title?: string
  goal?: string
  status?: WorkSessionStatus
  summary?: string
}

export interface WorkSessionArchiveInput {
  id: string
}

export interface MessageSummary {
  id: string
  workSessionId: string
  role: MessageRole
  eventType: MessageEventType
  aiTeamMemberId?: string
  fromAiTeamMemberId?: string
  toAiTeamMemberId?: string
  content: string
  inputSummary?: Record<string, unknown>
  inputEnvelopeSnapshot?: Record<string, unknown>
  displayState?: Record<string, unknown>
  runtimeSnapshot?: Record<string, unknown>
  tokenUsage?: Record<string, unknown>
  error?: Record<string, unknown>
  createdAt: string
}

export interface MessageListInput {
  workSessionId: string
  limit?: number
  offset?: number
}

export interface MessageCreateInput {
  workSessionId: string
  role?: MessageRole
  eventType?: MessageEventType
  content: string
  aiTeamMemberId?: string
  inputSummary?: Record<string, unknown>
  inputEnvelopeSnapshot?: Record<string, unknown>
}

export interface AppAPI {
  getInfo: () => Promise<ApiResult<AppInfo>>
}

export interface RuntimeAPI {
  list: (input?: RuntimeListInput) => Promise<ApiResult<RuntimeSummary[]>>
  get: (id: string) => Promise<ApiResult<RuntimeDetail>>
  create: (input: RuntimeCreateInput) => Promise<ApiResult<RuntimeDetail>>
  update: (input: RuntimeUpdateInput) => Promise<ApiResult<RuntimeDetail>>
  delete: (input: RuntimeDeleteInput) => Promise<ApiResult<RuntimeDetail>>
  test: (input: RuntimeTestInput) => Promise<ApiResult<RuntimeTestResult>>
  importPreview: (
    input: RuntimeImportPreviewInput
  ) => Promise<ApiResult<RuntimeImportPreviewResult>>
  importCommit: (input: RuntimeImportCommitInput) => Promise<ApiResult<RuntimeImportCommitResult>>
}

export interface PermissionAPI {
  listPolicySets: () => Promise<ApiResult<PermissionPolicySetSummary[]>>
  getPolicySet: (id: string) => Promise<ApiResult<PermissionPolicySetDetail>>
  createPolicySet: (
    input: PermissionPolicySetCreateInput
  ) => Promise<ApiResult<PermissionPolicySetDetail>>
  updatePolicySet: (
    input: PermissionPolicySetUpdateInput
  ) => Promise<ApiResult<PermissionPolicySetDetail>>
  bindPolicySet: (
    input: PermissionPolicyBindingInput
  ) => Promise<ApiResult<PermissionPolicyBindingSummary>>
  resolvePreview: (
    input: PermissionResolvePreviewInput
  ) => Promise<ApiResult<PermissionResolvePreview>>
}

export interface AgentProfileAPI {
  list: () => Promise<ApiResult<AgentProfileSummary[]>>
  get: (id: string) => Promise<ApiResult<AgentProfileDetail>>
  create: (input: AgentProfileCreateInput) => Promise<ApiResult<AgentProfileDetail>>
  update: (input: AgentProfileUpdateInput) => Promise<ApiResult<AgentProfileDetail>>
}

export interface TeamAPI {
  list: () => Promise<ApiResult<TeamSummary[]>>
  get: (id: string) => Promise<ApiResult<TeamDetail>>
  create: (input: TeamCreateInput) => Promise<ApiResult<TeamDetail>>
  update: (input: TeamUpdateInput) => Promise<ApiResult<TeamDetail>>
}

export interface ProjectAPI {
  list: (input?: ProjectListInput) => Promise<ApiResult<ProjectSummary[]>>
  get: (id: string) => Promise<ApiResult<ProjectDetail>>
  create: (input: ProjectCreateInput) => Promise<ApiResult<ProjectCreateResult>>
  update: (input: ProjectUpdateInput) => Promise<ApiResult<ProjectDetail>>
  archive: (input: ProjectArchiveInput) => Promise<ApiResult<ProjectDetail>>
}

export interface SessionAPI {
  list: (input?: WorkSessionListInput) => Promise<ApiResult<WorkSessionSummary[]>>
  get: (id: string) => Promise<ApiResult<WorkSessionDetail>>
  create: (input: WorkSessionCreateInput) => Promise<ApiResult<WorkSessionDetail>>
  update: (input: WorkSessionUpdateInput) => Promise<ApiResult<WorkSessionDetail>>
  archive: (input: WorkSessionArchiveInput) => Promise<ApiResult<WorkSessionDetail>>
  listMessages: (input: MessageListInput) => Promise<ApiResult<MessageSummary[]>>
  addMessage: (input: MessageCreateInput) => Promise<ApiResult<MessageSummary>>
}

export interface AgentSpaceAPI {
  app: AppAPI
  runtimes: RuntimeAPI
  permissions: PermissionAPI
  agentProfiles: AgentProfileAPI
  teams: TeamAPI
  projects: ProjectAPI
  sessions: SessionAPI
}
