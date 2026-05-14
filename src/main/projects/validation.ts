import type {
  ProjectCreateInput,
  ProjectPhase,
  ProjectUpdateInput,
  RiskStatus
} from '../../shared/api'
import { ValidationError } from '../runtime'

const PHASES: ProjectPhase[] = [
  'requirements',
  'design',
  'development',
  'testing',
  'delivery',
  'archived'
]
const RISKS: RiskStatus[] = ['normal', 'attention', 'risk']

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
  allowed: readonly string[],
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

function assertDefaultAssigneeXor(
  defaultAiTeamId?: string,
  defaultAiRuntimeConfigId?: string
): void {
  if (defaultAiTeamId && defaultAiRuntimeConfigId) {
    throw new ValidationError(
      'defaultAiTeamId and defaultAiRuntimeConfigId are mutually exclusive.'
    )
  }
}

export function validateProjectCreateInput(input: ProjectCreateInput): ProjectCreateInput {
  const defaultAiTeamId = text(input.defaultAiTeamId, 'defaultAiTeamId')
  const defaultAiRuntimeConfigId = text(input.defaultAiRuntimeConfigId, 'defaultAiRuntimeConfigId')
  assertDefaultAssigneeXor(defaultAiTeamId, defaultAiRuntimeConfigId)

  return {
    name: text(input.name, 'name', true)!,
    description: text(input.description, 'description'),
    localPath: text(input.localPath, 'localPath', true)!,
    phase: enumValue<ProjectPhase>(input.phase, PHASES, 'phase') ?? 'requirements',
    defaultAiTeamId,
    defaultAiRuntimeConfigId,
    defaultAgentProfileId: text(input.defaultAgentProfileId, 'defaultAgentProfileId'),
    permissionPolicySetIds:
      stringArray(input.permissionPolicySetIds, 'permissionPolicySetIds') ?? [],
    postCreateAction: enumValue(
      input.postCreateAction,
      ['open_project', 'open_dashboard', 'open_first_session'],
      'postCreateAction'
    )
  }
}

export function validateProjectUpdateInput(input: ProjectUpdateInput): ProjectUpdateInput {
  const defaultAiTeamId = text(input.defaultAiTeamId, 'defaultAiTeamId')
  const defaultAiRuntimeConfigId = text(input.defaultAiRuntimeConfigId, 'defaultAiRuntimeConfigId')
  assertDefaultAssigneeXor(defaultAiTeamId, defaultAiRuntimeConfigId)

  return {
    id: text(input.id, 'id', true)!,
    name: input.name === undefined ? undefined : text(input.name, 'name', true),
    description: text(input.description, 'description'),
    localPath: text(input.localPath, 'localPath'),
    phase: enumValue<ProjectPhase>(input.phase, PHASES, 'phase'),
    defaultAiTeamId,
    defaultAiRuntimeConfigId,
    defaultAgentProfileId: text(input.defaultAgentProfileId, 'defaultAgentProfileId'),
    permissionPolicySetIds: stringArray(input.permissionPolicySetIds, 'permissionPolicySetIds'),
    archived: input.archived,
    postCreateAction: input.postCreateAction
  }
}

export function validateRiskStatus(value: unknown): RiskStatus | undefined {
  return enumValue<RiskStatus>(value, RISKS, 'riskStatus')
}
