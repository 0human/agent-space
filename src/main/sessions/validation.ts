import type {
  MessageCreateInput,
  MessageEventType,
  MessageListInput,
  MessageRole,
  WorkSessionAssignmentMode,
  WorkSessionCreateInput,
  WorkSessionListInput,
  WorkSessionStatus,
  WorkSessionUpdateInput
} from '../../shared/api'
import { ValidationError } from '../runtime'

const SESSION_STATUSES: WorkSessionStatus[] = [
  'idle',
  'running',
  'waiting_input',
  'waiting_permission',
  'completed',
  'error',
  'archived'
]
const ASSIGNMENT_MODES: WorkSessionAssignmentMode[] = ['team_member', 'runtime', 'manual']
const MESSAGE_ROLES: MessageRole[] = ['user', 'assistant', 'system', 'tool']
const MESSAGE_EVENT_TYPES: MessageEventType[] = ['message', 'member_switch', 'handoff']

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
  const trimmed = value.trim()
  if (required && !trimmed) {
    throw new ValidationError(`${field} is required.`)
  }
  return trimmed || undefined
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

function positiveInteger(value: unknown, field: string, fallback: number): number {
  if (value === undefined) {
    return fallback
  }
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new ValidationError(`${field} must be a positive integer.`)
  }
  return value
}

export function validateWorkSessionListInput(
  input: WorkSessionListInput = {}
): WorkSessionListInput {
  return {
    projectId: text(input.projectId, 'projectId'),
    archived: input.archived,
    status: enumValue<WorkSessionStatus>(input.status, SESSION_STATUSES, 'status')
  }
}

export function validateWorkSessionCreateInput(
  input: WorkSessionCreateInput
): WorkSessionCreateInput {
  return {
    projectId: text(input.projectId, 'projectId', true)!,
    title: text(input.title, 'title', true)!,
    goal: text(input.goal, 'goal'),
    aiTeamId: text(input.aiTeamId, 'aiTeamId'),
    aiTeamMemberId: text(input.aiTeamMemberId, 'aiTeamMemberId'),
    aiRuntimeConfigId: text(input.aiRuntimeConfigId, 'aiRuntimeConfigId'),
    agentProfileId: text(input.agentProfileId, 'agentProfileId'),
    assignmentMode: enumValue<WorkSessionAssignmentMode>(
      input.assignmentMode,
      ASSIGNMENT_MODES,
      'assignmentMode'
    ),
    parentWorkSessionId: text(input.parentWorkSessionId, 'parentWorkSessionId'),
    permissionPolicySetIds:
      stringArray(input.permissionPolicySetIds, 'permissionPolicySetIds') ?? []
  }
}

export function validateWorkSessionUpdateInput(
  input: WorkSessionUpdateInput
): WorkSessionUpdateInput {
  return {
    id: text(input.id, 'id', true)!,
    title: input.title === undefined ? undefined : text(input.title, 'title', true),
    goal: text(input.goal, 'goal'),
    status: enumValue<WorkSessionStatus>(input.status, SESSION_STATUSES, 'status'),
    summary: text(input.summary, 'summary')
  }
}

export function validateMessageListInput(input: MessageListInput): Required<MessageListInput> {
  return {
    workSessionId: text(input.workSessionId, 'workSessionId', true)!,
    limit: positiveInteger(input.limit, 'limit', 50),
    offset: positiveInteger(input.offset, 'offset', 0)
  }
}

export function validateMessageCreateInput(input: MessageCreateInput): MessageCreateInput {
  return {
    workSessionId: text(input.workSessionId, 'workSessionId', true)!,
    role: enumValue<MessageRole>(input.role, MESSAGE_ROLES, 'role') ?? 'user',
    eventType:
      enumValue<MessageEventType>(input.eventType, MESSAGE_EVENT_TYPES, 'eventType') ?? 'message',
    content: text(input.content, 'content', true)!,
    aiTeamMemberId: text(input.aiTeamMemberId, 'aiTeamMemberId'),
    inputSummary: input.inputSummary,
    inputEnvelopeSnapshot: input.inputEnvelopeSnapshot
  }
}
