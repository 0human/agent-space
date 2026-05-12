import type {
  PermissionPolicyBindingInput,
  PermissionPolicySetCreateInput,
  PermissionPolicySetUpdateInput,
  PermissionRule
} from '../../shared/api'
import { ValidationError } from '../runtime'

const SCOPES = [
  'workspace',
  'filesystem',
  'command',
  'network',
  'environment',
  'credential',
  'runtime',
  'tool'
]
const ACTIONS = [
  'read',
  'write',
  'create',
  'delete',
  'execute',
  'list',
  'request',
  'approve',
  'deny'
]
const DECISIONS = ['allow', 'ask', 'deny']
const OWNER_TYPES = ['agent_profile', 'runtime_config', 'team_member', 'project', 'work_session']
const MERGE_STRATEGIES = ['additive', 'override', 'restrictive']
const PRESETS = ['read_only', 'project_write', 'command_approval', 'full_access']

function stringValue(value: unknown, field: string, required = false): string | undefined {
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
  allowed: readonly string[],
  field: string,
  required = false
): T | undefined {
  const text = stringValue(value, field, required)
  if (text === undefined) {
    return undefined
  }

  if (!allowed.includes(text)) {
    throw new ValidationError(`${field} is invalid.`)
  }

  return text as T
}

function booleanValue(value: unknown, field: string): boolean | undefined {
  if (value === undefined) {
    return undefined
  }

  if (typeof value !== 'boolean') {
    throw new ValidationError(`${field} must be a boolean.`)
  }

  return value
}

function numberValue(value: unknown, field: string): number | undefined {
  if (value === undefined) {
    return undefined
  }

  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new ValidationError(`${field} must be a finite number.`)
  }

  return value
}

function validateRule(rule: PermissionRule, index: number): PermissionRule {
  return {
    scope: enumValue(rule.scope, SCOPES, `rules[${index}].scope`, true)!,
    action: enumValue(rule.action, ACTIONS, `rules[${index}].action`, true)!,
    decision: enumValue(rule.decision, DECISIONS, `rules[${index}].decision`, true)!,
    resources: Array.isArray(rule.resources)
      ? rule.resources.filter((resource): resource is string => typeof resource === 'string')
      : undefined,
    description: stringValue(rule.description, `rules[${index}].description`)
  }
}

export function validatePolicySetCreateInput(
  input: PermissionPolicySetCreateInput
): PermissionPolicySetCreateInput {
  if (!Array.isArray(input.rules)) {
    throw new ValidationError('rules must be an array.')
  }

  return {
    name: stringValue(input.name, 'name', true)!,
    description: stringValue(input.description, 'description'),
    preset: enumValue(input.preset, PRESETS, 'preset'),
    rules: input.rules.map(validateRule),
    enabled: booleanValue(input.enabled, 'enabled') ?? true
  }
}

export function validatePolicySetUpdateInput(
  input: PermissionPolicySetUpdateInput
): PermissionPolicySetUpdateInput {
  return {
    id: stringValue(input.id, 'id', true)!,
    name: input.name === undefined ? undefined : stringValue(input.name, 'name', true),
    description: stringValue(input.description, 'description'),
    preset: enumValue(input.preset, PRESETS, 'preset'),
    rules: input.rules === undefined ? undefined : input.rules.map(validateRule),
    enabled: booleanValue(input.enabled, 'enabled')
  }
}

export function validateBindingInput(
  input: PermissionPolicyBindingInput
): PermissionPolicyBindingInput {
  return {
    ownerType: enumValue(input.ownerType, OWNER_TYPES, 'ownerType', true)!,
    ownerId: stringValue(input.ownerId, 'ownerId', true)!,
    permissionPolicySetId: stringValue(input.permissionPolicySetId, 'permissionPolicySetId', true)!,
    mergeStrategy: enumValue(input.mergeStrategy, MERGE_STRATEGIES, 'mergeStrategy') ?? 'additive',
    priority: numberValue(input.priority, 'priority') ?? 0,
    enabled: booleanValue(input.enabled, 'enabled') ?? true
  }
}
