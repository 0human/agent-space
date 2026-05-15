import type {
  MessageCreateInput,
  MessageListInput,
  MessageSummary,
  ProjectMetrics,
  WorkSessionArchiveInput,
  WorkSessionAssigneeType,
  WorkSessionCreateInput,
  WorkSessionDetail,
  WorkSessionListInput,
  WorkSessionSummary,
  WorkSessionUpdateInput
} from '../../shared/api'
import { createRepositories, type Repositories } from '../db'
import type { AppDatabase } from '../db/client'
import type { Message, WorkSession } from '../db/schema'
import { ValidationError } from '../runtime'
import {
  validateMessageCreateInput,
  validateMessageListInput,
  validateWorkSessionCreateInput,
  validateWorkSessionListInput,
  validateWorkSessionUpdateInput
} from './validation'

function optional<T>(value: T | null): T | undefined {
  return value ?? undefined
}

function parseJsonObject(value: string | null): Record<string, unknown> | undefined {
  if (!value) {
    return undefined
  }
  const parsed = JSON.parse(value) as unknown
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
    ? (parsed as Record<string, unknown>)
    : undefined
}

function stringifyJsonObject(value: Record<string, unknown> | undefined): string | undefined {
  return value ? JSON.stringify(value) : undefined
}

function now(): string {
  return new Date().toISOString()
}

export class SessionService {
  constructor(private readonly db: AppDatabase) {}

  list(input: WorkSessionListInput = {}): WorkSessionSummary[] {
    const validated = validateWorkSessionListInput(input)
    const repositories = createRepositories(this.db)
    const sessions = validated.projectId
      ? repositories.workSessions.listByProject(validated.projectId)
      : repositories.workSessions.list()

    return sessions
      .filter((session) => (validated.archived ? Boolean(session.archivedAt) : !session.archivedAt))
      .filter((session) => (validated.status ? session.status === validated.status : true))
      .map((session) => this.toSummary(session, repositories))
  }

  get(id: string): WorkSessionDetail {
    const repositories = createRepositories(this.db)
    const session = repositories.workSessions.getById(id)
    if (!session) {
      throw new ValidationError('Work Session not found.')
    }

    return this.toDetail(session, repositories)
  }

  create(input: WorkSessionCreateInput): WorkSessionDetail {
    const validated = validateWorkSessionCreateInput(input)

    return this.db.transaction((tx) => {
      const repositories = createRepositories(tx)
      const project = repositories.projects.getById(validated.projectId)
      if (!project || project.archivedAt) {
        throw new ValidationError('Project not found.')
      }
      if (
        validated.parentWorkSessionId &&
        !repositories.workSessions.getById(validated.parentWorkSessionId)
      ) {
        throw new ValidationError('Parent Work Session not found.')
      }

      const resolved = this.resolveAssignee(validated, repositories)
      const createdAt = now()
      const session = repositories.workSessions.create({
        projectId: project.id,
        title: validated.title,
        goal: validated.goal,
        status: 'idle',
        aiTeamId: resolved.aiTeamId,
        aiTeamMemberId: resolved.aiTeamMemberId,
        aiRuntimeConfigId: resolved.aiRuntimeConfigId,
        agentProfileId: validated.agentProfileId ?? project.defaultAgentProfileId,
        assignmentMode: resolved.assignmentMode,
        activeAssigneeType: resolved.activeAssigneeType,
        parentWorkSessionId: validated.parentWorkSessionId,
        resolvedConfigSnapshotJson: JSON.stringify({
          projectId: project.id,
          projectMode: project.mode,
          assignmentMode: resolved.assignmentMode,
          activeAssigneeType: resolved.activeAssigneeType
        }),
        lastMessageAt: createdAt
      })

      for (const policySetId of validated.permissionPolicySetIds ?? []) {
        repositories.permissionPolicyBindings.create({
          ownerType: 'work_session',
          ownerId: session.id,
          permissionPolicySetId: policySetId,
          mergeStrategy: 'additive',
          priority: 0,
          enabled: 1
        })
      }

      repositories.projects.update(project.id, { lastActiveAt: createdAt })
      this.refreshProjectMetrics(project.id, repositories)

      return this.toDetail(session, repositories)
    })
  }

