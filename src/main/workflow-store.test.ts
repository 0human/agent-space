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
  it('persists adaptive Ticket and Run summaries across failed attempts, interruptions and reopening', async () => {
    const directory = await mkdtemp(join(process.cwd(), '.tmp-workflow-store-'))
    temporaryDirectories.push(directory)
    const databasePath = join(directory, 'runs.sqlite')
    let timestamp = '2026-09-11T00:00:00.000Z'
    const store = createSqliteRunStore({ databasePath, now: () => timestamp })
    const definition = { ...workflow, phases: [
      { id: 'planning', name: 'Planning', goal: 'Plan', steps: [{ id: 'plan', name: 'Plan', kind: 'skill' as const }] },
      { id: 'implementation', name: 'Implementation', goal: 'Ship', steps: [{ id: 'implement', name: 'Implement', kind: 'skill' as const }] },
    ] }
    let run = await store.createRun({ id: 'summary-run', project, workflow: definition, workflowSource: { source: 'project', path: null }, idea: 'Summary', now: timestamp })
    run = await store.recordRuntimeResult(run.id, run.snapshot.currentStepExecutionId!, [
      { type: 'artifact_produced', artifact: { type: 'ticket', name: 'Control slice', location: 'https://github.com/example/demo/issues/1', runId: run.id } },
      { type: 'status_changed', status: 'completed' },
    ])
    const first = run.snapshot.currentStepExecutionId!
    timestamp = '2026-09-11T00:00:10.000Z'
    run = await store.recordRuntimeResult(run.id, first, [
      { type: 'file_changes', changes: [{ path: 'src/run.ts', kind: 'add', additions: 12, deletions: 0 }], idempotencyKey: 'file-1' },
      { type: 'ticket_progress', stage: 'implementation', status: 'completed' },
      { type: 'error', error: 'Review failed' },
    ])
    run = await store.retry(run.id, 'Fix the failure')
    const second = run.snapshot.currentStepExecutionId!
    timestamp = '2026-09-11T00:00:20.000Z'
    run = await store.recordRuntimeResult(run.id, second, [{ type: 'status_changed', status: 'paused' }])
    timestamp = '2026-09-11T00:00:30.000Z'
    run = await store.resume(run.id)
    expect(run.stepExecutions.at(-1)?.startedAt).toBe('2026-09-11T00:00:10.000Z')
    timestamp = '2026-09-11T00:01:00.000Z'
    const results: RuntimeEventInput[] = [
      { type: 'file_changes', changes: [{ path: 'src/run.ts', kind: 'update', additions: 3, deletions: 2 }], idempotencyKey: 'file-2' },
      { type: 'ticket_progress', stage: 'testing', status: 'skipped' },
      { type: 'ticket_progress', stage: 'review', status: 'completed' },
      { type: 'ticket_progress', stage: 'commit', status: 'completed' },
      { type: 'artifact_produced', artifact: { type: 'commit', name: 'Fix controls', versionHash: 'abc456' } },
      { type: 'status_changed', status: 'completed' },
    ]
    run = await store.recordRuntimeResult(run.id, second, results)
    expect(run.summaries).toEqual([
      expect.objectContaining({ scope: 'ticket', title: 'Control slice', status: 'completed', attemptCount: 2, durationMs: 60000,
        files: [{ path: 'src/run.ts', kinds: ['add', 'update'], additions: 15, deletions: 2 }],
        failedAttemptCount: 1, interruptionCount: 1,
        artifacts: [expect.objectContaining({ type: 'commit', versionHash: 'abc456' })],
      }),
      expect.objectContaining({ scope: 'run', status: 'completed', ticketCount: 1, durationMs: 60000 }),
    ])
    expect(run.summaries?.[0].results.map((result) => result.category)).toEqual(['implementation', 'review', 'commit'])
    await store.recordRuntimeResult(run.id, second, results)
    await store.close()
    const reopened = createSqliteRunStore({ databasePath })
    expect((await reopened.getRun(run.id))?.summaries).toEqual(run.summaries)
    await reopened.close()
  })

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
