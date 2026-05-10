import type {
  DefaultCwdMode,
  PermissionPreset,
  RuntimeCreateInput,
  RuntimeProvider,
  RuntimeSecretInput,
  RuntimeTestInput,
  RuntimeUpdateInput
} from '../../shared/api'

const RUNTIME_PROVIDERS: RuntimeProvider[] = [
  'claude_code_cli',
  'codex_cli',
  'gemini_cli',
  'custom_cli'
]
const CWD_MODES: DefaultCwdMode[] = ['project_root', 'custom_path']
const PERMISSION_PRESETS: PermissionPreset[] = [
  'read_only',
  'project_write',
  'command_approval',
  'full_access'
]

export class ValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ValidationError'
  }
}

function assertString(value: unknown, field: string, required = false): string | undefined {
  if (value === undefined || value === null || value === '') {
    if (required) {
      throw new ValidationError(`${field} is required.`)
    }

    return undefined
  }

  if (typeof value !== 'string') {
    throw new ValidationError(`${field} must be a string.`)
  }

  return value.trim()
}

function assertRequiredString(value: unknown, field: string): string {
  const result = assertString(value, field, true)

  if (result === undefined) {
    throw new ValidationError(`${field} is required.`)
  }

  return result
}

function assertBoolean(value: unknown, field: string): boolean | undefined {
  if (value === undefined) {
    return undefined
  }

  if (typeof value !== 'boolean') {
    throw new ValidationError(`${field} must be a boolean.`)
  }

  return value
}

function assertStringArray(value: unknown, field: string): string[] | undefined {
  if (value === undefined) {
    return undefined
  }

  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    throw new ValidationError(`${field} must be a string array.`)
  }

  return value
}

function assertProvider(value: unknown): RuntimeProvider {
  if (!RUNTIME_PROVIDERS.includes(value as RuntimeProvider)) {
    throw new ValidationError('provider is invalid.')
  }

  return value as RuntimeProvider
}

function assertOptionalProvider(value: unknown): RuntimeProvider | undefined {
  if (value === undefined) {
    return undefined
  }

  return assertProvider(value)
}

function assertCwdMode(value: unknown): DefaultCwdMode | undefined {
  if (value === undefined) {
    return undefined
  }

  if (!CWD_MODES.includes(value as DefaultCwdMode)) {
    throw new ValidationError('defaultCwdMode is invalid.')
  }

  return value as DefaultCwdMode
}

function assertPermissionPreset(value: unknown): PermissionPreset | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined
  }

  if (!PERMISSION_PRESETS.includes(value as PermissionPreset)) {
    throw new ValidationError('permissionPreset is invalid.')
  }

  return value as PermissionPreset
}

function assertSecrets(value: unknown): RuntimeSecretInput[] | undefined {
  if (value === undefined) {
    return undefined
  }

  if (!Array.isArray(value)) {
    throw new ValidationError('secrets must be an array.')
  }

  return value.map((secret, index) => {
    if (!secret || typeof secret !== 'object') {
      throw new ValidationError(`secrets[${index}] is invalid.`)
    }

    const candidate = secret as Record<string, unknown>
    return {
      secretKind: assertRequiredString(candidate.secretKind, `secrets[${index}].secretKind`),
      value: assertRequiredString(candidate.value, `secrets[${index}].value`)
    }
  })
}

export function validateRuntimeCreateInput(input: RuntimeCreateInput): RuntimeCreateInput {
  const defaultCwdMode = assertCwdMode(input.defaultCwdMode) ?? 'project_root'
  const customCwd = assertString(input.customCwd, 'customCwd')

  if (defaultCwdMode === 'custom_path' && !customCwd) {
    throw new ValidationError('customCwd is required when defaultCwdMode is custom_path.')
  }

  return {
    name: assertRequiredString(input.name, 'name'),
    runtimeType: 'cli_agent',
    provider: assertProvider(input.provider),
    agentProfileId: assertString(input.agentProfileId, 'agentProfileId'),
    model: assertString(input.model, 'model'),
    executablePath: assertString(input.executablePath, 'executablePath'),
    defaultArgs: assertStringArray(input.defaultArgs, 'defaultArgs') ?? [],
    defaultCwdMode,
    customCwd,
    systemPrompt: assertString(input.systemPrompt, 'systemPrompt'),
    streamEnabled: assertBoolean(input.streamEnabled, 'streamEnabled') ?? true,
    permissionPreset: assertPermissionPreset(input.permissionPreset),
    secrets: assertSecrets(input.secrets) ?? [],
    notes: assertString(input.notes, 'notes'),
    enabled: assertBoolean(input.enabled, 'enabled') ?? true,
    isDefault: assertBoolean(input.isDefault, 'isDefault') ?? false
  }
}

export function validateRuntimeUpdateInput(input: RuntimeUpdateInput): RuntimeUpdateInput {
  const defaultCwdMode = assertCwdMode(input.defaultCwdMode)
  const customCwd = assertString(input.customCwd, 'customCwd')

  if (defaultCwdMode === 'custom_path' && !customCwd) {
    throw new ValidationError('customCwd is required when defaultCwdMode is custom_path.')
  }

  return {
    id: assertRequiredString(input.id, 'id'),
    name: input.name === undefined ? undefined : assertRequiredString(input.name, 'name'),
    runtimeType: 'cli_agent',
    provider: assertOptionalProvider(input.provider),
    agentProfileId: assertString(input.agentProfileId, 'agentProfileId'),
    model: assertString(input.model, 'model'),
    executablePath: assertString(input.executablePath, 'executablePath'),
    defaultArgs: assertStringArray(input.defaultArgs, 'defaultArgs'),
    defaultCwdMode,
    customCwd,
    systemPrompt: assertString(input.systemPrompt, 'systemPrompt'),
    streamEnabled: assertBoolean(input.streamEnabled, 'streamEnabled'),
    permissionPreset: assertPermissionPreset(input.permissionPreset),
    secrets: assertSecrets(input.secrets),
    notes: assertString(input.notes, 'notes'),
    enabled: assertBoolean(input.enabled, 'enabled'),
    isDefault: assertBoolean(input.isDefault, 'isDefault'),
    replaceSecrets: assertSecrets(input.replaceSecrets)
  }
}

export function validateRuntimeTestInput(input: RuntimeTestInput): RuntimeTestInput {
  const runtimeConfigId = assertString(input.runtimeConfigId, 'runtimeConfigId')
  const provider = input.provider === undefined ? undefined : assertProvider(input.provider)
  const executablePath = assertString(input.executablePath, 'executablePath')

  if (!runtimeConfigId && (!provider || !executablePath)) {
    throw new ValidationError('runtimeConfigId or provider with executablePath is required.')
  }

  return {
    runtimeConfigId,
    provider,
    executablePath,
    defaultArgs: assertStringArray(input.defaultArgs, 'defaultArgs') ?? []
  }
}
