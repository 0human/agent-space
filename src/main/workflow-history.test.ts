// @vitest-environment node

import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type { Project } from '../shared/project'
import type { WorkflowView } from '../shared/workflow'
import { createCodexRuntimeAdapter } from './codex-runtime'
import { createCodexItemProjection } from './codex-item-projection'
import { createWorkflowEngine, type WorkflowEngine } from './workflow-engine'

const project = {
  id: 'project-history', name: 'History', workspacePath: '/work/history', workspaceAvailable: true,
  remote: null, currentBranch: 'main', head: 'abc123', defaultBranch: 'main', dirty: false,
  isGreenfield: false, dirtySummary: { staged: 0, unstaged: 0, untracked: 0, files: [] },
  permissionPolicy: { grantedPermissions: ['workspace.read'] }, updatedAt: '2026-09-24T00:00:00.000Z',
} satisfies Project
const workflow: WorkflowView = {
  definition: { schemaVersion: 1, id: 'history', name: 'History', version: '1.0.0', phases: [{
    id: 'discovery', name: 'Discovery', goal: 'Discover', steps: [{ id: 'discover', name: 'Discover', kind: 'skill' }],
  }] },
  source: 'project', path: '/work/history/workflow.json', validation: { valid: true, errors: [], warnings: [] },
  canStart: true, skillManifests: [],
}
const locators = ['first', 'second'].map((turnId) => ({ runtimeProvider: 'codex', threadId: 'thread-history', turnId, runtimeVersion: '0.144.3' }))

