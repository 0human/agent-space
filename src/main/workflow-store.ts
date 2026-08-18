import { randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import initSqlJs, { type Database as SqlJsDatabase } from 'sql.js'

import type { Project } from '../shared/project'
import type {
  RuntimeResult,
  RunSnapshot,
  StepExecutionStatus,
  WorkflowRun,
  WorkflowRunStatus
} from '../shared/workflow-run'
import type { WorkflowDefinition } from '../shared/workflow'

interface StoredRun extends WorkflowRun {
  project: Project
  workflow: WorkflowDefinition
}

interface CreateRunInput {
  id: string
  project: Project
  workflow: WorkflowDefinition
  idea: string
  now: string
}

interface SqliteRunStoreDependencies {
  databasePath: string
  now?: () => string
  createId?: () => string
}

type SqlParams = Array<string | number | null>
type SqlCallback = (error: Error | null, row?: unknown) => void

class SqliteCompat {
  constructor(readonly inner: SqlJsDatabase) {}

  run(sql: string, params: SqlParams, callback: (this: { lastID: number; changes: number }, error: Error | null) => void): void {
    try {
      this.inner.run(sql, params)
      const result = this.inner.exec('SELECT last_insert_rowid() AS id')
      const lastID = Number(result[0]?.values[0]?.[0] ?? 0)
      callback.call({ lastID, changes: this.inner.getRowsModified() }, null)
    } catch (error) {
      callback.call({ lastID: 0, changes: 0 }, error instanceof Error ? error : new Error(String(error)))
    }
  }

  get(sql: string, params: SqlParams, callback: SqlCallback): void {
    try {
      const statement = this.inner.prepare(sql)
      statement.bind(params)
      const row = statement.step() ? statement.getAsObject() : undefined
      statement.free()
      callback(null, row)
    } catch (error) {
      callback(error instanceof Error ? error : new Error(String(error)))
    }
  }

  all(sql: string, params: SqlParams, callback: SqlCallback): void {
    try {
      const statement = this.inner.prepare(sql)
      statement.bind(params)
      const rows: unknown[] = []
      while (statement.step()) rows.push(statement.getAsObject())
      statement.free()
      callback(null, rows)
    } catch (error) {
      callback(error instanceof Error ? error : new Error(String(error)))
    }
  }

  close(): void {
    this.inner.close()
  }
}

async function persistDatabase(db: SqliteCompat, path: string): Promise<void> {
  const temporaryPath = `${path}.tmp`
  await writeFile(temporaryPath, Buffer.from(db.inner.export()))
  await rename(temporaryPath, path)
}

async function run(db: SqliteCompat, sql: string, params: SqlParams = []): Promise<{ lastID: number; changes: number }> {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(error) {
      if (error) reject(error)
      else resolve({ lastID: this.lastID, changes: this.changes })
    })
  })
}

function get<T>(db: SqliteCompat, sql: string, params: SqlParams = []): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (error, row) => error ? reject(error) : resolve(row as T | undefined))
  })
}

function all<T>(db: SqliteCompat, sql: string, params: SqlParams = []): Promise<T[]> {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (error, rows) => error ? reject(error) : resolve(rows as T[]))
  })
}

