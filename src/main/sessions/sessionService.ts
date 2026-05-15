import type {
  MessageCreateInput,
  MessageListInput,
  MessageSummary,
  ProjectMetrics,
  RuntimeEventSummary,
  RuntimeRunSummary,
  SessionSendMessageInput,
  SessionSendMessageResult,
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
import type { Message, RuntimeEvent, RuntimeRun, WorkSession } from '../db/schema'
import type { ProcessRunner } from '../runtime'
import { ValidationError } from '../runtime'
import {
  validateMessageCreateInput,
  validateMessageListInput,
  validateSessionSendMessageInput,
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
  constructor(
    private readonly db: AppDatabase,
    private readonly processRunner: ProcessRunner
  ) {}

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

  async sendMessage(input: SessionSendMessageInput): Promise<SessionSendMessageResult> {
    const validated = validateSessionSendMessageInput(input)
    const startTime = now()
    const setup = this.db.transaction((tx) => {
      const repositories = createRepositories(tx)
      const session = repositories.workSessions.getById(validated.workSessionId)
      if (!session || session.archivedAt) {
        throw new ValidationError('Work Session not found.')
      }

      const runtime = session.aiRuntimeConfigId
        ? repositories.runtimes.getById(session.aiRuntimeConfigId)
        : undefined
      if (!runtime) {
        throw new ValidationError('Runtime not configured for this Work Session.')
      }

      const command = runtime.executablePath?.trim()
      if (!command) {
        throw new ValidationError('Runtime executablePath is required before sending a message.')
      }

      const args = this.parseArgs(runtime.defaultArgsJson)
      const cwd =
        runtime.defaultCwdMode === 'custom_path' ? (runtime.customCwd ?? undefined) : undefined
      const userMessage = repositories.messages.create({
        workSessionId: session.id,
        role: 'user',
        eventType: 'message',
        aiTeamMemberId: session.aiTeamMemberId ?? undefined,
        content: validated.content,
        inputSummaryJson: JSON.stringify({ source: 'session_send_message' }),
        createdAt: startTime
      })
      const run = repositories.runtimeRuns.create({
        workSessionId: session.id,
        runtimeConfigId: runtime.id,
        provider: runtime.provider,
        status: 'starting',
        command,
        argsJson: JSON.stringify(args),
        cwd,
        envSummaryJson: JSON.stringify({}),
        startedAt: startTime
      })
      repositories.workSessions.update(session.id, {
        status: 'running',
        latestRunId: run.id,
        lastMessageAt: startTime
      })
      repositories.projects.update(session.projectId, { lastActiveAt: startTime })
      this.refreshProjectMetrics(session.projectId, repositories)

      return { session, runtime, userMessage, run, command, args, cwd }
    })

    const processResult = await this.processRunner.run(setup.command, setup.args, {
      timeoutMs: 15000
    })
    const finishTime = now()

    return this.db.transaction((tx) => {
      const repositories = createRepositories(tx)
      const events: RuntimeEventSummary[] = []
      let sequenceNo = 1

      const statusEvent = repositories.runtimeEvents.create({
        runId: setup.run.id,
        workSessionId: setup.session.id,
        runtimeConfigId: setup.runtime.id,
        type: 'run_started',
        content: `Started ${setup.command}`,
        displayCategory: 'status',
        sequenceNo: sequenceNo++,
        createdAt: setup.run.startedAt
      })
      events.push(this.toRuntimeEventSummary(statusEvent))

      if (processResult.stdout.trim()) {
        const stdoutEvent = repositories.runtimeEvents.create({
          runId: setup.run.id,
          workSessionId: setup.session.id,
          runtimeConfigId: setup.runtime.id,
          type: 'stdout',
          content: processResult.stdout.trim(),
          displayCategory: 'stdout',
          sequenceNo: sequenceNo++,
          createdAt: finishTime
        })
        events.push(this.toRuntimeEventSummary(stdoutEvent))
      }

      if (processResult.stderr.trim()) {
        const stderrEvent = repositories.runtimeEvents.create({
          runId: setup.run.id,
          workSessionId: setup.session.id,
          runtimeConfigId: setup.runtime.id,
          type: 'stderr',
          content: processResult.stderr.trim(),
          displayCategory: 'stderr',
          sequenceNo: sequenceNo++,
          createdAt: finishTime
        })
        events.push(this.toRuntimeEventSummary(stderrEvent))
      }

      const isSuccess = processResult.exitCode === 0 && !processResult.error
      const errorSummary = processResult.error
        ? processResult.error.message
        : isSuccess
          ? undefined
          : processResult.stderr.trim() ||
            `Process exited with code ${processResult.exitCode ?? 'unknown'}.`

      const completedEvent = repositories.runtimeEvents.create({
        runId: setup.run.id,
        workSessionId: setup.session.id,
        runtimeConfigId: setup.runtime.id,
        type: isSuccess ? 'run_completed' : 'run_failed',
        content: isSuccess ? 'Run completed.' : errorSummary,
        displayCategory: 'status',
        sequenceNo,
        createdAt: finishTime
      })
      events.push(this.toRuntimeEventSummary(completedEvent))

      const updatedRun = repositories.runtimeRuns.update(setup.run.id, {
        status: isSuccess ? 'completed' : 'failed',
        endedAt: finishTime,
        exitCode: processResult.exitCode ?? undefined,
        errorSummary
      })

      let assistantMessage: MessageSummary | undefined
      if (processResult.stdout.trim()) {
        assistantMessage = this.toMessageSummary(
          repositories.messages.create({
            workSessionId: setup.session.id,
            role: 'assistant',
            eventType: 'message',
            aiTeamMemberId: setup.session.aiTeamMemberId ?? undefined,
            content: processResult.stdout.trim(),
            runtimeSnapshotJson: JSON.stringify({
              runId: updatedRun.id,
              provider: updatedRun.provider,
              status: updatedRun.status
            }),
            createdAt: finishTime
          })
        )
      } else if (!isSuccess) {
        assistantMessage = this.toMessageSummary(
          repositories.messages.create({
            workSessionId: setup.session.id,
            role: 'assistant',
            eventType: 'message',
            aiTeamMemberId: setup.session.aiTeamMemberId ?? undefined,
            content: errorSummary ?? 'Run failed.',
            errorJson: JSON.stringify({
              runId: updatedRun.id,
              status: updatedRun.status
            }),
            createdAt: finishTime
          })
        )
      }

      repositories.workSessions.update(setup.session.id, {
        status: isSuccess ? 'completed' : 'error',
        lastMessageAt: finishTime
      })
      repositories.projects.update(setup.session.projectId, { lastActiveAt: finishTime })
      this.refreshProjectMetrics(setup.session.projectId, repositories)

      return {
        userMessage: this.toMessageSummary(
          repositories.messages
            .listBySession(setup.session.id, 1, 0)
            .find((message) => message.id === setup.userMessage.id) ?? setup.userMessage
        ),
        assistantMessage,
        run: this.toRuntimeRunSummary(updatedRun),
        events
      }
    })
  }

  listRuns(workSessionId: string): RuntimeRunSummary[] {
    const repositories = createRepositories(this.db)
    if (!repositories.workSessions.getById(workSessionId)) {
      throw new ValidationError('Work Session not found.')
    }

    return repositories.runtimeRuns
      .listBySession(workSessionId)
      .map((run) => this.toRuntimeRunSummary(run))
  }

  listEvents(runId: string): RuntimeEventSummary[] {
    const repositories = createRepositories(this.db)
    return repositories.runtimeEvents
      .listByRun(runId)
      .map((event) => this.toRuntimeEventSummary(event))
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

  private parseArgs(value: string | null): string[] {
    if (!value) {
      return []
    }
    try {
      const parsed = JSON.parse(value) as unknown
      return Array.isArray(parsed) && parsed.every((item) => typeof item === 'string') ? parsed : []
    } catch {
      return []
    }
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

  private toRuntimeRunSummary(run: RuntimeRun): RuntimeRunSummary {
    return {
      id: run.id,
      workSessionId: run.workSessionId,
      runtimeConfigId: run.runtimeConfigId,
      provider: run.provider as RuntimeRunSummary['provider'],
      status: run.status as RuntimeRunSummary['status'],
      command: optional(run.command),
      args: this.parseArgs(run.argsJson),
      cwd: optional(run.cwd),
      envSummary: parseJsonObject(run.envSummaryJson),
      startedAt: run.startedAt,
      endedAt: optional(run.endedAt),
      exitCode: run.exitCode ?? undefined,
      exitSignal: optional(run.exitSignal),
      errorSummary: optional(run.errorSummary)
    }
  }

  private toRuntimeEventSummary(event: RuntimeEvent): RuntimeEventSummary {
    return {
      id: event.id,
      runId: event.runId,
      workSessionId: event.workSessionId,
      runtimeConfigId: event.runtimeConfigId,
      type: event.type,
      content: optional(event.content),
      metadata: parseJsonObject(event.metadataJson),
      displayCategory: event.displayCategory as RuntimeEventSummary['displayCategory'],
      sequenceNo: event.sequenceNo,
      createdAt: event.createdAt
    }
  }
}
