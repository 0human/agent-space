import { randomUUID } from 'node:crypto'
import { isPathAllowed } from './permission-policy'

import type {
  AgentRuntimeAdapter,
  RuntimeExecutionContext,
  WorkflowPreflightInput,
  WorkflowPreflightResult,
  WorkflowRun,
  StartWorkflowRunInput,
  PullRequestState,
  RuntimeEvent,
  RuntimeArtifact
} from '../shared/workflow-run'
import { isWorkflowRunInProgress } from '../shared/workflow-run'
import type { GitMergeRequest, GitPullRequestRequest, GitPullRequestResult } from './git-delivery'
import { createSqliteRunStore } from './workflow-store'
import { zhCNMain } from '../shared/i18n/zh-CN'
import { DEFAULT_PROJECT_PERMISSIONS, isProjectDeleted, RELEASE_OPERATIONS, RELEASE_PLATFORMS, type PermissionPolicy, type ProjectDeliveryPolicy } from '../shared/project'
import type { ReleaseOperation, ReleasePlatform, ProjectReleaseStep } from '../shared/project'
import { createDefaultReleaseManager, resolveProjectReleaseStep, type ReleaseManager } from './release-manager'

interface GitDeliveryManager {
  commitAfterReview(request: { workspacePath: string; runId: string; baseCommit: string | null; ticket: string | null; idempotencyKey?: string }): Promise<{ commit: string; artifact: RuntimeArtifact }>
  deliverPullRequest?: (request: GitPullRequestRequest) => Promise<GitPullRequestResult>
  mergePullRequest?: (request: GitMergeRequest) => Promise<GitPullRequestResult>
  refreshPullRequest?: (workspacePath: string, remote: string, number: number, policy?: ProjectDeliveryPolicy, permissionPolicy?: PermissionPolicy) => Promise<PullRequestState>
  preflightPullRequest?: (workspacePath: string, remote: string) => Promise<void>
}

