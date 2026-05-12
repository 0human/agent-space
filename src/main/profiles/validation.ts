import type {
  AgentProfileCreateInput,
  AgentProfileUpdateInput,
  DefaultCwdMode
} from '../../shared/api'
import { ValidationError } from '../runtime'

const CWD_MODES: DefaultCwdMode[] = ['project_root', 'custom_path']
const OUTPUT_STYLES = ['concise', 'structured', 'detailed']
const APPROVAL_MODES = ['auto', 'manual']
const PRESETS = ['read_only', 'project_write', 'command_approval', 'full_access']

function text(value: unknown, field: string, required = false): string | undefined {
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

function enumValue<T extends string>(
  value: unknown,
  allowed: string[],
  field: string
): T | undefined {
  const resolved = text(value, field)
  if (resolved === undefined) {
    return undefined
  }

  if (!allowed.includes(resolved)) {
    throw new ValidationError(`${field} is invalid.`)
  }

  return resolved as T
}

function stringArray(value: unknown, field: string): string[] | undefined {
  if (value === undefined) {
    return undefined
  }

  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    throw new ValidationError(`${field} must be a string array.`)
  }

  return value
}

export function validateAgentProfileCreateInput(
  input: AgentProfileCreateInput
): AgentProfileCreateInput {
  const defaultCwdMode =
    enumValue<DefaultCwdMode>(input.defaultCwdMode, CWD_MODES, 'defaultCwdMode') ?? 'project_root'
  const customCwd = text(input.customCwd, 'customCwd')

  if (defaultCwdMode === 'custom_path' && !customCwd) {
    throw new ValidationError('customCwd is required when defaultCwdMode is custom_path.')
  }

  return {
    name: text(input.name, 'name', true)!,
    description: text(input.description, 'description'),
    permissionPreset: enumValue(input.permissionPreset, PRESETS, 'permissionPreset'),
    permissionPolicySetIds:
      stringArray(input.permissionPolicySetIds, 'permissionPolicySetIds') ?? [],
    baseSystemPrompt: text(input.baseSystemPrompt, 'baseSystemPrompt'),
    rolePromptTemplate: text(input.rolePromptTemplate, 'rolePromptTemplate'),
    defaultArgs: stringArray(input.defaultArgs, 'defaultArgs') ?? [],
    defaultCwdMode,
    customCwd,
    outputStyle: enumValue(input.outputStyle, OUTPUT_STYLES, 'outputStyle'),
    approvalMode: enumValue(input.approvalMode, APPROVAL_MODES, 'approvalMode'),
    envWhitelist: stringArray(input.envWhitelist, 'envWhitelist') ?? []
  }
}

export function validateAgentProfileUpdateInput(
  input: AgentProfileUpdateInput
): AgentProfileUpdateInput {
  const defaultCwdMode = enumValue<DefaultCwdMode>(
    input.defaultCwdMode,
    CWD_MODES,
    'defaultCwdMode'
  )
  const customCwd = text(input.customCwd, 'customCwd')

  if (defaultCwdMode === 'custom_path' && !customCwd) {
    throw new ValidationError('customCwd is required when defaultCwdMode is custom_path.')
  }

  return {
    id: text(input.id, 'id', true)!,
    name: input.name === undefined ? undefined : text(input.name, 'name', true),
    description: text(input.description, 'description'),
    permissionPreset: enumValue(input.permissionPreset, PRESETS, 'permissionPreset'),
    permissionPolicySetIds: stringArray(input.permissionPolicySetIds, 'permissionPolicySetIds'),
    baseSystemPrompt: text(input.baseSystemPrompt, 'baseSystemPrompt'),
    rolePromptTemplate: text(input.rolePromptTemplate, 'rolePromptTemplate'),
    defaultArgs: stringArray(input.defaultArgs, 'defaultArgs'),
    defaultCwdMode,
    customCwd,
    outputStyle: enumValue(input.outputStyle, OUTPUT_STYLES, 'outputStyle'),
    approvalMode: enumValue(input.approvalMode, APPROVAL_MODES, 'approvalMode'),
    envWhitelist: stringArray(input.envWhitelist, 'envWhitelist')
  }
}
