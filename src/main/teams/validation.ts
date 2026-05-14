import type { TeamCreateInput, TeamMemberCreateInput, TeamUpdateInput } from '../../shared/api'
import { ValidationError } from '../runtime'

const ROLES = ['analyst', 'architect', 'developer', 'tester', 'reviewer', 'summarizer', 'custom']
const LAUNCH_MODES = ['analysis', 'development', 'custom']

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

function validateMember(input: TeamMemberCreateInput, index: number): TeamMemberCreateInput {
  return {
    name: text(input.name, `members[${index}].name`, true)!,
    role: enumValue(input.role, ROLES, `members[${index}].role`) ?? 'custom',
    runtimeConfigId: text(input.runtimeConfigId, `members[${index}].runtimeConfigId`, true)!,
    agentProfileId: text(input.agentProfileId, `members[${index}].agentProfileId`),
    permissionPolicySetIds: stringArray(
      input.permissionPolicySetIds,
      `members[${index}].permissionPolicySetIds`
    ),
    taskInstruction: text(input.taskInstruction, `members[${index}].taskInstruction`),
    enabled: booleanValue(input.enabled, `members[${index}].enabled`) ?? true,
    sortOrder: numberValue(input.sortOrder, `members[${index}].sortOrder`) ?? index
  }
}

export function validateTeamCreateInput(input: TeamCreateInput): TeamCreateInput {
  return {
    name: text(input.name, 'name', true)!,
    goal: text(input.goal, 'goal'),
    description: text(input.description, 'description'),
    defaultLaunchMode: enumValue(input.defaultLaunchMode, LAUNCH_MODES, 'defaultLaunchMode'),
    members: (input.members ?? []).map(validateMember)
  }
}

export function validateTeamUpdateInput(input: TeamUpdateInput): TeamUpdateInput {
  return {
    id: text(input.id, 'id', true)!,
    name: input.name === undefined ? undefined : text(input.name, 'name', true),
    goal: text(input.goal, 'goal'),
    description: text(input.description, 'description'),
    defaultLaunchMode: enumValue(input.defaultLaunchMode, LAUNCH_MODES, 'defaultLaunchMode'),
    members: input.members === undefined ? undefined : input.members.map(validateMember)
  }
}
