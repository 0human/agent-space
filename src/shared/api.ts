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

export interface AgentSpaceAPI {
  app: AppAPI
  runtimes: RuntimeAPI
  permissions: PermissionAPI
  agentProfiles: AgentProfileAPI
}
