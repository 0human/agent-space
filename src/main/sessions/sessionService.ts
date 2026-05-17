import type {
  MessageCreateInput,
  MessageListInput,
  MessageSummary,
  ProjectMetrics,
  RuntimeEventSummary,
  RuntimeRunSummary,
  SessionChangedEvent,
  SessionHandoffInput,
  SessionHandoffResult,
  SessionSendMessageInput,
  SessionSendMessageResult,
  SessionStopRunInput,
  SessionSwitchMemberInput,
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
import type { ProcessRunner, RunningProcess } from '../runtime'
import { ValidationError } from '../runtime'
import {
  validateMessageCreateInput,
  validateMessageListInput,
  validateSessionHandoffInput,
  validateSessionSendMessageInput,
  validateSessionSwitchMemberInput,
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
  private readonly changeListeners = new Set<(event: SessionChangedEvent) => void>()

  private readonly activeRuns = new Map<
    string,
    {
      runningProcess: RunningProcess
      workSessionId: string
      runtimeConfigId: string
    }
  >()

  constructor(
    private readonly db: AppDatabase,
    private readonly processRunner: ProcessRunner
  ) {}

  onChanged(listener: (event: SessionChangedEvent) => void): () => void {
    this.changeListeners.add(listener)
    return () => this.changeListeners.delete(listener)
  }

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

      const detail = this.toDetail(session, repositories)
      this.emitChanged({ workSessionId: session.id, reason: 'session_created' })
      return detail
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
    this.emitChanged({ workSessionId: session.id, reason: 'session_updated' })
    return this.toDetail(session, repositories)
  }

  archive(input: WorkSessionArchiveInput): WorkSessionDetail {
    const repositories = createRepositories(this.db)
    const session = repositories.workSessions.archive(input.id)
    if (!session) {
      throw new ValidationError('Work Session not found.')
    }

    this.refreshProjectMetrics(session.projectId, repositories)
    this.emitChanged({ workSessionId: session.id, reason: 'session_archived' })
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

      const summary = this.toMessageSummary(message)
      this.emitChanged({ workSessionId: session.id, reason: 'message_created' })
      return summary
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
      const project = repositories.projects.getById(session.projectId)
      if (!project || project.archivedAt) {
        throw new ValidationError('Project not found.')
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
        runtime.defaultCwdMode === 'custom_path'
          ? (runtime.customCwd ?? undefined)
          : project.localPath
      const runtimeInputEnvelope = this.buildRuntimeInputEnvelope(
        session,
        runtime.provider,
        validated.content
      )
      const stdin = this.stringifyRuntimeInput(runtime.provider, runtimeInputEnvelope)
      const userMessage = repositories.messages.create({
        workSessionId: session.id,
        role: 'user',
        eventType: 'message',
        aiTeamMemberId: session.aiTeamMemberId ?? undefined,
        content: validated.content,
        inputSummaryJson: JSON.stringify({
          source: 'session_send_message',
          provider: runtime.provider,
          runtimeConfigId: runtime.id
        }),
        inputEnvelopeSnapshotJson: JSON.stringify(runtimeInputEnvelope),
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

      return { session, runtime, userMessage, run, command, args, cwd, stdin }
    })

    const runningProcess = this.processRunner.start(setup.command, setup.args, {
      timeoutMs: 15000,
      cwd: setup.cwd,
      stdin: setup.stdin,
      onStdoutChunk: (chunk) => {
        this.appendRuntimeEvent(
          setup.run.id,
          setup.session.id,
          setup.runtime.id,
          'stdout_chunk',
          chunk,
          'stdout'
        )
      },
      onStderrChunk: (chunk) => {
        this.appendRuntimeEvent(
          setup.run.id,
          setup.session.id,
          setup.runtime.id,
          'stderr_chunk',
          chunk,
          'stderr'
        )
      }
    })
    this.activeRuns.set(setup.run.id, {
      runningProcess,
      workSessionId: setup.session.id,
      runtimeConfigId: setup.runtime.id
    })
    const startedRun = this.markRunStarted(setup.run.id, setup.session.id, setup.runtime.id)
    this.emitChanged({
      workSessionId: setup.session.id,
      runId: setup.run.id,
      reason: 'run_started'
    })

    void this.finalizeRun(setup, runningProcess)

    return {
      userMessage: this.toMessageSummary(setup.userMessage),
      run: this.toRuntimeRunSummary(startedRun),
      events: this.listEvents(setup.run.id)
    }
  }

  stopRun(input: SessionStopRunInput): RuntimeRunSummary {
    const repositories = createRepositories(this.db)
    const session = repositories.workSessions.getById(input.workSessionId)
    if (!session) {
      throw new ValidationError('Work Session not found.')
    }
    if (!session.latestRunId) {
      throw new ValidationError('No active Runtime Run found for this Work Session.')
    }

    const activeRun = this.activeRuns.get(session.latestRunId)
    if (!activeRun) {
      throw new ValidationError('Runtime Run is not currently active.')
    }

    activeRun.runningProcess.stop()
    return this.toRuntimeRunSummary(repositories.runtimeRuns.getById(session.latestRunId)!)
  }

  switchMember(input: SessionSwitchMemberInput): WorkSessionDetail {
    const validated = validateSessionSwitchMemberInput(input)

    return this.db.transaction((tx) => {
      const repositories = createRepositories(tx)
      const session = repositories.workSessions.getById(validated.workSessionId)
      if (!session || session.archivedAt) {
        throw new ValidationError('Work Session not found.')
      }
      const targetMember = repositories.teamMembers.getById(validated.toAiTeamMemberId)
      if (!targetMember || targetMember.enabled !== 1) {
        throw new ValidationError('Target Team member not found.')
      }
      if (session.aiTeamId && targetMember.teamId !== session.aiTeamId) {
        throw new ValidationError('Target Team member does not belong to this Work Session Team.')
      }

      const createdAt = now()
      const content =
        validated.content ??
        `Switched active member${session.aiTeamMemberId ? '' : ' from manual/runtime mode'}.`
      repositories.messages.create({
        workSessionId: session.id,
        role: 'system',
        eventType: 'member_switch',
        aiTeamMemberId: targetMember.id,
        fromAiTeamMemberId: session.aiTeamMemberId ?? undefined,
        toAiTeamMemberId: targetMember.id,
        content,
        displayStateJson: JSON.stringify({
          fromAiTeamMemberId: session.aiTeamMemberId,
          toAiTeamMemberId: targetMember.id
        }),
        createdAt
      })

      const updated = repositories.workSessions.update(session.id, {
        aiTeamId: targetMember.teamId,
        aiTeamMemberId: targetMember.id,
        aiRuntimeConfigId: targetMember.runtimeConfigId,
        agentProfileId: targetMember.agentProfileId ?? session.agentProfileId ?? undefined,
        assignmentMode: 'team_member',
        activeAssigneeType: 'team_member',
        lastMessageAt: createdAt
      })
      repositories.projects.update(session.projectId, { lastActiveAt: createdAt })
      this.refreshProjectMetrics(session.projectId, repositories)

      const detail = this.toDetail(updated, repositories)
      this.emitChanged({ workSessionId: session.id, reason: 'message_created' })
      return detail
    })
  }

  handoff(input: SessionHandoffInput): SessionHandoffResult {
    const validated = validateSessionHandoffInput(input)

    return this.db.transaction((tx) => {
      const repositories = createRepositories(tx)
      const sourceSession = repositories.workSessions.getById(validated.workSessionId)
      if (!sourceSession || sourceSession.archivedAt) {
        throw new ValidationError('Work Session not found.')
      }
      const project = repositories.projects.getById(sourceSession.projectId)
      if (!project || project.archivedAt) {
        throw new ValidationError('Project not found.')
      }
      const targetMember = repositories.teamMembers.getById(validated.toAiTeamMemberId)
      if (!targetMember || targetMember.enabled !== 1) {
        throw new ValidationError('Target Team member not found.')
      }
      if (sourceSession.aiTeamId && targetMember.teamId !== sourceSession.aiTeamId) {
        throw new ValidationError('Target Team member does not belong to this Work Session Team.')
      }

      const createdAt = now()
      const targetSession =
        validated.mode === 'new_linked_session'
          ? repositories.workSessions.create({
              projectId: sourceSession.projectId,
              title: validated.newSessionTitle ?? `Handoff from ${sourceSession.title}`,
              goal: sourceSession.goal,
              status: 'idle',
              aiTeamId: targetMember.teamId,
              aiTeamMemberId: targetMember.id,
              aiRuntimeConfigId: targetMember.runtimeConfigId,
              agentProfileId: targetMember.agentProfileId ?? sourceSession.agentProfileId,
              assignmentMode: 'team_member',
              activeAssigneeType: 'team_member',
              parentWorkSessionId: sourceSession.id,
              resolvedConfigSnapshotJson: JSON.stringify({
                projectId: project.id,
                projectMode: project.mode,
                handoffFromWorkSessionId: sourceSession.id,
                assignmentMode: 'team_member',
                activeAssigneeType: 'team_member'
              }),
              lastMessageAt: createdAt
            })
          : repositories.workSessions.update(sourceSession.id, {
              aiTeamId: targetMember.teamId,
              aiTeamMemberId: targetMember.id,
              aiRuntimeConfigId: targetMember.runtimeConfigId,
              agentProfileId:
                targetMember.agentProfileId ?? sourceSession.agentProfileId ?? undefined,
              assignmentMode: 'team_member',
              activeAssigneeType: 'team_member',
              lastMessageAt: createdAt
            })

      const handoffMessage = repositories.messages.create({
        workSessionId: targetSession.id,
        role: 'system',
        eventType: 'handoff',
        aiTeamMemberId: targetMember.id,
        fromAiTeamMemberId: sourceSession.aiTeamMemberId ?? undefined,
        toAiTeamMemberId: targetMember.id,
        content: validated.content,
        displayStateJson: JSON.stringify({
          mode: validated.mode,
          sourceWorkSessionId: sourceSession.id,
          targetWorkSessionId: targetSession.id
        }),
        createdAt
      })

      repositories.projects.update(project.id, { lastActiveAt: createdAt })
      this.refreshProjectMetrics(project.id, repositories)

      const sourceDetail = this.toDetail(
        repositories.workSessions.getById(sourceSession.id)!,
        repositories
      )
      const targetDetail = this.toDetail(targetSession, repositories)
      this.emitChanged({ workSessionId: sourceSession.id, reason: 'message_created' })
      if (targetSession.id !== sourceSession.id) {
        this.emitChanged({ workSessionId: targetSession.id, reason: 'session_created' })
      }
      return {
        sourceSession: sourceDetail,
        targetSession: targetDetail,
        handoffMessage: this.toMessageSummary(handoffMessage)
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

  private buildRuntimeInputEnvelope(
    session: WorkSession,
    provider: string,
    content: string
  ): Record<string, unknown> {
    return {
      version: 1,
      provider,
      workSessionId: session.id,
      title: session.title,
      goal: session.goal ?? undefined,
      prompt: content
    }
  }

  private stringifyRuntimeInput(
    provider: string,
    runtimeInputEnvelope: Record<string, unknown>
  ): string | undefined {
    if (provider !== 'custom_cli') {
      return undefined
    }

    return JSON.stringify(runtimeInputEnvelope, null, 2)
  }

  private async finalizeRun(
    setup: {
      session: WorkSession
      runtime: { id: string; provider: string }
      userMessage: Message
      run: RuntimeRun
      command: string
      args: string[]
      cwd?: string
      stdin?: string
    },
    runningProcess: RunningProcess
  ): Promise<void> {
    const processResult = await runningProcess.result
    this.activeRuns.delete(setup.run.id)
    const finishTime = now()

    this.db.transaction((tx) => {
      const repositories = createRepositories(tx)
      const existingEvents = repositories.runtimeEvents.listByRun(setup.run.id)
      let sequenceNo = existingEvents.length + 1

      const isSuccess = processResult.exitCode === 0 && !processResult.error
      const wasStopped = processResult.error?.code === 'STOPPED'
      const errorSummary = processResult.error
        ? processResult.error.message
        : isSuccess
          ? undefined
          : processResult.stderr.trim() ||
            `Process exited with code ${processResult.exitCode ?? 'unknown'}.`

      if (
        processResult.stdout.trim() &&
        !existingEvents.some((event) => event.displayCategory === 'stdout')
      ) {
        repositories.runtimeEvents.create({
          runId: setup.run.id,
          workSessionId: setup.session.id,
          runtimeConfigId: setup.runtime.id,
          type: 'stdout',
          content: processResult.stdout.trim(),
          displayCategory: 'stdout',
          sequenceNo: sequenceNo++,
          createdAt: finishTime
        })
      }

      if (
        processResult.stderr.trim() &&
        !existingEvents.some((event) => event.displayCategory === 'stderr')
      ) {
        repositories.runtimeEvents.create({
          runId: setup.run.id,
          workSessionId: setup.session.id,
          runtimeConfigId: setup.runtime.id,
          type: 'stderr',
          content: processResult.stderr.trim(),
          displayCategory: 'stderr',
          sequenceNo: sequenceNo++,
          createdAt: finishTime
        })
      }

      repositories.runtimeEvents.create({
        runId: setup.run.id,
        workSessionId: setup.session.id,
        runtimeConfigId: setup.runtime.id,
        type: isSuccess ? 'run_completed' : wasStopped ? 'run_stopped' : 'run_failed',
        content: isSuccess ? 'Run completed.' : errorSummary,
        displayCategory: 'status',
        sequenceNo,
        createdAt: finishTime
      })

      const updatedRun = repositories.runtimeRuns.update(setup.run.id, {
        status: isSuccess ? 'completed' : wasStopped ? 'stopped' : 'failed',
        endedAt: finishTime,
        exitCode: processResult.exitCode ?? undefined,
        errorSummary
      })

      if (processResult.stdout.trim()) {
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
      } else if (!isSuccess) {
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
      }

      repositories.workSessions.update(setup.session.id, {
        status: isSuccess ? 'completed' : wasStopped ? 'idle' : 'error',
        lastMessageAt: finishTime
      })
      repositories.projects.update(setup.session.projectId, { lastActiveAt: finishTime })
      this.refreshProjectMetrics(setup.session.projectId, repositories)
    })
    this.emitChanged({
      workSessionId: setup.session.id,
      runId: setup.run.id,
      reason: 'run_finished'
    })
  }

  private appendRuntimeEvent(
    runId: string,
    workSessionId: string,
    runtimeConfigId: string,
    type: string,
    rawContent: string,
    displayCategory: RuntimeEventSummary['displayCategory'],
    createdAt = now()
  ): void {
    const content = rawContent.trim()
    if (!content) {
      return
    }

    this.db.transaction((tx) => {
      const repositories = createRepositories(tx)
      const sequenceNo = repositories.runtimeEvents.listByRun(runId).length + 1
      repositories.runtimeEvents.create({
        runId,
        workSessionId,
        runtimeConfigId,
        type,
        content,
        displayCategory,
        sequenceNo,
        createdAt
      })
    })
    this.emitChanged({ workSessionId, runId, reason: 'run_event_created' })
  }

  private markRunStarted(
    runId: string,
    workSessionId: string,
    runtimeConfigId: string
  ): RuntimeRun {
    return this.db.transaction((tx) => {
      const repositories = createRepositories(tx)
      const run = repositories.runtimeRuns.update(runId, { status: 'running' })
      const sequenceNo = repositories.runtimeEvents.listByRun(runId).length + 1
      repositories.runtimeEvents.create({
        runId,
        workSessionId,
        runtimeConfigId,
        type: 'run_started',
        content: `Started ${run.command ?? 'runtime process'}`,
        displayCategory: 'status',
        sequenceNo,
        createdAt: now()
      })
      return run
    })
  }

  private emitChanged(event: SessionChangedEvent): void {
    for (const listener of this.changeListeners) {
      listener(event)
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
