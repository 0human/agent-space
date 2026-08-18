import { randomUUID } from 'node:crypto'

import type {
  AgentRuntimeAdapter,
  RuntimeExecutionContext,
  WorkflowPreflightInput,
  WorkflowPreflightResult,
  WorkflowRun,
  StartWorkflowRunInput
} from '../shared/workflow-run'
import { createSqliteRunStore } from './workflow-store'
import { zhCNMain } from '../shared/i18n/zh-CN'

interface WorkflowEngineDependencies {
  databasePath: string
  runtime: AgentRuntimeAdapter
  runWorkspaceManager?: import('./run-workspace').RunWorkspaceManager
  now?: () => string
  createId?: () => string
}

export interface WorkflowEngine {
  preflight(input: WorkflowPreflightInput): Promise<WorkflowPreflightResult>
  startRun(input: StartWorkflowRunInput): Promise<WorkflowRun>
  getRun(runId: string): Promise<WorkflowRun | null>
  listRuns(projectId: string): Promise<WorkflowRun[]>
  pauseRun(runId: string): Promise<WorkflowRun>
  resumeRun(runId: string): Promise<WorkflowRun>
  retryStep(runId: string): Promise<WorkflowRun>
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
  const active = new Map<string, Promise<void>>()
  let closed = false

  async function execute(runId: string): Promise<void> {
    while (true) {
      const run = await store.getRun(runId)
      if (!run || run.status !== 'running' || !run.snapshot.currentStepExecutionId) return
      const execution = run.stepExecutions.find((candidate) => candidate.id === run.snapshot.currentStepExecutionId)
      if (!execution) return
      const context: RuntimeExecutionContext = {
        runId,
        project: run.project,
        idea: run.idea,
        workflow: run.workflow,
        phaseIndex: run.snapshot.phaseIndex,
        stepIndex: run.snapshot.stepIndex,
        execution,
        events: run.events
      }
      let events
      try {
        events = await dependencies.runtime.execute(context)
      } catch (error) {
        events = [{ type: 'error' as const, error: error instanceof Error ? error.message : String(error) }]
      }
      if (closed) return
      const updated = await store.recordRuntimeResult(runId, execution.id, events)
      if (updated.status !== 'running' || updated.snapshot.currentStepExecutionId === execution.id) return
    }
  }

  function ensureRunning(runId: string): void {
    if (active.has(runId)) return
    const promise = execute(runId).finally(() => {
      if (active.get(runId) === promise) active.delete(runId)
    })
    active.set(runId, promise)
  }

  return {
    async preflight(input): Promise<WorkflowPreflightResult> {
      const checks: string[] = []
      const errors: string[] = []
      if (input.project.workspaceAvailable === false) errors.push(zhCNMain.workflowRun.workspaceUnavailable)
      else checks.push(zhCNMain.workflowRun.workspaceAvailable)
      if (!input.workflow.canStart || !input.workflow.validation.valid) errors.push(zhCNMain.workflowRun.workflowInvalid(input.workflow.validation.errors.join(' ')))
      else checks.push(zhCNMain.workflowRun.workflowValid)
      if (!input.idea.trim()) errors.push(zhCNMain.workflowRun.ideaRequired)
      else checks.push(zhCNMain.workflowRun.ideaFilled)
      return { passed: errors.length === 0, checks, errors }
    },

    async startRun(input): Promise<WorkflowRun> {
      const preflight = input.preflight ?? await this.preflight(input)
      if (!preflight.passed) throw new Error(preflight.errors.join(' '))
      const run = await store.createRun({ id: (dependencies.createId ?? randomUUID)(), project: input.project, workflow: input.workflow.definition, idea: input.idea.trim(), now: (dependencies.now ?? (() => new Date().toISOString()))() })
      ensureRunning(run.id)
      return run
    },

    async getRun(runId) {
      const run = await store.getRun(runId)
      if (!run) return null
      return run
    },

    async listRuns(projectId) {
      return store.listRuns(projectId)
    },

    async pauseRun(runId) {
      return store.setStatus(runId, 'paused')
    },

    async resumeRun(runId) {
      const run = await store.resume(runId)
      if (run.status === 'running') ensureRunning(runId)
      return run
    },

    async retryStep(runId) {
      const run = await store.retry(runId)
      ensureRunning(runId)
      return run
    },

    async cancelRun(runId) {
      return store.setStatus(runId, 'cancelled')
    },

    async answerQuestion(runId, answer) {
      const run = await store.answerQuestion(runId, answer)
      ensureRunning(runId)
      return run
    },

    async approve(runId) {
      const run = await store.decideApproval(runId, 'approved')
      ensureRunning(runId)
      return run
    },

    async reject(runId) {
      return store.decideApproval(runId, 'rejected')
    },

    async recover() {
      for (const run of await store.recoverableRuns()) {
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
