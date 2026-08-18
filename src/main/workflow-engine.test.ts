// @vitest-environment node

import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type { Project } from '../shared/project'
import type { WorkflowView } from '../shared/workflow'
import type { AgentRuntimeAdapter, RuntimeResult } from '../shared/workflow-run'
import { createWorkflowEngine, type WorkflowEngine } from './workflow-engine'

class FakeRuntime implements AgentRuntimeAdapter {
  readonly calls: string[] = []
  private pending: Array<(result: RuntimeResult) => void> = []

  execute(context: { execution: { id: string } }): Promise<RuntimeResult> {
    this.calls.push(context.execution.id)
    return new Promise((resolve) => this.pending.push(resolve))
  }

  finish(result: RuntimeResult): void {
    const resolve = this.pending.shift()
    if (!resolve) throw new Error('No pending runtime execution')
    resolve(result)
  }
}

const project: Project = {
  id: 'project-1',
  name: 'demo',
  workspacePath: '/work/demo',
  workspaceAvailable: true,
  remote: null,
  currentBranch: 'main',
  head: 'abc123',
  defaultBranch: 'main',
  isGreenfield: false,
  dirty: false,
  dirtySummary: { staged: 0, unstaged: 0, untracked: 0, files: [] },
  updatedAt: '2026-08-18T00:00:00.000Z'
}

const workflow: WorkflowView = {
  definition: {
    schemaVersion: 1,
    id: 'project-workflow',
    name: 'Project Workflow',
    version: '1.0.0',
    phases: [{
      id: 'discovery',
      name: 'Discovery',
      goal: 'Clarify the idea',
      steps: [{ id: 'discover', name: 'Clarify Idea', kind: 'skill', artifacts: ['domain-docs'] }]
    }]
  },
  source: 'project',
  path: '/work/demo/.agent-space/workflow.json',
  validation: { valid: true, errors: [], warnings: [] },
  canStart: true,
  skillManifests: []
}

const twoStepWorkflow: WorkflowView = {
  ...workflow,
  definition: {
    ...workflow.definition,
    phases: [{
      ...workflow.definition.phases[0],
      steps: [
        workflow.definition.phases[0].steps[0],
        { id: 'spec', name: 'Write specification', kind: 'skill' }
      ]
    }]
  }
}