function ticketReference(idea: string, artifacts: WorkflowRun['artifacts']): string | null {
  const direct = idea.match(/(?:#|\/issues\/)(\d+)/i)?.[1]
  if (direct) return direct
  return artifacts.map((artifact) => artifact.location ?? '').map((location) => location.match(/\/issues\/(\d+)/i)?.[1]).find(Boolean) ?? null
}

function isPullRequestStep(step: WorkflowRun['definition']['phases'][number]['steps'][number] | undefined): boolean {
  return step?.kind === 'tool' && step.adapter === 'github.pull-request'
}

function isReleaseStep(step: WorkflowRun['definition']['phases'][number]['steps'][number] | undefined): step is WorkflowRun['definition']['phases'][number]['steps'][number] & { operation: ReleaseOperation } {
  return step?.kind === 'tool' && step.adapter === 'project.release' && Boolean(step.operation)
}

function supportedPlatform(platform: NodeJS.Platform): ReleasePlatform | null {
  return RELEASE_PLATFORMS.includes(platform as ReleasePlatform) ? platform as ReleasePlatform : null
}

function configuredReleaseStep(project: WorkflowPreflightInput['project'], platform: ReleasePlatform, operation: ReleaseOperation, workflowStep?: { platforms?: Partial<Record<ReleasePlatform, { command: string; args?: string[] }>> }): ProjectReleaseStep | null {
  const configured = resolveProjectReleaseStep(project, platform, operation)
  if (configured) return configured
  const platformCommand = workflowStep?.platforms?.[platform]
  return platformCommand ? { kind: 'tool', command: platformCommand.command, args: platformCommand.args } : null
}

function releaseConfigErrors(project: WorkflowPreflightInput['project']): string[] {
  const release = project.release as unknown
  if (release === undefined) return []
  if (!release || typeof release !== 'object' || Array.isArray(release)) return ['Release Preflight 失败：Project release 配置必须是对象。']
  const value = release as Record<string, unknown>
  const errors: string[] = []
  if (typeof value.enabled !== 'boolean') errors.push('Release Preflight 失败：Project release.enabled 必须是 boolean。')
  if (!value.platforms || typeof value.platforms !== 'object' || Array.isArray(value.platforms)) return [...errors, 'Release Preflight 失败：Project release.platforms 必须是对象。']
  for (const [platform, operations] of Object.entries(value.platforms as Record<string, unknown>)) {
    if (!RELEASE_PLATFORMS.includes(platform as ReleasePlatform)) {
      errors.push(`Release Preflight 失败：不支持的平台 ${platform}。`)
      continue
    }
    if (!operations || typeof operations !== 'object' || Array.isArray(operations)) {
      errors.push(`Release Preflight 失败：${platform} 平台配置必须是对象。`)
      continue
    }
    for (const [operation, config] of Object.entries(operations as Record<string, unknown>)) {
      if (!RELEASE_OPERATIONS.includes(operation as ReleaseOperation) || !config || typeof config !== 'object' || Array.isArray(config)) {
        errors.push(`Release Preflight 失败：${platform}/${operation} 配置无效。`)
        continue
      }
      const step = config as Record<string, unknown>
      if (!['tool', 'human'].includes(String(step.kind))) errors.push(`Release Preflight 失败：${platform}/${operation} kind 无效。`)
      if (step.args !== undefined && (!Array.isArray(step.args) || step.args.some((arg) => typeof arg !== 'string'))) errors.push(`Release Preflight 失败：${platform}/${operation} args 无效。`)
      if (step.requiredPermissions !== undefined && (!Array.isArray(step.requiredPermissions) || step.requiredPermissions.some((permission) => typeof permission !== 'string'))) errors.push(`Release Preflight 失败：${platform}/${operation} requiredPermissions 无效。`)
    }
  }
  return errors
}

function deliveryGateError(input: WorkflowPreflightInput): string | null {
  if (!input.project.remote) return null
  const missing = input.workflow.definition.phases
    .flatMap((phase) => phase.steps)
    .some((step) => isPullRequestStep(step) && !step.approvalGate)
  return missing ? 'GitHub delivery Step 必须声明 Merge Gate。' : null
}

function workspaceAllowed(project: WorkflowPreflightInput['project']): boolean {
  return isPathAllowed(project.workspacePath, project.permissionPolicy?.allowedPaths)
}

function workspacePreflightSummary(project: WorkflowPreflightInput['project']): string {
  const branch = project.currentBranch ?? (project.isGreenfield ? '未初始化 Git' : 'Detached HEAD')
  const head = project.head ?? '暂无 commit'
  if (!project.dirty) return `Workspace 基线：branch ${branch}；HEAD ${head}；Clean Workspace。`

  const summary = project.dirtySummary
  const files = summary.files.length > 0 ? `；未提交文件：${summary.files.join(', ')}` : ''
  return `Workspace 基线：branch ${branch}；HEAD ${head}；Dirty Workspace（staged ${summary.staged}，unstaged ${summary.unstaged}，untracked ${summary.untracked}）${files}。`
}

function verifiedCommit(run: Pick<WorkflowRun, 'artifacts'> | null): string | null {
  return run?.artifacts.find((artifact) => artifact.type === 'commit' && artifact.versionHash)?.versionHash ?? null
}

function transientNetworkError(value: string): boolean {
  return /(network|offline|timed? ?out|timeout|econnreset|econnrefused|enetunreach|eai_again|could not resolve host|unable to access|connection refused|connection reset|断网|网络不可用|连接失败)/i.test(value)
}

function transientNetworkCode(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && 'code' in error && typeof error.code === 'string' && /^(?:EAI_AGAIN|ECONNRESET|ECONNREFUSED|ETIMEDOUT|ENETUNREACH|EHOSTUNREACH|ENETDOWN|ERR_NETWORK)$/i.test(error.code))
}

function normalizeExternalFailure(events: RuntimeEvent[]): RuntimeEvent[] {
  const error = events.find((event): event is Extract<RuntimeEvent, { type: 'error' }> => event.type === 'error')
  if (!error || !transientNetworkError(error.error)) return events
  return [
    ...events.filter((event) => event.type !== 'error'),
    { type: 'status_changed', status: 'blocked', reason: `网络暂时不可用：${error.error}`, source: 'network-retry' }
  ]
}

interface WorkflowEngineDependencies {
  databasePath: string
  runtime: AgentRuntimeAdapter
  runWorkspaceManager?: import('./run-workspace').RunWorkspaceManager
  gitDeliveryManager?: GitDeliveryManager
  releaseManager?: ReleaseManager
  platform?: NodeJS.Platform
  now?: () => string
  createId?: () => string
}

export interface WorkflowEngine {
  preflight(input: WorkflowPreflightInput): Promise<WorkflowPreflightResult>
  startRun(input: StartWorkflowRunInput): Promise<WorkflowRun>
  getRun(runId: string): Promise<WorkflowRun | null>
  listRuns(projectId: string): Promise<WorkflowRun[]>
  hasActiveRuns(projectId: string): Promise<boolean>
  pauseRun(runId: string): Promise<WorkflowRun>
  resumeRun(runId: string, guidance?: string): Promise<WorkflowRun>
  retryStep(runId: string, guidance?: string): Promise<WorkflowRun>
  cancelRun(runId: string): Promise<WorkflowRun>
  answerQuestion(runId: string, answer: string): Promise<WorkflowRun>
  approve(runId: string): Promise<WorkflowRun>
  reject(runId: string): Promise<WorkflowRun>
  recover(): Promise<void>
  waitForIdle(runId: string): Promise<WorkflowRun>
  close(): Promise<void>
}

export function createWorkflowEngine(dependencies: WorkflowEngineDependencies): WorkflowEngine {
  const store = createSqliteRunStore(dependencies)
  const releaseManager = dependencies.releaseManager ?? createDefaultReleaseManager()
  const platform = supportedPlatform(dependencies.platform ?? process.platform)
  const active = new Map<string, Promise<void>>()
  let closed = false

  async function execute(runId: string): Promise<void> {
    while (true) {
      const run = await store.getRun(runId)
      if (!run || run.status !== 'running' || !run.snapshot.currentStepExecutionId) return
      const execution = run.stepExecutions.find((candidate) => candidate.id === run.snapshot.currentStepExecutionId)
      if (!execution) return
      const step = run.workflow.phases[run.snapshot.phaseIndex]?.steps[run.snapshot.stepIndex]
      const alreadyApproved = run.events.some((event) => event.type === 'approval_approved' && event.data.executionId === execution.id)
      const pullRequestStep = isPullRequestStep(step)
      const releaseStep = isReleaseStep(step)
      if (step?.approvalGate && !alreadyApproved && !pullRequestStep) {
        await store.requestApproval(runId, execution.id, step.approvalGate)
        return
      }
      const currentPhase = run.workflow.phases[run.snapshot.phaseIndex]?.id
      const phaseContext = run.phaseContexts.find((candidate) => candidate.phaseId === currentPhase)
      const contextContent = run.phaseContexts.filter((candidate) => candidate.id !== phaseContext?.id).map((candidate) => `[${candidate.phaseId}]\n${candidate.content}`).join('\n')
      const context: RuntimeExecutionContext = {
        runId,
        project: run.project,
        workspace: { path: run.workspacePath },
        idea: run.idea,
        workflow: run.workflow,
        phaseIndex: run.snapshot.phaseIndex,
        stepIndex: run.snapshot.stepIndex,
        execution,
        implementationTicket: execution.implementationTicketId
          ? run.implementationTickets?.find((ticket) => ticket.id === execution.implementationTicketId) ?? null
          : null,
        skill: execution.skill,
        phaseContext: phaseContext
          ? { ...phaseContext, content: [contextContent, phaseContext.content].filter(Boolean).join('\n') }
          : contextContent
            ? { id: `${run.id}:phase-context`, runId: run.id, phaseId: currentPhase ?? 'unknown', content: contextContent, updatedAt: run.updatedAt }
            : null,
        inputArtifacts: run.artifacts,
        decisionRecords: run.decisionRecords,
        permissionPolicy: run.project.permissionPolicy ?? { grantedPermissions: [...DEFAULT_PROJECT_PERMISSIONS] },
        events: run.events,
        persistRuntimeLocator: async (runtimeLocator) => {
          await store.recordRuntimeLocator(runId, execution.id, runtimeLocator)
        }
      }
      let events: RuntimeEvent[]
      let delivery: GitPullRequestResult | null = null
      try {
        if (pullRequestStep) {
          if (!dependencies.gitDeliveryManager?.deliverPullRequest) throw new Error('GitHub delivery adapter 不可用。')
          const request: GitPullRequestRequest = {
            workspacePath: run.workspacePath,
            runId: run.id,
            commit: run.artifacts.find((artifact) => artifact.type === 'commit' && artifact.versionHash)?.versionHash ?? '',
            branch: run.branch ?? '',
            defaultBranch: run.project.defaultBranch ?? '',
            remote: run.remote ?? '',
            ticket: ticketReference(run.idea, run.artifacts),
            title: `Agent Space: ${run.idea.slice(0, 72)}`,
            permissionPolicy: run.project.permissionPolicy ?? { grantedPermissions: [] },
            deliveryPolicy: run.project.deliveryPolicy,
            pullRequestNumber: run.pullRequest?.number ?? null,
            idempotencyKey: `github.pull-request:${run.id}`
          }
          delivery = alreadyApproved
            ? await dependencies.gitDeliveryManager.mergePullRequest?.({
              workspacePath: request.workspacePath,
              runId: request.runId,
              pullRequest: {
                number: run.pullRequest?.number ?? 0,
                headBranch: run.pullRequest?.headBranch ?? request.branch,
                baseBranch: run.pullRequest?.baseBranch ?? request.defaultBranch,
                headCommit: request.commit,
                gate: run.pullRequest?.gate ?? { checksSatisfied: false, reviewsSatisfied: false, mergeabilitySatisfied: false, canMerge: false, reason: 'Pull Request 状态不可用。' }
              },
              remote: request.remote,
              defaultBranch: request.defaultBranch,
              permissionPolicy: request.permissionPolicy,
              deliveryPolicy: request.deliveryPolicy,
              gateApproved: true
            }) ?? null
            : await dependencies.gitDeliveryManager.deliverPullRequest(request)
          if (!delivery) throw new Error('GitHub merge adapter 不可用。')
          events = [
            { type: 'artifact_produced', artifact: delivery.artifact, source: 'github.pull-request' },
            { type: 'status_changed', status: 'completed', source: 'github.pull-request' }
          ]
        } else if (releaseStep && platform) {
          const configured = configuredReleaseStep(run.project, platform, step.operation, step)
          if (!configured) throw new Error(`Release ${step.operation} 配置不可用：当前平台没有适配。`)
          events = await releaseManager.execute({ project: run.project, workspacePath: run.workspacePath, platform, operation: step.operation, step: configured, input: execution.input ?? {}, permissionPolicy: run.project.permissionPolicy ?? { grantedPermissions: [...DEFAULT_PROJECT_PERMISSIONS] } })
        } else {
          events = await dependencies.runtime.execute(context)
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        events = transientNetworkError(message) || transientNetworkCode(error)
          ? [{ type: 'status_changed', status: 'blocked', reason: `网络暂时不可用：${message}`, source: 'network-retry' }]
          : [{ type: 'error' as const, error: message }]
      }
      events = normalizeExternalFailure(events)
      if (closed) return
      let updated = await store.recordRuntimeResult(runId, execution.id, events)
      if (delivery) updated = await store.setPullRequest(runId, delivery.pullRequest)
      const reviewStep = step?.id === 'review' || step?.skill?.name === 'code-review' || /review/i.test(step?.name ?? '')
      if (reviewStep && events.some((event) => event.type === 'status_changed' && event.status === 'completed') && dependencies.gitDeliveryManager) {
        try {
          const delivery = await dependencies.gitDeliveryManager.commitAfterReview({
            workspacePath: updated.workspacePath,
            runId: updated.id,
            baseCommit: updated.baseCommit,
            ticket: ticketReference(updated.idea, updated.artifacts),
            idempotencyKey: `git.commit:${updated.id}`
          })
          await store.registerArtifact(updated.id, execution.id, delivery.artifact)
        } catch (error) {
          await store.markDeliveryFailed(updated.id, execution.id, error instanceof Error ? error.message : String(error))
          return
        }
      }
      if (updated.status !== 'running' || updated.snapshot.currentStepExecutionId === execution.id) return
    }
  }

  async function refreshPullRequest(run: Awaited<ReturnType<typeof store.getRun>>, strict = false): Promise<Awaited<ReturnType<typeof store.getRun>>> {
    if (!run?.pullRequest || !run.remote || !dependencies.gitDeliveryManager?.refreshPullRequest) {
      if (strict) throw new Error('Merge Gate 状态不可验证：缺少远端 Pull Request 刷新能力。')
      return run
    }
    try {
      const state = await dependencies.gitDeliveryManager.refreshPullRequest(run.workspacePath, run.remote, run.pullRequest.number, run.project.deliveryPolicy, run.project.permissionPolicy ?? { grantedPermissions: [...DEFAULT_PROJECT_PERMISSIONS] })
      const commit = verifiedCommit(run)
      if (strict && commit && state.headCommit !== commit) throw new Error('远端 Pull Request head commit 与当前 Run 已验证 commit 不一致。')
      return await store.setPullRequest(run.id, state)
    } catch (error) {
      if (strict) throw new Error(`Merge Gate 状态刷新失败：${error instanceof Error ? error.message : String(error)}`)
      return run
    }
  }

  async function reconcileCommitArtifacts(run: Awaited<ReturnType<typeof store.getRun>>): Promise<void> {
    if (!run || !dependencies.gitDeliveryManager) return
    for (const execution of run.stepExecutions.filter((candidate) => candidate.status === 'completed')) {
      const phase = run.definition.phases.find((candidate) => candidate.id === execution.phaseId)
      const step = phase?.steps.find((candidate) => candidate.id === execution.stepId)
      const reviewStep = step?.id === 'review' || step?.skill?.name === 'code-review' || /review/i.test(step?.name ?? '')
      if (!reviewStep || run.artifacts.some((artifact) => artifact.type === 'commit' && artifact.stepExecutionId === execution.id)) continue
      const delivery = await dependencies.gitDeliveryManager.commitAfterReview({
        workspacePath: run.workspacePath,
        runId: run.id,
        baseCommit: run.baseCommit,
        ticket: ticketReference(run.idea, run.artifacts),
        idempotencyKey: `git.commit:${run.id}`
      })
      await store.registerArtifact(run.id, execution.id, delivery.artifact)
    }
  }

  async function listRuns(projectId: string): Promise<WorkflowRun[]> {
    const runs = await store.listRuns(projectId)
    const refreshed = await Promise.all(runs.map((run) => refreshPullRequest(run)))
    return refreshed.filter((run): run is NonNullable<typeof run> => Boolean(run))
  }

  function ensureRunning(runId: string): void {
    if (active.has(runId)) return
    const promise = execute(runId).finally(() => {
      if (active.get(runId) === promise) active.delete(runId)
    })
    active.set(runId, promise)
  }

  async function requireRunStatus(runId: string, action: string, allowed: WorkflowRun['status'][]): Promise<NonNullable<Awaited<ReturnType<typeof store.getRun>>>> {
    const run = await store.getRun(runId)
    if (!run) throw new Error('找不到 Workflow Run。')
    if (!allowed.includes(run.status)) throw new Error(`${run.status} 状态不允许${action}。`)
    return run
  }

  async function interruptActiveTurn(run: WorkflowRun): Promise<boolean> {
    const execution = run.snapshot.currentStepExecutionId
      ? run.stepExecutions.find((candidate) => candidate.id === run.snapshot.currentStepExecutionId)
      : null
    const runtimeLocator = execution?.runtimeLocators.at(-1)
    if (!execution || !runtimeLocator || !dependencies.runtime.interrupt) return false
    await dependencies.runtime.interrupt({ runId: run.id, executionId: execution.id, runtimeLocator })
    await active.get(run.id)
    return true
  }

  return {
    async preflight(input): Promise<WorkflowPreflightResult> {
      if (isProjectDeleted(input.project)) return { passed: false, checks: [], errors: [zhCNMain.projectDelete.notFound] }
      const checks: string[] = []
      const errors: string[] = []
      if (input.project.workspaceAvailable === false) errors.push(zhCNMain.workflowRun.workspaceUnavailable)
      else {
        checks.push(zhCNMain.workflowRun.workspaceAvailable)
        checks.push(workspacePreflightSummary(input.project))
      }
      if (!workspaceAllowed(input.project)) errors.push('Permission Policy 阻止访问 Project Workspace 目录。')
      if (!input.workflow.canStart || !input.workflow.validation.valid) errors.push(zhCNMain.workflowRun.workflowInvalid(input.workflow.validation.errors.join(' ')))
      else checks.push(zhCNMain.workflowRun.workflowValid)
      if (!input.idea.trim()) errors.push(zhCNMain.workflowRun.ideaRequired)
      else checks.push(zhCNMain.workflowRun.ideaFilled)
      errors.push(...releaseConfigErrors(input.project))
      for (const phase of input.workflow.definition.phases) {
        for (const step of phase.steps) {
          if (isPullRequestStep(step) && input.project.remote) {
            if (!step.approvalGate) errors.push('GitHub delivery Step 必须声明 Merge Gate。')
            if (!input.project.defaultBranch?.trim()) errors.push('GitHub delivery Step 无法验证 Project 默认分支。')
            if (!(input.project.permissionPolicy?.grantedPermissions ?? DEFAULT_PROJECT_PERMISSIONS).includes('network.github')) errors.push('GitHub delivery Step 权限校验失败：缺少 network.github。')
            else {
              if (!dependencies.gitDeliveryManager?.preflightPullRequest) {
                errors.push('GitHub delivery Preflight 失败：delivery adapter 不可用。')
              } else {
                try {
                  await dependencies.gitDeliveryManager.preflightPullRequest(input.project.workspacePath, input.project.remote)
                  checks.push('GitHub remote、CLI 和凭据可用。')
                } catch (error) {
                  errors.push(`GitHub delivery Preflight 失败：${error instanceof Error ? error.message : String(error)}`)
                }
              }
              checks.push(`Data Transfer Notice：External Destination: GitHub；Step ${phase.name}/${step.name} 将 push feature branch 及 Base Commit，并发送 Run ID、Idempotency Key、ticket；同时读取 PR checks/reviews；权限：network.github；断网后从持久化 Pull Request Artifact 恢复。`)
            }
          }
          if (isReleaseStep(step) && (step.condition !== 'project.release.enabled' || input.project.release?.enabled === true)) {
            if (!platform) {
              errors.push(`Release Preflight 失败：当前平台 ${dependencies.platform ?? process.platform} 不受支持。`)
              continue
            }
            const configured = configuredReleaseStep(input.project, platform, step.operation, step)
            if (!configured) {
              errors.push(`Release Preflight 失败：${platform} 缺少 ${step.operation} 适配。`)
            } else {
              if (step.operation === 'release' && !step.approvalGate) errors.push('Release Step 必须声明 Approval Gate。')
              const result = await releaseManager.preflight({ project: input.project, workspacePath: input.project.workspacePath, platform, operation: step.operation, step: configured, input: {}, permissionPolicy: input.project.permissionPolicy ?? { grantedPermissions: [...DEFAULT_PROJECT_PERMISSIONS] } })
              checks.push(...result.checks)
              errors.push(...result.errors)
            }
          }
          if (!step.skill) continue
          const manifest = input.workflow.skillManifests.find((candidate) => candidate.name === step.skill?.name && candidate.version === step.skill?.version)
          if (manifest?.requiredPermissions.includes('network.github')) checks.push(`Data Transfer Notice：External Destination: GitHub；Step ${phase.name}/${step.name} 将发送 Idea、Phase Context、声明的输入 Artifact、Decision Record 和 Skill 请求的 GitHub Artifact；权限：network.github；断网后从持久化 Step Execution 恢复。`)
        }
      }
      const firstStep = input.workflow.definition.phases[0]?.steps[0]
      if (dependencies.runtime.preflight) {
        const runtime = await dependencies.runtime.preflight({
          workspace: { path: input.project.workspacePath },
          skill: firstStep?.skill ?? null,
          permissionPolicy: input.project.permissionPolicy ?? { grantedPermissions: [...DEFAULT_PROJECT_PERMISSIONS] }
        })
        checks.push(...runtime.checks)
        errors.push(...runtime.errors)
      }
      return { passed: errors.length === 0, checks, errors }
    },

    async startRun(input): Promise<WorkflowRun> {
      const preflight = await this.preflight(input)
      if (!preflight.passed) throw new Error(preflight.errors.join(' '))
      const missingDeliveryGate = deliveryGateError(input)
      if (missingDeliveryGate) throw new Error(missingDeliveryGate)
      if (platform) {
        for (const step of input.workflow.definition.phases.flatMap((phase) => phase.steps)) {
          if (!isReleaseStep(step) || (step.condition === 'project.release.enabled' && input.project.release?.enabled !== true)) continue
          if (!configuredReleaseStep(input.project, platform, step.operation, step)) throw new Error(`Release Preflight 失败：${platform} 缺少 ${step.operation} 适配。`)
          if (step.operation === 'release' && !step.approvalGate) throw new Error('Release Step 必须声明 Approval Gate。')
        }
      }
      const run = await store.createRun({ id: (dependencies.createId ?? randomUUID)(), project: input.project, workflow: input.workflow.definition, workflowSource: { source: input.workflow.source, path: input.workflow.path }, idea: input.idea.trim(), now: (dependencies.now ?? (() => new Date().toISOString()))() })
      ensureRunning(run.id)
      return run
    },

    async getRun(runId) {
      return refreshPullRequest(await store.getRun(runId))
    },

    listRuns,

    async hasActiveRuns(projectId) {
      const runs = await listRuns(projectId)
      return runs.some((run) => isWorkflowRunInProgress(run.status))
    },

    async pauseRun(runId) {
      const current = await requireRunStatus(runId, '暂停', ['running'])
      if (await interruptActiveTurn(current)) return (await store.getRun(runId)) ?? current
      return store.setStatus(runId, 'paused')
    },

    async resumeRun(runId, guidance) {
      await requireRunStatus(runId, '继续', ['paused', 'blocked'])
      const run = await store.resume(runId, guidance)
      if (run.status === 'running') ensureRunning(runId)
      return run
    },

    async retryStep(runId, guidance) {
      await requireRunStatus(runId, '重试', ['failed'])
      const run = await store.retry(runId, guidance)
      ensureRunning(runId)
      return run
    },

    async cancelRun(runId) {
      const current = await requireRunStatus(runId, '结束 Run', ['running', 'paused', 'waiting', 'blocked', 'failed'])
      if (current.status === 'running') await interruptActiveTurn(current)
      return store.setStatus(runId, 'cancelled')
    },

    async answerQuestion(runId, answer) {
      const current = await requireRunStatus(runId, '回答', ['waiting'])
      if (!current.snapshot.pendingQuestionDetails || !current.snapshot.pendingQuestion) throw new Error('waiting 状态没有可回答的 Agent Question。')
      const run = await store.answerQuestion(runId, answer)
      ensureRunning(runId)
      return run
    },

    async approve(runId) {
      const stored = await requireRunStatus(runId, '批准', ['waiting'])
      if (!stored.snapshot.pendingApprovalDetails || !stored.snapshot.pendingApproval) throw new Error('waiting 状态没有可决定的 Approval。')
      const execution = stored.snapshot.currentStepExecutionId ? stored.stepExecutions.find((candidate) => candidate.id === stored.snapshot.currentStepExecutionId) : null
      const step = execution ? stored.workflow.phases[stored.snapshot.phaseIndex]?.steps[stored.snapshot.stepIndex] : undefined
      const current = await refreshPullRequest(stored, isPullRequestStep(step))
      if (!current) throw new Error('找不到 Workflow Run。')
      if (isPullRequestStep(step) && !current.pullRequest?.gate.canMerge) throw new Error(`Merge Gate 不可批准：${current.pullRequest?.gate.reason ?? 'Pull Request 状态不可用。'}`)
      const run = await store.decideApproval(runId, 'approved')
      ensureRunning(runId)
      return run
    },

    async reject(runId) {
      const current = await requireRunStatus(runId, '拒绝', ['waiting'])
      if (!current.snapshot.pendingApprovalDetails || !current.snapshot.pendingApproval) throw new Error('waiting 状态没有可决定的 Approval。')
      return store.decideApproval(runId, 'rejected')
    },

    async recover() {
      for (const run of await store.recoverableRuns()) {
        await reconcileCommitArtifacts(run)
        if (run.status === 'running') ensureRunning(run.id)
      }
    },

    async waitForIdle(runId) {
      await active.get(runId)
      const run = await store.getRun(runId)
      if (!run) throw new Error('找不到 Workflow Run。')
      return run
    },

    async close() {
      closed = true
      await store.close()
    }
  }
}