  update(input: WorkSessionUpdateInput): WorkSessionDetail {
    const validated = validateWorkSessionUpdateInput(input)
    const repositories = createRepositories(this.db)
    const session = repositories.workSessions.update(validated.id, {
      title: validated.title,
      goal: validated.goal,
      status: validated.status,
      summary: validated.summary
    })
    if (!session) {
      throw new ValidationError('Work Session not found.')
    }

    this.refreshProjectMetrics(session.projectId, repositories)
    return this.toDetail(session, repositories)
  }

  archive(input: WorkSessionArchiveInput): WorkSessionDetail {
    const repositories = createRepositories(this.db)
    const session = repositories.workSessions.archive(input.id)
    if (!session) {
      throw new ValidationError('Work Session not found.')
    }

    this.refreshProjectMetrics(session.projectId, repositories)
    return this.toDetail(session, repositories)
  }

  listMessages(input: MessageListInput): MessageSummary[] {
    const validated = validateMessageListInput(input)
    const repositories = createRepositories(this.db)
    if (!repositories.workSessions.getById(validated.workSessionId)) {
      throw new ValidationError('Work Session not found.')
    }

    return repositories.messages
      .listBySession(validated.workSessionId, validated.limit, validated.offset)
      .map((message) => this.toMessageSummary(message))
  }

  addMessage(input: MessageCreateInput): MessageSummary {
    const validated = validateMessageCreateInput(input)

    return this.db.transaction((tx) => {
      const repositories = createRepositories(tx)
      const session = repositories.workSessions.getById(validated.workSessionId)
      if (!session || session.archivedAt) {
        throw new ValidationError('Work Session not found.')
      }

      const createdAt = now()
      const message = repositories.messages.create({
        workSessionId: session.id,
        role: validated.role ?? 'user',
        eventType: validated.eventType ?? 'message',
        aiTeamMemberId: validated.aiTeamMemberId ?? session.aiTeamMemberId,
        content: validated.content,
        inputSummaryJson: stringifyJsonObject(validated.inputSummary),
        inputEnvelopeSnapshotJson: stringifyJsonObject(validated.inputEnvelopeSnapshot),
        createdAt
      })

      repositories.workSessions.update(session.id, {
        status: validated.role === 'user' ? 'waiting_input' : session.status,
        lastMessageAt: createdAt
      })
      repositories.projects.update(session.projectId, { lastActiveAt: createdAt })
      this.refreshProjectMetrics(session.projectId, repositories)

      return this.toMessageSummary(message)
    })
  }

  private resolveAssignee(input: WorkSessionCreateInput, repositories: Repositories) {
    const project = repositories.projects.getById(input.projectId)
    if (!project) {
      throw new ValidationError('Project not found.')
    }

    if (input.aiTeamMemberId) {
      const member = repositories.teamMembers.getById(input.aiTeamMemberId)
      if (!member) {
        throw new ValidationError('Team member not found.')
      }
      return {
        aiTeamId: member.teamId,
        aiTeamMemberId: member.id,
        aiRuntimeConfigId: member.runtimeConfigId,
        assignmentMode: 'team_member' as const,
        activeAssigneeType: 'team_member' as WorkSessionAssigneeType
      }
    }

    if (input.aiRuntimeConfigId) {
      if (!repositories.runtimes.getById(input.aiRuntimeConfigId)) {
        throw new ValidationError('Runtime not found.')
      }
      return {
        aiTeamId: input.aiTeamId,
        aiTeamMemberId: undefined,
        aiRuntimeConfigId: input.aiRuntimeConfigId,
        assignmentMode: 'runtime' as const,
        activeAssigneeType: 'runtime' as WorkSessionAssigneeType
      }
    }

    if (input.aiTeamId ?? project.defaultAiTeamId) {
      const teamId = input.aiTeamId ?? project.defaultAiTeamId!
      const team = repositories.teams.getById(teamId)
      if (!team) {
        throw new ValidationError('Team not found.')
      }
      const firstMember = repositories.teamMembers
        .listByTeam(teamId)
        .find((member) => member.enabled)
      if (!firstMember) {
        throw new ValidationError('Team has no enabled members.')
      }
      return {
        aiTeamId: team.id,
        aiTeamMemberId: firstMember.id,
        aiRuntimeConfigId: firstMember.runtimeConfigId,
        assignmentMode: 'team_member' as const,
        activeAssigneeType: 'team_member' as WorkSessionAssigneeType
      }
    }

    if (project.defaultAiRuntimeConfigId) {
      if (!repositories.runtimes.getById(project.defaultAiRuntimeConfigId)) {
        throw new ValidationError('Default Runtime not found.')
      }
      return {
        aiTeamId: undefined,
        aiTeamMemberId: undefined,
        aiRuntimeConfigId: project.defaultAiRuntimeConfigId,
        assignmentMode: 'runtime' as const,
        activeAssigneeType: 'runtime' as WorkSessionAssigneeType
      }
    }

    return {
      aiTeamId: undefined,
      aiTeamMemberId: undefined,
      aiRuntimeConfigId: undefined,
      assignmentMode: input.assignmentMode ?? ('manual' as const),
      activeAssigneeType: 'user' as WorkSessionAssigneeType
    }
  }

