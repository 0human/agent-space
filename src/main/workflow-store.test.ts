// @vitest-environment node

import { createRequire } from 'node:module'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import initSqlJs from 'sql.js'
import { afterEach, describe, expect, it } from 'vitest'

import { createSqliteRunStore } from './workflow-store'
import type { Project } from '../shared/project'
import type { RuntimeEventInput } from '../shared/workflow-run'

const require = createRequire(import.meta.url)
const temporaryDirectories: string[] = []

const project: Project = {
  id: 'project-1',
  name: 'Demo',
  workspacePath: '/work/demo',
  workspaceAvailable: true,
  remote: null,
  currentBranch: 'main',
  head: 'abc123',
  defaultBranch: 'main',
  isGreenfield: false,
  dirty: false,
  dirtySummary: { staged: 0, unstaged: 0, untracked: 0, files: [] },
  updatedAt: '2026-09-02T00:00:00.000Z'
}

const workflow = {
  schemaVersion: 1 as const,
  id: 'workflow-store-test',
  name: 'Workflow Store Test',
  version: '1.0.0',
  phases: [{ id: 'phase', name: 'Phase', goal: 'Test', steps: [{ id: 'step', name: 'Step', kind: 'skill' as const }] }]
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

describe('Workflow Store forward migrations', () => {
  it('opens a database written by the previous schema and keeps it usable', async () => {
    const directory = await mkdtemp(join(process.cwd(), '.tmp-workflow-store-'))
    temporaryDirectories.push(directory)
    const databasePath = join(directory, 'workflow-runs.sqlite')
    const SQL = await initSqlJs({ locateFile: (file) => require.resolve(join('sql.js', 'dist', file)) })
    const database = new SQL.Database()

    database.run(`
      CREATE TABLE runs (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        workspace_path TEXT NOT NULL,
        idea TEXT NOT NULL,
        workflow_id TEXT NOT NULL,
        workflow_version TEXT NOT NULL,
        workflow_json TEXT NOT NULL,
        project_json TEXT NOT NULL,
        status TEXT NOT NULL,
        error TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `)
    await writeFile(databasePath, Buffer.from(database.export()))
    database.close()

    const store = createSqliteRunStore({ databasePath })
    await expect(store.listRuns('missing-project')).resolves.toEqual([])
    await expect(store.close()).resolves.toBeUndefined()
  })

  it('migrates a legacy Runtime Locator into the ordered locator history', async () => {
    const directory = await mkdtemp(join(process.cwd(), '.tmp-workflow-store-'))
    temporaryDirectories.push(directory)
    const databasePath = join(directory, 'workflow-runs.sqlite')
    const SQL = await initSqlJs({ locateFile: (file) => require.resolve(join('sql.js', 'dist', file)) })
    const database = new SQL.Database()
    const runtimeLocator = {
      runtimeProvider: 'codex',
      threadId: 'thread-legacy',
      turnId: 'turn-legacy',
      runtimeVersion: '0.144.3'
    }
    const workflow = {
      schemaVersion: 1,
      id: 'development-workflow',
      name: 'Development Workflow',
      version: '1.0.0',
      phases: [{
        id: 'implementation',
        name: 'Implementation',
        goal: 'Deliver the change',
        steps: [{ id: 'implement', name: 'Implement', kind: 'skill' }]
      }]
    }
    const project = {
      id: 'project-1',
      name: 'Demo',
      workspacePath: '/work/demo',
      workspaceAvailable: true,
      remote: null,
      currentBranch: 'main',
      head: 'abc123',
      defaultBranch: 'main',
      isGreenfield: false,
      dirty: false,
      dirtySummary: { staged: 0, unstaged: 0, untracked: 0, files: [] },
      updatedAt: '2026-09-02T00:00:00.000Z'
    }

    database.run(`
      CREATE TABLE runs (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        workspace_path TEXT NOT NULL,
        idea TEXT NOT NULL,
        workflow_id TEXT NOT NULL,
        workflow_version TEXT NOT NULL,
        workflow_json TEXT NOT NULL,
        project_json TEXT NOT NULL,
        status TEXT NOT NULL,
        error TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE run_snapshots (
        run_id TEXT PRIMARY KEY,
        phase_index INTEGER NOT NULL,
        step_index INTEGER NOT NULL,
        current_step_execution_id TEXT,
        pending_question TEXT,
        pending_approval TEXT,
        next_action TEXT NOT NULL
      );
      CREATE TABLE step_executions (
        id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL,
        phase_id TEXT NOT NULL,
        step_id TEXT NOT NULL,
        attempt INTEGER NOT NULL,
        status TEXT NOT NULL,
        runtime_locator_json TEXT,
        error TEXT,
        output_json TEXT,
        started_at TEXT,
        finished_at TEXT,
        UNIQUE(run_id, step_id, attempt)
      );
    `)
    database.run(
      'INSERT INTO runs (id, project_id, workspace_path, idea, workflow_id, workflow_version, workflow_json, project_json, status, error, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      ['run-legacy', 'project-1', '/work/demo', 'Resume the legacy attempt', workflow.id, workflow.version, JSON.stringify(workflow), JSON.stringify(project), 'paused', null, '2026-09-02T00:00:00.000Z', '2026-09-02T00:00:00.000Z']
    )
    database.run(
      'INSERT INTO run_snapshots (run_id, phase_index, step_index, current_step_execution_id, pending_question, pending_approval, next_action) VALUES (?, ?, ?, ?, ?, ?, ?)',
      ['run-legacy', 0, 0, 'execution-legacy', null, null, 'Resume']
    )
    database.run(
      'INSERT INTO step_executions (id, run_id, phase_id, step_id, attempt, status, runtime_locator_json, error, output_json, started_at, finished_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      ['execution-legacy', 'run-legacy', 'implementation', 'implement', 1, 'running', JSON.stringify(runtimeLocator), null, null, '2026-09-02T00:00:00.000Z', null]
    )
    await writeFile(databasePath, Buffer.from(database.export()))
    database.close()

    const store = createSqliteRunStore({ databasePath })
    await expect(store.getRun('run-legacy')).resolves.toMatchObject({
      stepExecutions: [{
        id: 'execution-legacy',
        runtimeLocators: [runtimeLocator]
      }]
    })
    await expect(store.close()).resolves.toBeUndefined()
  })

  it('keeps paused and failed Runs in the recoverable set', async () => {
    const directory = await mkdtemp(join(process.cwd(), '.tmp-workflow-store-'))
    temporaryDirectories.push(directory)
    const store = createSqliteRunStore({ databasePath: join(directory, 'workflow-runs.sqlite') })
    const paused = await store.createRun({
      id: 'run-paused', project, workflow,
      workflowSource: { source: 'project', path: '/work/demo/.agent-space/workflow.json' },
      idea: 'Pause me', now: '2026-09-02T00:00:00.000Z'
    })
    await store.setStatus(paused.id, 'paused')
    const failed = await store.createRun({
      id: 'run-failed', project, workflow,
      workflowSource: { source: 'project', path: '/work/demo/.agent-space/workflow.json' },
      idea: 'Fail me', now: '2026-09-02T00:00:01.000Z'
    })
    await store.recordRuntimeResult(failed.id, failed.snapshot.currentStepExecutionId!, [{ type: 'error', error: 'runtime failed' }])

    const recoverable = await store.recoverableRuns()
    expect(recoverable.map((run) => run.id)).toEqual(expect.arrayContaining(['run-paused', 'run-failed']))
    expect(recoverable.find((run) => run.id === 'run-paused')?.stepExecutions[0]).toMatchObject({ status: 'paused' })
    expect(recoverable.find((run) => run.id === 'run-failed')?.stepExecutions[0]).toMatchObject({ status: 'failed' })
    await store.close()
  })

  it('deduplicates replayed Runtime logs without relying on timestamps', async () => {
    const directory = await mkdtemp(join(process.cwd(), '.tmp-workflow-store-'))
    temporaryDirectories.push(directory)
    let tick = 0
    const store = createSqliteRunStore({
      databasePath: join(directory, 'workflow-runs.sqlite'),
      now: () => `2026-09-02T00:00:0${tick++}.000Z`
    })
    const created = await store.createRun({
      id: 'run-replay', project, workflow,
      workflowSource: { source: 'project', path: '/work/demo/.agent-space/workflow.json' },
      idea: 'Replay me', now: '2026-09-02T00:00:00.000Z'
    })
    const events: RuntimeEventInput[] = [{ type: 'text_delta', text: 'Durable context.' }, { type: 'question', question: 'Continue?' }]
    const first = await store.recordRuntimeResult(created.id, created.snapshot.currentStepExecutionId!, events)
    const replayed = await store.recordRuntimeResult(created.id, created.snapshot.currentStepExecutionId!, events)
    expect(first.logs).toHaveLength(2)
    expect(replayed.logs).toHaveLength(2)
    expect(replayed.phaseContexts).toEqual([expect.objectContaining({ content: 'Durable context.' })])
    expect(replayed.events.filter((event) => event.type === 'waiting')).toHaveLength(1)
    await store.close()
  })

  it('uses the terminal status when Runtime emits running before completed', async () => {
    const directory = await mkdtemp(join(process.cwd(), '.tmp-workflow-store-'))
    temporaryDirectories.push(directory)
    const store = createSqliteRunStore({ databasePath: join(directory, 'workflow-runs.sqlite') })
    const created = await store.createRun({
      id: 'run-terminal-status', project, workflow,
      workflowSource: { source: 'project', path: '/work/demo/.agent-space/workflow.json' },
      idea: 'Terminal status', now: '2026-09-02T00:00:00.000Z'
    })
    const result = await store.recordRuntimeResult(
      created.id,
      created.snapshot.currentStepExecutionId!,
      [
        { type: 'status_changed', status: 'running' },
        { type: 'status_changed', status: 'completed' },
      ],
    )
    expect(result.status).toBe('completed')
    expect(result.stepExecutions[0]?.status).toBe('completed')
    await store.close()
  })
})