async function openDatabase(path: string): Promise<SqliteCompat> {
  await mkdir(dirname(path), { recursive: true })
  const require = createRequire(import.meta.url)
  const SQL = await initSqlJs({ locateFile: (file) => require.resolve(join('sql.js', 'dist', file)) })
  let contents: Uint8Array | undefined
  try {
    contents = new Uint8Array(await readFile(path))
  } catch (error) {
    if (!(error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT')) throw error
  }
  return new SqliteCompat(contents ? new SQL.Database(contents) : new SQL.Database())
}

async function closeDatabase(db: SqliteCompat, path: string): Promise<void> {
  await persistDatabase(db, path)
  db.close()
}

function json(value: unknown): string {
  return JSON.stringify(value)
}

function parseJson<T>(value: string): T {
  return JSON.parse(value) as T
}

function nextCursor(workflow: WorkflowDefinition, phaseIndex: number, stepIndex: number): { phaseIndex: number; stepIndex: number } | null {
  const phase = workflow.phases[phaseIndex]
  if (!phase) return null
  if (stepIndex + 1 < phase.steps.length) return { phaseIndex, stepIndex: stepIndex + 1 }
  if (phaseIndex + 1 < workflow.phases.length) return { phaseIndex: phaseIndex + 1, stepIndex: 0 }
  return null
}

function statusNextAction(status: WorkflowRunStatus): string {
  if (status === 'paused') return 'Workflow Run 已暂停。'
  if (status === 'waiting') return '等待用户处理当前 Step。'
  if (status === 'blocked') return 'Workflow Run 已 blocked，需要处理阻塞原因。'
  if (status === 'failed') return '当前 Step 失败，可重试。'
  if (status === 'cancelled') return 'Workflow Run 已取消。'
  if (status === 'completed') return 'Workflow Run 已完成。'
  return '等待 Runtime 完成当前 Step。'
}

export function createSqliteRunStore(dependencies: SqliteRunStoreDependencies) {
  const now = dependencies.now ?? (() => new Date().toISOString())
  const createId = dependencies.createId ?? randomUUID
  let db: SqliteCompat
  let operation = Promise.resolve()

  const ready = openDatabase(dependencies.databasePath).then(async (opened) => {
    db = opened
    await run(db, 'PRAGMA foreign_keys = ON')
    await run(db, `
      CREATE TABLE IF NOT EXISTS runs (
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
    await run(db, `
      CREATE TABLE IF NOT EXISTS run_snapshots (
        run_id TEXT PRIMARY KEY REFERENCES runs(id) ON DELETE CASCADE,
        phase_index INTEGER NOT NULL,
        step_index INTEGER NOT NULL,
        current_step_execution_id TEXT,
        pending_question TEXT,
        pending_approval TEXT,
        next_action TEXT NOT NULL
      )
    `)
    await run(db, `
      CREATE TABLE IF NOT EXISTS step_executions (
        id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
        phase_id TEXT NOT NULL,
        step_id TEXT NOT NULL,
        attempt INTEGER NOT NULL,
        status TEXT NOT NULL,
        error TEXT,
        output_json TEXT,
        started_at TEXT,
        finished_at TEXT,
        UNIQUE(run_id, step_id, attempt)
      )
    `)
    await run(db, `
      CREATE TABLE IF NOT EXISTS workflow_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
        type TEXT NOT NULL,
        data_json TEXT NOT NULL,
        created_at TEXT NOT NULL
      )
    `)
    await run(db, `
      CREATE TABLE IF NOT EXISTS artifacts (
        id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
        step_execution_id TEXT NOT NULL REFERENCES step_executions(id) ON DELETE CASCADE,
        type TEXT NOT NULL,
        name TEXT NOT NULL,
        location TEXT,
        version_hash TEXT,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL
      )
    `)
    await persistDatabase(db, dependencies.databasePath)
  })

  async function locked<T>(callback: () => Promise<T>): Promise<T> {
    const previous = operation
    let release!: () => void
    operation = new Promise<void>((resolve) => { release = resolve })
    await previous
    try {
      await ready
      return await callback()
    } finally {
      release()
    }
  }

  async function transaction<T>(callback: () => Promise<T>): Promise<T> {
    await run(db, 'BEGIN IMMEDIATE')
    try {
      const result = await callback()
      await run(db, 'COMMIT')
      await persistDatabase(db, dependencies.databasePath)
      return result
    } catch (error) {
      await run(db, 'ROLLBACK').catch(() => undefined)
      throw error
    }
  }

  async function load(id: string): Promise<StoredRun | null> {
    const row = await get<{
      id: string; project_id: string; workspace_path: string; idea: string; workflow_id: string; workflow_version: string;
      workflow_json: string; project_json: string; status: WorkflowRunStatus; error: string | null; created_at: string; updated_at: string
    }>(db, 'SELECT * FROM runs WHERE id = ?', [id])
    if (!row) return null
    const snapshotRow = await get<{
      phase_index: number; step_index: number; current_step_execution_id: string | null; pending_question: string | null;
      pending_approval: string | null; next_action: string
    }>(db, 'SELECT * FROM run_snapshots WHERE run_id = ?', [id])
    if (!snapshotRow) throw new Error(`Run Snapshot missing for ${id}`)
    const executions = await all<{
      id: string; run_id: string; phase_id: string; step_id: string; attempt: number; status: StepExecutionStatus;
      error: string | null; output_json: string | null; started_at: string | null; finished_at: string | null
    }>(db, 'SELECT * FROM step_executions WHERE run_id = ? ORDER BY rowid', [id])
    const events = await all<{ id: number; run_id: string; type: string; data_json: string; created_at: string }>(db, 'SELECT * FROM workflow_events WHERE run_id = ? ORDER BY id', [id])
    const artifacts = await all<{
      id: string; run_id: string; step_execution_id: string; type: string; name: string; location: string | null;
      version_hash: string | null; status: string; created_at: string
    }>(db, 'SELECT * FROM artifacts WHERE run_id = ? ORDER BY rowid', [id])
    const workflow = parseJson<WorkflowDefinition>(row.workflow_json)
    return {
      id: row.id,
      projectId: row.project_id,
      workspacePath: row.workspace_path,
      idea: row.idea,
      workflowId: row.workflow_id,
      workflowVersion: row.workflow_version,
      definition: workflow,
      status: row.status,
      error: row.error,
      snapshot: {
        phaseIndex: snapshotRow.phase_index,
        stepIndex: snapshotRow.step_index,
        currentStepExecutionId: snapshotRow.current_step_execution_id,
        pendingQuestion: snapshotRow.pending_question,
        pendingApproval: snapshotRow.pending_approval,
        nextAction: snapshotRow.next_action
      },
      stepExecutions: executions.map((execution) => ({
        id: execution.id, runId: execution.run_id, phaseId: execution.phase_id, stepId: execution.step_id,
        attempt: execution.attempt, status: execution.status, error: execution.error,
        output: execution.output_json ? parseJson<Record<string, unknown>>(execution.output_json) : null,
        startedAt: execution.started_at, finishedAt: execution.finished_at
      })),
      events: events.map((event) => ({ id: event.id, runId: event.run_id, type: event.type, data: parseJson(event.data_json), createdAt: event.created_at })),
      artifacts: artifacts.map((artifact) => ({
        id: artifact.id, runId: artifact.run_id, stepExecutionId: artifact.step_execution_id, type: artifact.type,
        name: artifact.name, location: artifact.location, versionHash: artifact.version_hash, status: artifact.status,
        createdAt: artifact.created_at
      })),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      project: parseJson<Project>(row.project_json),
      workflow
    }
  }

  async function appendEvent(runId: string, type: string, data: Record<string, unknown>, createdAt: string): Promise<void> {
    await run(db, 'INSERT INTO workflow_events (run_id, type, data_json, created_at) VALUES (?, ?, ?, ?)', [runId, type, json(data), createdAt])
  }

  async function updateSnapshot(runId: string, snapshot: RunSnapshot): Promise<void> {
    await run(db, `UPDATE run_snapshots SET phase_index = ?, step_index = ?, current_step_execution_id = ?, pending_question = ?, pending_approval = ?, next_action = ? WHERE run_id = ?`, [
      snapshot.phaseIndex, snapshot.stepIndex, snapshot.currentStepExecutionId, snapshot.pendingQuestion, snapshot.pendingApproval, snapshot.nextAction, runId
    ])
  }

  async function updateRunStatus(runId: string, status: WorkflowRunStatus, error: string | null, updatedAt: string): Promise<void> {
    await run(db, 'UPDATE runs SET status = ?, error = ?, updated_at = ? WHERE id = ?', [status, error, updatedAt, runId])
  }

  async function insertExecution(runId: string, workflow: WorkflowDefinition, phaseIndex: number, stepIndex: number, attempt: number, status: StepExecutionStatus, createdAt: string): Promise<string> {
    const step = workflow.phases[phaseIndex]?.steps[stepIndex]
    if (!step) throw new Error('Workflow Step 不存在。')
    const id = createId()
    await run(db, `INSERT INTO step_executions (id, run_id, phase_id, step_id, attempt, status, started_at) VALUES (?, ?, ?, ?, ?, ?, ?)`, [id, runId, workflow.phases[phaseIndex].id, step.id, attempt, status, createdAt])
    return id
  }

  return {
    ready,
    async createRun(input: CreateRunInput): Promise<StoredRun> {
      return locked(async () => transaction(async () => {
        const { id, project, workflow, idea, now: createdAt } = input
        await run(db, `INSERT INTO runs (id, project_id, workspace_path, idea, workflow_id, workflow_version, workflow_json, project_json, status, error, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
          id, project.id, project.workspacePath, idea, workflow.id, workflow.version, json(workflow), json(project), 'running', null, createdAt, createdAt
        ])
        const executionId = await insertExecution(id, workflow, 0, 0, 1, 'running', createdAt)
        const snapshot: RunSnapshot = { phaseIndex: 0, stepIndex: 0, currentStepExecutionId: executionId, pendingQuestion: null, pendingApproval: null, nextAction: statusNextAction('running') }
        await run(db, 'INSERT INTO run_snapshots (run_id, phase_index, step_index, current_step_execution_id, pending_question, pending_approval, next_action) VALUES (?, ?, ?, ?, ?, ?, ?)', [id, snapshot.phaseIndex, snapshot.stepIndex, snapshot.currentStepExecutionId, null, null, snapshot.nextAction])
        await appendEvent(id, 'started', { idea }, createdAt)
        await appendEvent(id, 'step_started', { executionId, phaseIndex: 0, stepIndex: 0, attempt: 1 }, createdAt)
        return (await load(id))!
      }))
    },

    async getRun(id: string): Promise<StoredRun | null> {
      return locked(() => load(id))
    },

    async listRuns(projectId: string): Promise<StoredRun[]> {
      return locked(async () => {
        const rows = await all<{ id: string }>(db, 'SELECT id FROM runs WHERE project_id = ? ORDER BY updated_at DESC', [projectId])
        const runs: StoredRun[] = []
        for (const row of rows) {
          const stored = await load(row.id)
          if (stored) runs.push(stored)
        }
        return runs
      })
    },

    async recordRuntimeResult(runId: string, executionId: string, result: RuntimeResult): Promise<StoredRun> {
      return locked(async () => transaction(async () => {
        const current = await load(runId)
        if (!current) throw new Error('找不到 Workflow Run。')
        if (current.snapshot.currentStepExecutionId !== executionId || current.status === 'cancelled') return current
        const timestamp = now()
        if (result.type === 'failed' || result.type === 'waiting' || result.type === 'blocked') {
          const status: StepExecutionStatus = result.type
          const error = result.type === 'failed' ? result.error : result.type === 'blocked' ? result.reason : null
          await run(db, 'UPDATE step_executions SET status = ?, error = ?, finished_at = ? WHERE id = ?', [status, error, result.type === 'waiting' ? null : timestamp, executionId])
          const runStatus = result.type === 'failed' ? 'failed' : result.type
          await updateRunStatus(runId, runStatus, error, timestamp)
          const snapshot = { ...current.snapshot, pendingQuestion: result.type === 'waiting' ? result.question : null, pendingApproval: null, nextAction: statusNextAction(runStatus) }
          await updateSnapshot(runId, snapshot)
          await appendEvent(runId, result.type, result.type === 'waiting' ? { question: result.question } : { reason: error }, timestamp)
          return (await load(runId))!
        }

        await run(db, 'UPDATE step_executions SET status = ?, output_json = ?, finished_at = ? WHERE id = ?', ['completed', result.output ? json(result.output) : null, timestamp, executionId])
        for (const artifact of result.artifacts ?? []) {
          await run(db, 'INSERT INTO artifacts (id, run_id, step_execution_id, type, name, location, version_hash, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', [
            createId(), runId, executionId, artifact.type, artifact.name, artifact.location ?? null, artifact.versionHash ?? null, artifact.status ?? 'available', timestamp
          ])
        }
        await appendEvent(runId, 'step_completed', { executionId, artifacts: result.artifacts?.map((artifact) => artifact.name) ?? [] }, timestamp)
        const cursor = nextCursor(current.workflow, current.snapshot.phaseIndex, current.snapshot.stepIndex)
        if (!cursor) {
          await updateRunStatus(runId, 'completed', null, timestamp)
          await updateSnapshot(runId, { ...current.snapshot, currentStepExecutionId: null, pendingQuestion: null, nextAction: statusNextAction('completed') })
          await appendEvent(runId, 'completed', {}, timestamp)
        } else if (current.status === 'paused') {
          await updateSnapshot(runId, { ...current.snapshot, ...cursor, currentStepExecutionId: null, nextAction: statusNextAction('paused') })
        } else {
          const nextExecutionId = await insertExecution(runId, current.workflow, cursor.phaseIndex, cursor.stepIndex, 1, 'running', timestamp)
          await updateSnapshot(runId, { ...current.snapshot, ...cursor, currentStepExecutionId: nextExecutionId, pendingQuestion: null, pendingApproval: null, nextAction: statusNextAction('running') })
          await appendEvent(runId, 'step_started', { executionId: nextExecutionId, phaseIndex: cursor.phaseIndex, stepIndex: cursor.stepIndex, attempt: 1 }, timestamp)
        }
        return (await load(runId))!
      }))
    },

    async setStatus(runId: string, status: 'paused' | 'cancelled'): Promise<StoredRun> {
      return locked(async () => transaction(async () => {
        const current = await load(runId)
        if (!current) throw new Error('找不到 Workflow Run。')
        if (status === 'paused' && current.status !== 'running') return current
        if (status === 'cancelled' && ['completed', 'cancelled'].includes(current.status)) return current
        const timestamp = now()
        await updateRunStatus(runId, status, null, timestamp)
        if (status === 'cancelled' && current.snapshot.currentStepExecutionId) await run(db, 'UPDATE step_executions SET status = ?, finished_at = ? WHERE id = ?', ['cancelled', timestamp, current.snapshot.currentStepExecutionId])
        await updateSnapshot(runId, { ...current.snapshot, nextAction: statusNextAction(status) })
        await appendEvent(runId, status, {}, timestamp)
        return (await load(runId))!
      }))
    },

    async resume(runId: string): Promise<StoredRun> {
      return locked(async () => transaction(async () => {
        const current = await load(runId)
        if (!current) throw new Error('找不到 Workflow Run。')
        if (!['paused', 'waiting', 'blocked'].includes(current.status)) return current
        const timestamp = now()
        let executionId = current.snapshot.currentStepExecutionId
        if (!executionId) executionId = await insertExecution(runId, current.workflow, current.snapshot.phaseIndex, current.snapshot.stepIndex, 1, 'running', timestamp)
        else await run(db, 'UPDATE step_executions SET status = ?, error = NULL, finished_at = NULL, started_at = ? WHERE id = ?', ['running', timestamp, executionId])
        await updateRunStatus(runId, 'running', null, timestamp)
        await updateSnapshot(runId, { ...current.snapshot, currentStepExecutionId: executionId, pendingQuestion: null, pendingApproval: null, nextAction: statusNextAction('running') })
        await appendEvent(runId, 'resumed', { executionId }, timestamp)
        return (await load(runId))!
      }))
    },

    async retry(runId: string): Promise<StoredRun> {
      return locked(async () => transaction(async () => {
        const current = await load(runId)
        if (!current) throw new Error('找不到 Workflow Run。')
        const failed = current.stepExecutions.find((execution) => execution.id === current.snapshot.currentStepExecutionId && execution.status === 'failed')
        if (!failed) return current
        const timestamp = now()
        const executionId = await insertExecution(runId, current.workflow, current.snapshot.phaseIndex, current.snapshot.stepIndex, failed.attempt + 1, 'running', timestamp)
        await updateRunStatus(runId, 'running', null, timestamp)
        await updateSnapshot(runId, { ...current.snapshot, currentStepExecutionId: executionId, pendingQuestion: null, pendingApproval: null, nextAction: statusNextAction('running') })
        await appendEvent(runId, 'step_retried', { previousExecutionId: failed.id, executionId, attempt: failed.attempt + 1 }, timestamp)
        await appendEvent(runId, 'step_started', { executionId, phaseIndex: current.snapshot.phaseIndex, stepIndex: current.snapshot.stepIndex, attempt: failed.attempt + 1 }, timestamp)
        return (await load(runId))!
      }))
    },

    async recoverableRuns(): Promise<StoredRun[]> {
      return locked(async () => {
        const rows = await all<{ id: string }>(db, "SELECT id FROM runs WHERE status IN ('running', 'waiting', 'blocked') ORDER BY updated_at", [])
        const runs: StoredRun[] = []
        for (const row of rows) {
          const stored = await load(row.id)
          if (stored) runs.push(stored)
        }
        return runs
      })
    },

    async close(): Promise<void> {
      await ready
      await operation
      await closeDatabase(db, dependencies.databasePath)
    }
  }
}
