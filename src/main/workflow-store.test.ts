// @vitest-environment node

import { createRequire } from 'node:module'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import initSqlJs from 'sql.js'
import { afterEach, describe, expect, it } from 'vitest'

import { createSqliteRunStore } from './workflow-store'

const require = createRequire(import.meta.url)
const temporaryDirectories: string[] = []

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
})