describe('Workflow history recovery', () => {
  let directory: string
  let engine: WorkflowEngine
  afterEach(async () => {
    await engine?.close()
    if (directory) await rm(directory, { recursive: true, force: true })
  })

  async function savedRun() {
    directory = await mkdtemp(join(tmpdir(), 'agent-space-history-'))
    const databasePath = join(directory, 'runs.sqlite')
    let turn = 0
    engine = createWorkflowEngine({ databasePath, runtime: { async execute(context) {
      await context.persistRuntimeLocator?.(locators[turn++])
      return turn === 1
        ? [{ type: 'question', question: 'Which option?' }]
        : [
          { type: 'artifact_produced', artifact: { type: 'document', name: 'domain-docs', location: '/work/history/CONTEXT.md' } },
          { type: 'status_changed', status: 'completed' },
        ]
    } } })
    const run = await engine.startRun({ project, workflow, idea: 'Restore history' })
    await engine.waitForIdle(run.id)
    await engine.answerQuestion(run.id, 'Keep local state')
    const completed = await engine.waitForIdle(run.id)
    await engine.close()
    return { databasePath, completed }
  }

  function historyRuntime(read: (threadId: string) => unknown) {
    const projection = createCodexItemProjection()
    const requests: Array<{ method: string; params: Record<string, unknown> }> = []
    const runtime = createCodexRuntimeAdapter({ itemProjection: projection, createTransport: () => ({
      async request(method, params) {
        requests.push({ method, params })
        if (method === 'initialize') return { userAgent: 'codex/0.144.3', capabilities: {
          methods: ['thread/start', 'thread/resume', 'thread/read', 'turn/start', 'turn/interrupt'],
          events: ['item/started', 'item/completed', 'turn/completed'],
        } }
        if (method === 'thread/read') {
          expect(params.includeTurns).toBe(true)
          return read(String(params.threadId))
        }
        throw new Error(`Unexpected runtime mutation: ${method}`)
      },
      async notify() {}, async nextNotification() { return null }, async close() {},
    }) })
    return { runtime, projection, requests }
  }

  it('restores all persisted Turns after Desktop Shell restart and re-entry without changing business records', async () => {
    const { databasePath, completed } = await savedRun()
    const { runtime, projection } = historyRuntime((id) => ({ thread: { id, turns: [
      { id: 'second', status: 'completed', items: [{ id: 'reply', type: 'agentMessage', phase: 'final_answer', text: 'Second reply' }] },
      { id: 'unrelated', status: 'completed', items: [{ id: 'reply', type: 'agentMessage', text: 'Do not show' }] },
      { id: 'first', status: 'completed', items: [{ id: 'reply', type: 'agentMessage', phase: 'final_answer', text: 'First reply' }] },
    ] } }))
    engine = createWorkflowEngine({ databasePath, runtime })
    const executionId = completed.stepExecutions[0].id
    await engine.loadRuntimeHistory(completed.id, executionId)
    await engine.loadRuntimeHistory(completed.id, executionId)

    expect(projection.list(executionId).filter((item) => item.type === 'final_response').map((item) => item.text)).toEqual(['First reply', 'Second reply'])
    expect(completed.stepExecutions[0].runtimeLocators).toEqual(locators)
    expect(completed.artifacts).toHaveLength(1)
    expect(completed.decisionRecords).toHaveLength(1)
    expect(await engine.getRun(completed.id)).toEqual(completed)
  })

  it.each(['deleted', 'unavailable', 'missing-turn'])('keeps completed business records readable when history is %s', async (failure) => {
    const { databasePath, completed } = await savedRun()
    const { runtime } = historyRuntime((id) => {
      if (failure === 'missing-turn') return { thread: { id, turns: [] } }
      throw new Error(failure === 'deleted' ? 'Thread not found' : 'spawn codex ENOENT')
    })
    engine = createWorkflowEngine({ databasePath, runtime })
    await expect(engine.loadRuntimeHistory(completed.id, completed.stepExecutions[0].id)).rejects.toThrow('Codex 执行历史不可用')
    await engine.recover()
    expect(await engine.getRun(completed.id)).toEqual(completed)
  })

  it.each(['running', 'paused', 'waiting', 'failed', 'unlocated'] as const)('blocks a %s Run after restart if its Thread is gone and refuses unsafe continuation', async (status) => {
    directory = await mkdtemp(join(tmpdir(), 'agent-space-history-'))
    const databasePath = join(directory, 'runs.sqlite')
    engine = createWorkflowEngine({ databasePath, runtime: { async execute(context) {
      if (status !== 'unlocated') await context.persistRuntimeLocator?.(locators[0])
      if (status === 'running' || status === 'unlocated') return new Promise(() => {})
      if (status === 'waiting') return [{ type: 'question', question: 'Which option?' }]
      if (status === 'failed') return [{ type: 'error', error: 'Execution failed' }]
      return [{ type: 'status_changed', status: 'paused' }]
    } } })
    const run = await engine.startRun({ project, workflow, idea: 'Recover safely' })
    await vi.waitFor(async () => expect((await engine.getRun(run.id))?.stepExecutions[0].runtimeLocators).toHaveLength(status === 'unlocated' ? 0 : 1))
    if (status !== 'running' && status !== 'unlocated') await engine.waitForIdle(run.id)
    const before = (await engine.getRun(run.id))!
    await engine.close()
    let available = false
    const { runtime, requests } = historyRuntime((id) => {
      if (!available) throw new Error('Thread not found')
      return { thread: { id, turns: [{ id: 'first', status: 'completed', items: [] }] } }
    })
    engine = createWorkflowEngine({ databasePath, runtime })
    await engine.recover()
    const recovered = (await engine.getRun(run.id))!
    expect(recovered).toMatchObject({ status: 'blocked', snapshot: {
      currentStepExecutionId: before.snapshot.currentStepExecutionId,
      pendingQuestionDetails: before.snapshot.pendingQuestionDetails,
      blockedBy: { reason: 'Codex 执行历史不可用', recoveryAction: 'resume' },
    } })
    expect(recovered.artifacts).toEqual(before.artifacts)
    expect(recovered.phaseContexts).toEqual(before.phaseContexts)
    expect(recovered.decisionRecords).toEqual(before.decisionRecords)
    await expect(engine.resumeRun(run.id)).rejects.toThrow('Codex 执行历史不可用')
    expect((await engine.getRun(run.id))?.status).toBe('blocked')
    expect(requests.every(({ method }) => method === 'initialize' || method === 'thread/read')).toBe(true)
    if (status === 'waiting' || status === 'failed') {
      available = true
      const restored = await engine.resumeRun(run.id)
      expect(restored.status).toBe(status)
      expect(restored.snapshot.blockedBy).toBeNull()
      expect(restored.snapshot.pendingQuestionDetails).toEqual(before.snapshot.pendingQuestionDetails)
      expect(restored.stepExecutions).toEqual(before.stepExecutions)
    }
  })
})
