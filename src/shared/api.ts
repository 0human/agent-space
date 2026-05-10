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
}

export interface AgentSpaceAPI {
  app: AppAPI
  runtimes: RuntimeAPI
}