describe('WorkflowEngine public API', () => {
  let directory: string
  let engine: WorkflowEngine

  afterEach(async () => {
    await engine?.close()
    if (directory) await rm(directory, { recursive: true, force: true })
  })

  it('preflights, persists a completed Run, and restores it after restart', async () => {
    directory = await mkdtemp(join(tmpdir(), 'agent-space-run-'))
    const runtime = new FakeRuntime()
    engine = createWorkflowEngine({ databasePath: join(directory, 'runs.sqlite'), runtime })

    const input = { project, workflow, idea: 'Build a durable workflow run' }
    await expect(engine.preflight(input)).resolves.toEqual({
      passed: true,
      checks: ['Project Workspace 可访问。', 'Project Workflow Validation 通过。', 'Idea 已填写。'],
      errors: []
    })

    const run = await engine.startRun({ ...input, preflight: await engine.preflight(input) })
    expect(run.status).toBe('running')
    expect(run.snapshot.nextAction).toBe('等待 Runtime 完成当前 Step。')
    expect(run.stepExecutions).toHaveLength(1)
    expect(run.events.map((event) => event.type)).toEqual(['started', 'step_started'])

    await vi.waitFor(() => expect(runtime.calls).toHaveLength(1))
    runtime.finish({ type: 'completed', output: { summary: 'done' }, artifacts: [{ type: 'document', name: 'domain-docs', location: '/work/demo/CONTEXT.md' }] })
    const completed = await engine.waitForIdle(run.id)
    expect(completed.status).toBe('completed')
    expect(completed.snapshot.nextAction).toBe('Workflow Run 已完成。')
    expect(completed.stepExecutions[0]).toMatchObject({ status: 'completed', attempt: 1 })
    expect(completed.artifacts).toHaveLength(1)
    expect(completed.events.map((event) => event.type)).toEqual(['started', 'step_started', 'step_completed', 'completed'])

    await engine.close()
    engine = createWorkflowEngine({ databasePath: join(directory, 'runs.sqlite'), runtime: new FakeRuntime() })
    await expect(engine.getRun(run.id)).resolves.toMatchObject({
      id: run.id,
      status: 'completed',
      snapshot: { nextAction: 'Workflow Run 已完成。' },
      artifacts: [expect.objectContaining({ name: 'domain-docs' })]
    })
  })

  it('pauses between Steps and resumes from the durable cursor after restart', async () => {
    directory = await mkdtemp(join(tmpdir(), 'agent-space-run-'))
    const databasePath = join(directory, 'runs.sqlite')
    const runtime = new FakeRuntime()
    engine = createWorkflowEngine({ databasePath, runtime })
    const input = { project, workflow: twoStepWorkflow, idea: 'Pause this Run safely' }
    const run = await engine.startRun(input)

    await vi.waitFor(() => expect(runtime.calls).toHaveLength(1))
    await engine.pauseRun(run.id)
    runtime.finish({ type: 'completed' })
    const paused = await engine.waitForIdle(run.id)

    expect(paused.status).toBe('paused')
    expect(paused.snapshot).toMatchObject({ phaseIndex: 0, stepIndex: 1, currentStepExecutionId: null })
    expect(paused.stepExecutions).toHaveLength(1)
    expect(paused.events.map((event) => event.type)).toContain('paused')

    await engine.close()
    const resumedRuntime = new FakeRuntime()
    engine = createWorkflowEngine({ databasePath, runtime: resumedRuntime })
    const resumed = await engine.resumeRun(run.id)
    expect(resumed.status).toBe('running')
    expect(resumed.stepExecutions).toHaveLength(2)
    await vi.waitFor(() => expect(resumedRuntime.calls).toHaveLength(1))
    resumedRuntime.finish({ type: 'completed' })
    await expect(engine.waitForIdle(run.id)).resolves.toMatchObject({ status: 'completed' })
  })

  it('restores waiting and blocked Runs, preserves failed attempts, and ignores cancelled results', async () => {
    directory = await mkdtemp(join(tmpdir(), 'agent-space-run-'))
    const databasePath = join(directory, 'runs.sqlite')
    const runtime = new FakeRuntime()
    engine = createWorkflowEngine({ databasePath, runtime })

    const waitingRun = await engine.startRun({ project, workflow, idea: 'Ask the user' })
    await vi.waitFor(() => expect(runtime.calls).toHaveLength(1))
    runtime.finish({ type: 'waiting', question: 'Which direction?' })
    await expect(engine.waitForIdle(waitingRun.id)).resolves.toMatchObject({ status: 'waiting', snapshot: { pendingQuestion: 'Which direction?' } })

    await engine.close()
    const recoveredRuntime = new FakeRuntime()
    engine = createWorkflowEngine({ databasePath, runtime: recoveredRuntime })
    await expect(engine.getRun(waitingRun.id)).resolves.toMatchObject({ status: 'waiting' })
    await engine.resumeRun(waitingRun.id)
    await vi.waitFor(() => expect(recoveredRuntime.calls).toHaveLength(1))
    recoveredRuntime.finish({ type: 'completed' })
    await expect(engine.waitForIdle(waitingRun.id)).resolves.toMatchObject({ status: 'completed' })

    const blockedRun = await engine.startRun({ project, workflow, idea: 'Wait for a dependency' })
    await vi.waitFor(() => expect(recoveredRuntime.calls).toHaveLength(2))
    recoveredRuntime.finish({ type: 'blocked', reason: 'Dependency unavailable' })
    await expect(engine.waitForIdle(blockedRun.id)).resolves.toMatchObject({ status: 'blocked' })

    const failedRun = await engine.startRun({ project, workflow, idea: 'Retry this Step' })
    await vi.waitFor(() => expect(recoveredRuntime.calls).toHaveLength(3))
    recoveredRuntime.finish({ type: 'failed', error: 'Transient runtime error' })
    await expect(engine.waitForIdle(failedRun.id)).resolves.toMatchObject({ status: 'failed', stepExecutions: [expect.objectContaining({ attempt: 1, status: 'failed' })] })
    await engine.retryStep(failedRun.id)
    await vi.waitFor(() => expect(recoveredRuntime.calls).toHaveLength(4))
    recoveredRuntime.finish({ type: 'completed' })
    await expect(engine.waitForIdle(failedRun.id)).resolves.toMatchObject({
      status: 'completed',
      stepExecutions: [expect.objectContaining({ attempt: 1, status: 'failed' }), expect.objectContaining({ attempt: 2, status: 'completed' })]
    })

    const cancelledRun = await engine.startRun({ project, workflow, idea: 'Cancel this Run' })
    await vi.waitFor(() => expect(recoveredRuntime.calls).toHaveLength(5))
    await engine.cancelRun(cancelledRun.id)
    recoveredRuntime.finish({ type: 'completed' })
    await expect(engine.waitForIdle(cancelledRun.id)).resolves.toMatchObject({ status: 'cancelled', events: expect.arrayContaining([expect.objectContaining({ type: 'cancelled' })]) })
  })
})