  private refreshProjectMetrics(projectId: string, repositories: Repositories): void {
    const sessions = repositories.workSessions
      .listByProject(projectId)
      .filter((session) => !session.archivedAt)
    const metrics: ProjectMetrics = {
      activeSessionCount: sessions.length,
      runningAgentCount: sessions.filter((session) => session.status === 'running').length,
      waitingInputCount: sessions.filter((session) => session.status === 'waiting_input').length,
      waitingPermissionCount: sessions.filter((session) => session.status === 'waiting_permission')
        .length,
      errorSessionCount: sessions.filter((session) => session.status === 'error').length,
      fileChangeCount: 0
    }

    repositories.projectMetricSnapshots.create({
      projectId,
      ...metrics,
      snapshotAt: now()
    })
  }

  private toSummary(session: WorkSession, repositories: Repositories): WorkSessionSummary {
    const project = repositories.projects.getById(session.projectId)
    return {
      id: session.id,
      projectId: session.projectId,
      projectName: project?.name ?? 'Unknown Project',
      title: session.title,
      goal: optional(session.goal),
      status: session.status as WorkSessionSummary['status'],
      assignmentMode: session.assignmentMode as WorkSessionSummary['assignmentMode'],
      activeAssigneeType: session.activeAssigneeType as WorkSessionSummary['activeAssigneeType'],
      aiTeamId: optional(session.aiTeamId),
      aiTeamMemberId: optional(session.aiTeamMemberId),
      aiRuntimeConfigId: optional(session.aiRuntimeConfigId),
      agentProfileId: optional(session.agentProfileId),
      parentWorkSessionId: optional(session.parentWorkSessionId),
      latestRunId: optional(session.latestRunId),
      summary: optional(session.summary),
      lastMessageAt: optional(session.lastMessageAt),
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
      archivedAt: optional(session.archivedAt),
      messageCount: repositories.messages.listBySession(session.id, 1000, 0).length
    }
  }

  private toDetail(session: WorkSession, repositories: Repositories): WorkSessionDetail {
    return {
      ...this.toSummary(session, repositories),
      externalSessionId: optional(session.externalSessionId),
      resolvedConfigSnapshot: parseJsonObject(session.resolvedConfigSnapshotJson)
    }
  }

  private toMessageSummary(message: Message): MessageSummary {
    return {
      id: message.id,
      workSessionId: message.workSessionId,
      role: message.role as MessageSummary['role'],
      eventType: message.eventType as MessageSummary['eventType'],
      aiTeamMemberId: optional(message.aiTeamMemberId),
      fromAiTeamMemberId: optional(message.fromAiTeamMemberId),
      toAiTeamMemberId: optional(message.toAiTeamMemberId),
      content: message.content,
      inputSummary: parseJsonObject(message.inputSummaryJson),
      inputEnvelopeSnapshot: parseJsonObject(message.inputEnvelopeSnapshotJson),
      displayState: parseJsonObject(message.displayStateJson),
      runtimeSnapshot: parseJsonObject(message.runtimeSnapshotJson),
      tokenUsage: parseJsonObject(message.tokenUsageJson),
      error: parseJsonObject(message.errorJson),
      createdAt: message.createdAt
    }
  }
}
