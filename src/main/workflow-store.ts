import { randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import initSqlJs, { type Database as SqlJsDatabase } from 'sql.js'

import type { Project } from '../shared/project'
import type {
  RuntimeArtifact,
  RuntimeEvent,
  RuntimeLocator,
  RunSnapshot,
  DecisionRecord,
  PhaseContext,
  RunBlocker,
  PendingApproval,
  PendingQuestion,
  StepExecutionStatus,
  WorkflowLog,
  WorkflowRun,
  WorkflowRunStatus
} from '../shared/workflow-run'
import type { WorkflowDefinition, WorkflowSource } from '../shared/workflow'
import { zhCNMain } from '../shared/i18n/zh-CN'
import type { RunWorkspaceManager } from './run-workspace'

interface StoredRun extends WorkflowRun {
  project: Project
  workflow: WorkflowDefinition
}

interface CreateRunInput {
  id: string
  project: Project
  workflow: WorkflowDefinition
  workflowSource: { source: WorkflowSource; path: string | null }
  idea: string
  now: string
}

interface SqliteRunStoreDependencies {
  databasePath: string
  now?: () => string
  createId?: () => string
  runWorkspaceManager?: RunWorkspaceManager
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
  const sanitize = (candidate: unknown): unknown => {
    if (typeof candidate === 'string') {
      return candidate
        .replace(/(https?:\/\/)([^/@\s]+)@/gi, '$1<redacted>@')
        .replace(/(bearer\s+)[A-Za-z0-9._~+\/-]+/gi, '$1<redacted>')
        .replace(/((?:token|secret|password|authorization)[=:]\s*)[^\s,;]+/gi, '$1<redacted>')
    }
    if (Array.isArray(candidate)) return candidate.map(sanitize)
    if (candidate && typeof candidate === 'object') return Object.fromEntries(Object.entries(candidate).map(([key, value]) => [key, sanitize(value)]))
    return candidate
  }
  return JSON.stringify(sanitize(value))
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

const PLANNING_SKIP_REASON = '根据规格结果跳过 Planning。'

function conditionResult(condition: string | undefined, current: StoredRun): { satisfied: boolean; reason: string } {
  if (!condition) return { satisfied: true, reason: '' }
  if (condition === 'planning.required') {
    const specification = [...current.artifacts].reverse().find((artifact) => artifact.type === 'specification' || artifact.name === 'specification')
    if (!specification) return { satisfied: true, reason: '' }
    const skipped = ['skip-planning', 'small-work', 'not-required'].includes(specification.status)
    return skipped ? { satisfied: false, reason: PLANNING_SKIP_REASON } : { satisfied: true, reason: '' }
  }
  if (condition === 'specification.ready') {
    const specification = [...current.artifacts].reverse().find((artifact) => artifact.type === 'specification' || artifact.name === 'specification')
    const ready = specification?.status === 'ready' || specification?.status === 'available'
    return ready ? { satisfied: true, reason: '' } : { satisfied: false, reason: '规格尚未就绪，跳过当前 Step。' }
  }
  if (condition === 'project.release.enabled') {
    const release = (current.project as Project & { release?: { enabled?: boolean } }).release
    return release?.enabled === true ? { satisfied: true, reason: '' } : { satisfied: false, reason: 'Project 未启用 Release，跳过当前 Step。' }
  }
  if (condition === 'project.remote.present') {
    return current.project.remote ? { satisfied: true, reason: '' } : { satisfied: false, reason: 'Project 没有 remote，已完成本地 Git delivery。' }
  }
  return { satisfied: true, reason: '' }
}

function statusNextAction(status: WorkflowRunStatus): string {
  const copy = zhCNMain.workflowRun.nextAction
  return copy[status]
}

function resolveRuntimeEvents(events: RuntimeEvent[]):
  | { type: 'completed'; output?: Record<string, unknown>; artifacts: RuntimeArtifact[] }
  | { type: 'waiting'; question: string | null; approval: string | null }
  | { type: 'blocked'; reason: string }
  | { type: 'failed'; error: string } {
  const artifacts = events.filter((event): event is Extract<RuntimeEvent, { type: 'artifact_produced' }> => event.type === 'artifact_produced').map((event) => event.artifact)
  const error = events.find((event): event is Extract<RuntimeEvent, { type: 'error' }> => event.type === 'error')
  if (error && /merge conflict|冲突/i.test(error.error)) return { type: 'blocked', reason: error.error }
  if (error) return { type: 'failed', error: error.error }
  const question = events.find((event): event is Extract<RuntimeEvent, { type: 'question' }> => event.type === 'question')
  if (question) return { type: 'waiting', question: question.question, approval: null }
  const approval = events.find((event): event is Extract<RuntimeEvent, { type: 'approval_required' }> => event.type === 'approval_required')
  if (approval) return { type: 'waiting', question: null, approval: approval.approval }
  const blocked = events.find((event): event is Extract<RuntimeEvent, { type: 'status_changed' }> => event.type === 'status_changed' && event.status === 'blocked')
  if (blocked) return { type: 'blocked', reason: blocked.reason ?? zhCNMain.workflowRun.runtimeBlocked }
  const status = events.find((event): event is Extract<RuntimeEvent, { type: 'status_changed' }> => event.type === 'status_changed')
  if (!status || status.status !== 'completed') return { type: 'failed', error: zhCNMain.workflowRun.runtimeInvalid }
  const toolCall = events.find((event): event is Extract<RuntimeEvent, { type: 'tool_call' }> => event.type === 'tool_call')
  const text = events.filter((event): event is Extract<RuntimeEvent, { type: 'text_delta' }> => event.type === 'text_delta').map((event) => event.text).join('')
  return { type: 'completed', output: toolCall || text ? { ...(toolCall ? { toolCall } : {}), ...(text ? { text } : {}) } : undefined, artifacts }
}

function runtimeLogMessage(event: RuntimeEvent): string {
  switch (event.type) {
    case 'text_delta': return event.text
    case 'tool_call': return event.name
    case 'question': return event.question
    case 'approval_required': return event.approval
    case 'artifact_produced': return event.artifact.name
    case 'status_changed': return event.status
    case 'error': return event.error
  }
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
        base_commit TEXT,
        branch TEXT,
        pull_request_json TEXT,
        workflow_json TEXT NOT NULL,
        workflow_source_json TEXT,
        project_json TEXT NOT NULL,
        status TEXT NOT NULL,
        error TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `)
    const runColumns = await all<{ name: string }>(db, 'PRAGMA table_info(runs)')
    const existingRunColumns = new Set(runColumns.map((column) => column.name))
    if (!existingRunColumns.has('workflow_source_json')) await run(db, 'ALTER TABLE runs ADD COLUMN workflow_source_json TEXT')
    if (!existingRunColumns.has('base_commit')) await run(db, 'ALTER TABLE runs ADD COLUMN base_commit TEXT')
    if (!existingRunColumns.has('branch')) await run(db, 'ALTER TABLE runs ADD COLUMN branch TEXT')
    if (!existingRunColumns.has('pull_request_json')) await run(db, 'ALTER TABLE runs ADD COLUMN pull_request_json TEXT')
    await run(db, `
      CREATE TABLE IF NOT EXISTS run_snapshots (
        run_id TEXT PRIMARY KEY REFERENCES runs(id) ON DELETE CASCADE,
        phase_index INTEGER NOT NULL,
        step_index INTEGER NOT NULL,
        current_step_execution_id TEXT,
        pending_question TEXT,
        pending_approval TEXT,
        pending_question_details TEXT,
        pending_approval_details TEXT,
        blocked_by TEXT,
        next_action TEXT NOT NULL
      )
    `)
    const snapshotColumns = await all<{ name: string }>(db, 'PRAGMA table_info(run_snapshots)')
    const existingSnapshotColumns = new Set(snapshotColumns.map((column) => column.name))
    if (!existingSnapshotColumns.has('pending_question_details')) await run(db, 'ALTER TABLE run_snapshots ADD COLUMN pending_question_details TEXT')
    if (!existingSnapshotColumns.has('pending_approval_details')) await run(db, 'ALTER TABLE run_snapshots ADD COLUMN pending_approval_details TEXT')
    if (!existingSnapshotColumns.has('blocked_by')) await run(db, 'ALTER TABLE run_snapshots ADD COLUMN blocked_by TEXT')
    await run(db, `
      CREATE TABLE IF NOT EXISTS step_executions (
        id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
        phase_id TEXT NOT NULL,
        step_id TEXT NOT NULL,
        attempt INTEGER NOT NULL,
        idempotency_key TEXT,
        status TEXT NOT NULL,
        input_json TEXT NOT NULL,
        skill_name TEXT,
        skill_version TEXT,
        runtime_session_id TEXT,
        runtime_locator_json TEXT,
        error TEXT,
        output_json TEXT,
        started_at TEXT,
        finished_at TEXT,
        UNIQUE(run_id, step_id, attempt)
      )
    `)
    const executionColumns = await all<{ name: string }>(db, 'PRAGMA table_info(step_executions)')
    const existingExecutionColumns = new Set(executionColumns.map((column) => column.name))
    if (!existingExecutionColumns.has('input_json')) await run(db, "ALTER TABLE step_executions ADD COLUMN input_json TEXT NOT NULL DEFAULT '{}'")
    if (!existingExecutionColumns.has('idempotency_key')) await run(db, 'ALTER TABLE step_executions ADD COLUMN idempotency_key TEXT')
    if (!existingExecutionColumns.has('skill_name')) await run(db, 'ALTER TABLE step_executions ADD COLUMN skill_name TEXT')
    if (!existingExecutionColumns.has('skill_version')) await run(db, 'ALTER TABLE step_executions ADD COLUMN skill_version TEXT')
    if (!existingExecutionColumns.has('runtime_session_id')) await run(db, 'ALTER TABLE step_executions ADD COLUMN runtime_session_id TEXT')
    if (!existingExecutionColumns.has('runtime_locator_json')) await run(db, 'ALTER TABLE step_executions ADD COLUMN runtime_locator_json TEXT')
    await run(db, `
      CREATE TABLE IF NOT EXISTS workflow_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
        type TEXT NOT NULL,
        idempotency_key TEXT,
        data_json TEXT NOT NULL,
        created_at TEXT NOT NULL
      )
    `)
    const eventColumns = await all<{ name: string }>(db, 'PRAGMA table_info(workflow_events)')
    if (!new Set(eventColumns.map((column) => column.name)).has('idempotency_key')) await run(db, 'ALTER TABLE workflow_events ADD COLUMN idempotency_key TEXT')
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
        idempotency_key TEXT,
        created_at TEXT NOT NULL
      )
    `)
    const artifactColumns = await all<{ name: string }>(db, 'PRAGMA table_info(artifacts)')
    if (!new Set(artifactColumns.map((column) => column.name)).has('idempotency_key')) await run(db, 'ALTER TABLE artifacts ADD COLUMN idempotency_key TEXT')
    await run(db, 'CREATE UNIQUE INDEX IF NOT EXISTS artifacts_run_idempotency_key ON artifacts(run_id, idempotency_key) WHERE idempotency_key IS NOT NULL')
    await run(db, `
      CREATE TABLE IF NOT EXISTS workflow_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
        execution_id TEXT NOT NULL REFERENCES step_executions(id) ON DELETE CASCADE,
        type TEXT NOT NULL,
        message TEXT NOT NULL,
        data_json TEXT NOT NULL,
        idempotency_key TEXT,
        created_at TEXT NOT NULL
      )
    `)
    const logColumns = await all<{ name: string }>(db, 'PRAGMA table_info(workflow_logs)')
    if (!new Set(logColumns.map((column) => column.name)).has('idempotency_key')) await run(db, 'ALTER TABLE workflow_logs ADD COLUMN idempotency_key TEXT')
    await run(db, 'CREATE UNIQUE INDEX IF NOT EXISTS workflow_events_run_idempotency_key ON workflow_events(run_id, idempotency_key) WHERE idempotency_key IS NOT NULL')
    await run(db, 'CREATE UNIQUE INDEX IF NOT EXISTS workflow_logs_run_idempotency_key ON workflow_logs(run_id, idempotency_key) WHERE idempotency_key IS NOT NULL')
    await run(db, `
      CREATE TABLE IF NOT EXISTS phase_contexts (
        id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
        phase_id TEXT NOT NULL,
        content TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(run_id, phase_id)
      )
    `)
    await run(db, `
      CREATE TABLE IF NOT EXISTS decision_records (
        id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
        phase_id TEXT NOT NULL,
        step_id TEXT NOT NULL,
        execution_id TEXT NOT NULL REFERENCES step_executions(id) ON DELETE CASCADE,
        source TEXT NOT NULL,
        question TEXT NOT NULL,
        answer TEXT NOT NULL,
        continuation_json TEXT NOT NULL,
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
      base_commit: string | null; branch: string | null; pull_request_json: string | null;
      workflow_json: string; project_json: string; status: WorkflowRunStatus; error: string | null; created_at: string; updated_at: string
      workflow_source_json: string | null
    }>(db, 'SELECT * FROM runs WHERE id = ?', [id])
    if (!row) return null
    const snapshotRow = await get<{
      phase_index: number; step_index: number; current_step_execution_id: string | null; pending_question: string | null;
      pending_approval: string | null; pending_question_details: string | null; pending_approval_details: string | null; blocked_by: string | null; next_action: string
    }>(db, 'SELECT * FROM run_snapshots WHERE run_id = ?', [id])
    if (!snapshotRow) throw new Error(`Run Snapshot missing for ${id}`)
    const executions = await all<{
      id: string; run_id: string; phase_id: string; step_id: string; attempt: number; idempotency_key: string | null; status: StepExecutionStatus; input_json: string;
      skill_name: string | null; skill_version: string | null; runtime_session_id: string | null; runtime_locator_json: string | null;
      error: string | null; output_json: string | null; started_at: string | null; finished_at: string | null
    }>(db, 'SELECT * FROM step_executions WHERE run_id = ? ORDER BY rowid', [id])
    const events = await all<{ id: number; run_id: string; type: string; idempotency_key: string | null; data_json: string; created_at: string }>(db, 'SELECT * FROM workflow_events WHERE run_id = ? ORDER BY id', [id])
    const artifacts = await all<{
      id: string; run_id: string; step_execution_id: string; type: string; name: string; location: string | null;
      version_hash: string | null; status: string; idempotency_key: string | null; created_at: string
    }>(db, 'SELECT * FROM artifacts WHERE run_id = ? ORDER BY rowid', [id])
    const logs = await all<{
      id: number; run_id: string; execution_id: string; type: WorkflowLog['type']; message: string; data_json: string; idempotency_key: string | null; created_at: string
    }>(db, 'SELECT * FROM workflow_logs WHERE run_id = ? ORDER BY id', [id])
    const phaseContexts = await all<{
      id: string; run_id: string; phase_id: string; content: string; updated_at: string
    }>(db, 'SELECT * FROM phase_contexts WHERE run_id = ? ORDER BY rowid', [id])
    const decisionRecords = await all<{
      id: string; run_id: string; phase_id: string; step_id: string; execution_id: string; source: DecisionRecord['source']; question: string; answer: string; continuation_json: string; created_at: string
    }>(db, 'SELECT * FROM decision_records WHERE run_id = ? ORDER BY rowid', [id])
    const project = parseJson<Project>(row.project_json)
    const workflow = parseJson<WorkflowDefinition>(row.workflow_json)
    return {
      id: row.id,
      projectId: row.project_id,
      workspacePath: row.workspace_path,
      remote: project.remote,
      idea: row.idea,
      workflowId: row.workflow_id,
      workflowVersion: row.workflow_version,
      workflowSource: row.workflow_source_json ? parseJson<StoredRun['workflowSource']>(row.workflow_source_json) : { source: 'project', id: workflow.id, version: workflow.version, path: null },
      baseCommit: row.base_commit,
      branch: row.branch,
      pullRequest: row.pull_request_json ? parseJson<WorkflowRun['pullRequest']>(row.pull_request_json) ?? null : null,
      definition: workflow,
      status: row.status,
      error: row.error,
      snapshot: {
        phaseIndex: snapshotRow.phase_index,
        stepIndex: snapshotRow.step_index,
        currentStepExecutionId: snapshotRow.current_step_execution_id,
        pendingQuestion: snapshotRow.pending_question,
        pendingApproval: snapshotRow.pending_approval,
        pendingQuestionDetails: snapshotRow.pending_question_details ? parseJson<PendingQuestion>(snapshotRow.pending_question_details) : null,
        pendingApprovalDetails: snapshotRow.pending_approval_details ? parseJson<PendingApproval>(snapshotRow.pending_approval_details) : null,
        blockedBy: snapshotRow.blocked_by ? parseJson<RunBlocker>(snapshotRow.blocked_by) : null,
        nextAction: snapshotRow.next_action
      },
      stepExecutions: executions.map((execution) => ({
        id: execution.id, runId: execution.run_id, phaseId: execution.phase_id, stepId: execution.step_id,
        attempt: execution.attempt, idempotencyKey: execution.idempotency_key ?? `${execution.run_id}:${execution.phase_id}:${execution.step_id}:attempt-${execution.attempt}`, status: execution.status, input: parseJson<Record<string, unknown>>(execution.input_json),
        skill: execution.skill_name && execution.skill_version ? { name: execution.skill_name, version: execution.skill_version } : null,
        runtimeLocator: execution.runtime_locator_json ? parseJson(execution.runtime_locator_json) : null,
        runtimeSessionId: execution.runtime_session_id,
        error: execution.error,
        output: execution.output_json ? parseJson<Record<string, unknown>>(execution.output_json) : null,
        startedAt: execution.started_at, finishedAt: execution.finished_at
      })),
      events: events.map((event) => ({ id: event.id, runId: event.run_id, type: event.type, data: parseJson(event.data_json), idempotencyKey: event.idempotency_key, createdAt: event.created_at })),
      logs: logs.map((log): WorkflowLog => ({ id: log.id, runId: log.run_id, executionId: log.execution_id, type: log.type, message: log.message, data: parseJson(log.data_json), idempotencyKey: log.idempotency_key, createdAt: log.created_at })),
      phaseContexts: phaseContexts.map((context): PhaseContext => ({ id: context.id, runId: context.run_id, phaseId: context.phase_id, content: context.content, updatedAt: context.updated_at })),
      decisionRecords: decisionRecords.map((record): DecisionRecord => ({ id: record.id, runId: record.run_id, phaseId: record.phase_id, stepId: record.step_id, executionId: record.execution_id, source: record.source, question: record.question, answer: record.answer, continuation: parseJson(record.continuation_json), createdAt: record.created_at })),
      artifacts: artifacts.map((artifact) => ({
        id: artifact.id, runId: artifact.run_id, stepExecutionId: artifact.step_execution_id, type: artifact.type,
        name: artifact.name, location: artifact.location, versionHash: artifact.version_hash, status: artifact.status, idempotencyKey: artifact.idempotency_key,
        createdAt: artifact.created_at
      })),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      project,
      workflow
    }
  }

  async function appendEvent(runId: string, type: string, data: Record<string, unknown>, createdAt: string, idempotencyKey?: string): Promise<void> {
    const key = idempotencyKey ?? (typeof data.idempotencyKey === 'string' ? data.idempotencyKey : `event:${runId}:${type}:${json(data)}`)
    await run(db, 'INSERT INTO workflow_events (run_id, type, idempotency_key, data_json, created_at) SELECT ?, ?, ?, ?, ? WHERE ? IS NULL OR NOT EXISTS (SELECT 1 FROM workflow_events WHERE run_id = ? AND idempotency_key = ?)', [runId, type, key, json(data), createdAt, key, runId, key])
  }

  async function appendRuntimeRecords(current: StoredRun, executionId: string, events: RuntimeEvent[], createdAt: string): Promise<void> {
    for (const [index, event] of events.entries()) {
      const idempotencyKey = event.idempotencyKey ?? `${executionId}:runtime:${index}:${createdAt}`
      await run(db, 'INSERT INTO workflow_logs (run_id, execution_id, type, message, data_json, idempotency_key, created_at) SELECT ?, ?, ?, ?, ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM workflow_logs WHERE run_id = ? AND idempotency_key = ?)', [
        current.id, executionId, event.type, runtimeLogMessage(event), json(event), idempotencyKey, createdAt, current.id, idempotencyKey
      ])
    }

    const sessionId = events.find((event) => event.sessionId)?.sessionId
    if (sessionId) await run(db, 'UPDATE step_executions SET runtime_session_id = ? WHERE id = ?', [sessionId, executionId])
    const runtimeLocator = events.find((event) => event.runtimeLocator)?.runtimeLocator
    if (runtimeLocator) await run(db, 'UPDATE step_executions SET runtime_locator_json = ?, runtime_session_id = ? WHERE id = ?', [json(runtimeLocator), runtimeLocator.threadId, executionId])

    const content = events
      .filter((event): event is Extract<RuntimeEvent, { type: 'text_delta' }> => event.type === 'text_delta')
      .map((event) => event.text)
      .join('')
      .trim()
    if (!content) return

    const phaseId = current.workflow.phases[current.snapshot.phaseIndex]?.id
    if (!phaseId) return
    const existing = await get<{ id: string; content: string }>(db, 'SELECT id, content FROM phase_contexts WHERE run_id = ? AND phase_id = ?', [current.id, phaseId])
    if (existing) {
      await run(db, 'UPDATE phase_contexts SET content = ?, updated_at = ? WHERE id = ?', [`${existing.content}\n${content}`.trim(), createdAt, existing.id])
    } else {
      await run(db, 'INSERT INTO phase_contexts (id, run_id, phase_id, content, updated_at) VALUES (?, ?, ?, ?, ?)', [createId(), current.id, phaseId, content, createdAt])
    }
  }

  async function appendArtifacts(runId: string, executionId: string, artifacts: RuntimeArtifact[], createdAt: string): Promise<void> {
    for (const artifact of artifacts) {
      const externalWorkflowArtifact = ['specification', 'ticket', 'tickets', 'decision-record'].includes(artifact.type) && /^https:\/\/github\.com\//i.test(artifact.location ?? '')
      if (externalWorkflowArtifact && artifact.runId !== runId) continue
      const idempotencyKey = artifact.idempotencyKey ?? `artifact:${runId}:${artifact.type}:${artifact.name}:${artifact.location ?? ''}`
      const existing = await get<{ id: string }>(db, 'SELECT id FROM artifacts WHERE run_id = ? AND (idempotency_key = ? OR (idempotency_key IS NULL AND name = ? AND location IS ?)) LIMIT 1', [runId, idempotencyKey, artifact.name, artifact.location ?? null])
      if (existing) {
        await run(db, 'UPDATE artifacts SET type = ?, step_execution_id = ?, name = ?, location = ?, version_hash = ?, status = ?, idempotency_key = ? WHERE id = ?', [
          artifact.type, executionId, artifact.name, artifact.location ?? null, artifact.versionHash ?? null, artifact.status ?? 'available', idempotencyKey, existing.id
        ])
        continue
      }
      await run(db, 'INSERT INTO artifacts (id, run_id, step_execution_id, type, name, location, version_hash, status, idempotency_key, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [
        createId(), runId, executionId, artifact.type, artifact.name, artifact.location ?? null, artifact.versionHash ?? null, artifact.status ?? 'available', idempotencyKey, createdAt
      ])
    }
  }

  async function registerArtifact(runId: string, executionId: string, artifact: RuntimeArtifact): Promise<void> {
    await locked(async () => transaction(async () => {
      await appendArtifacts(runId, executionId, [artifact], now())
    }))
  }

  async function markDeliveryFailed(runId: string, executionId: string, error: string): Promise<void> {
    await locked(async () => transaction(async () => {
      const current = await load(runId)
      if (!current) throw new Error('找不到 Workflow Run。')
      const timestamp = now()
      await run(db, 'UPDATE step_executions SET status = ?, error = ?, finished_at = ? WHERE id = ?', ['failed', error, timestamp, executionId])
      await updateRunStatus(runId, 'failed', error, timestamp)
      await updateSnapshot(runId, { ...current.snapshot, currentStepExecutionId: executionId, pendingQuestion: null, pendingApproval: null, pendingQuestionDetails: null, pendingApprovalDetails: null, blockedBy: null, nextAction: statusNextAction('failed') })
      await appendEvent(runId, 'failed', { executionId, error }, timestamp)
    }))
  }

  async function appendDecisionRecord(current: StoredRun, executionId: string, source: DecisionRecord['source'], question: string, answer: string, continuation: DecisionRecord['continuation'], createdAt: string): Promise<void> {
    const execution = current.stepExecutions.find((candidate) => candidate.id === executionId)
    if (!execution) throw new Error('Workflow Step Execution 不存在。')
    await run(db, 'INSERT INTO decision_records (id, run_id, phase_id, step_id, execution_id, source, question, answer, continuation_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [
      createId(), current.id, execution.phaseId, execution.stepId, executionId, source, question, answer, json(continuation), createdAt
    ])
  }

  async function updateSnapshot(runId: string, snapshot: RunSnapshot): Promise<void> {
    await run(db, `UPDATE run_snapshots SET phase_index = ?, step_index = ?, current_step_execution_id = ?, pending_question = ?, pending_approval = ?, pending_question_details = ?, pending_approval_details = ?, blocked_by = ?, next_action = ? WHERE run_id = ?`, [
      snapshot.phaseIndex, snapshot.stepIndex, snapshot.currentStepExecutionId, snapshot.pendingQuestion, snapshot.pendingApproval, snapshot.pendingQuestionDetails ? json(snapshot.pendingQuestionDetails) : null, snapshot.pendingApprovalDetails ? json(snapshot.pendingApprovalDetails) : null, snapshot.blockedBy ? json(snapshot.blockedBy) : null, snapshot.nextAction, runId
    ])
  }

  async function updateRunStatus(runId: string, status: WorkflowRunStatus, error: string | null, updatedAt: string): Promise<void> {
    await run(db, 'UPDATE runs SET status = ?, error = ?, updated_at = ? WHERE id = ?', [status, error, updatedAt, runId])
  }

  async function insertExecution(runId: string, workflow: WorkflowDefinition, phaseIndex: number, stepIndex: number, attempt: number, status: StepExecutionStatus, createdAt: string, input: Record<string, unknown> = {}): Promise<string> {
    const step = workflow.phases[phaseIndex]?.steps[stepIndex]
    if (!step) throw new Error('Workflow Step 不存在。')
    const id = createId()
    await run(db, `INSERT INTO step_executions (id, run_id, phase_id, step_id, attempt, idempotency_key, status, input_json, skill_name, skill_version, runtime_session_id, started_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [id, runId, workflow.phases[phaseIndex].id, step.id, attempt, `${runId}:${workflow.phases[phaseIndex].id}:${step.id}:attempt-${attempt}`, status, json(input), step.skill?.name ?? null, step.skill?.version ?? null, null, createdAt])
    return id
  }

  return {
    ready,
    async createRun(input: CreateRunInput): Promise<StoredRun> {
      return locked(async () => transaction(async () => {
        const { id, project, workflow, idea, now: createdAt } = input
        const workspace = dependencies.runWorkspaceManager
          ? await dependencies.runWorkspaceManager.prepare(project, id)
          : { workspacePath: project.workspacePath, baseCommit: null, branch: null }
        const runProject = { ...project, workspacePath: workspace.workspacePath }
        await run(db, `INSERT INTO runs (id, project_id, workspace_path, idea, workflow_id, workflow_version, base_commit, branch, pull_request_json, workflow_json, workflow_source_json, project_json, status, error, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
          id, project.id, workspace.workspacePath, idea, workflow.id, workflow.version, workspace.baseCommit, workspace.branch, null, json(workflow), json({ ...input.workflowSource, id: workflow.id, version: workflow.version }), json(runProject), 'running', null, createdAt, createdAt
        ])
        const executionId = await insertExecution(id, workflow, 0, 0, 1, 'running', createdAt, { idea })
        const snapshot: RunSnapshot = { phaseIndex: 0, stepIndex: 0, currentStepExecutionId: executionId, pendingQuestion: null, pendingApproval: null, pendingQuestionDetails: null, pendingApprovalDetails: null, blockedBy: null, nextAction: statusNextAction('running') }
        await run(db, 'INSERT INTO run_snapshots (run_id, phase_index, step_index, current_step_execution_id, pending_question, pending_approval, pending_question_details, pending_approval_details, blocked_by, next_action) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [id, snapshot.phaseIndex, snapshot.stepIndex, snapshot.currentStepExecutionId, null, null, null, null, null, snapshot.nextAction])
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

    async recordRuntimeResult(runId: string, executionId: string, events: RuntimeEvent[]): Promise<StoredRun> {
      return locked(async () => transaction(async () => {
        const current = await load(runId)
        if (!current) throw new Error('找不到 Workflow Run。')
        if (current.snapshot.currentStepExecutionId !== executionId || current.status === 'cancelled') return current
        const timestamp = now()
        await appendRuntimeRecords(current, executionId, events, timestamp)
        const result = resolveRuntimeEvents(events)
        const declaredApproval = current.workflow.phases[current.snapshot.phaseIndex]?.steps[current.snapshot.stepIndex]?.approvalGate
        const alreadyApproved = current.events.some((event) => event.type === 'approval_approved' && event.data.executionId === executionId)
        if (result.type === 'completed') await appendArtifacts(runId, executionId, result.artifacts, timestamp)
        if (result.type === 'completed' && declaredApproval && !alreadyApproved) {
          await run(db, 'UPDATE step_executions SET status = ?, finished_at = NULL WHERE id = ?', ['waiting', executionId])
          await updateRunStatus(runId, 'waiting', null, timestamp)
          const continuation = { phaseIndex: current.snapshot.phaseIndex, stepIndex: current.snapshot.stepIndex, executionId }
          await updateSnapshot(runId, { ...current.snapshot, pendingQuestion: null, pendingApproval: declaredApproval, pendingQuestionDetails: null, pendingApprovalDetails: { approval: declaredApproval, decision: null, continuation }, blockedBy: null, nextAction: statusNextAction('waiting') })
          await appendEvent(runId, 'waiting', { approval: declaredApproval }, timestamp)
          return (await load(runId))!
        }
        if (result.type !== 'completed') {
          const artifacts = events.filter((event): event is Extract<RuntimeEvent, { type: 'artifact_produced' }> => event.type === 'artifact_produced').map((event) => event.artifact)
          await appendArtifacts(runId, executionId, artifacts, timestamp)
        }
        if (result.type === 'failed' || result.type === 'waiting' || result.type === 'blocked') {
          const status: StepExecutionStatus = result.type
          const error = result.type === 'failed' ? result.error : result.type === 'blocked' ? result.reason : null
          await run(db, 'UPDATE step_executions SET status = ?, error = ?, finished_at = ? WHERE id = ?', [status, error, result.type === 'waiting' ? null : timestamp, executionId])
          const runStatus = result.type === 'failed' ? 'failed' : result.type
          await updateRunStatus(runId, runStatus, error, timestamp)
          const continuation = { phaseIndex: current.snapshot.phaseIndex, stepIndex: current.snapshot.stepIndex, executionId }
          const pendingQuestionDetails = result.type === 'waiting' && result.question ? { question: result.question, answer: null, continuation } : null
          const pendingApprovalDetails = result.type === 'waiting' && result.approval ? { approval: result.approval, decision: null, continuation } : null
          const blockedBy = result.type === 'blocked' ? { ...continuation, reason: result.reason } : null
          const snapshot = { ...current.snapshot, pendingQuestion: result.type === 'waiting' ? result.question : null, pendingApproval: result.type === 'waiting' ? result.approval : null, pendingQuestionDetails, pendingApprovalDetails, blockedBy, nextAction: statusNextAction(runStatus) }
          await updateSnapshot(runId, snapshot)
          await appendEvent(runId, result.type, result.type === 'waiting'
            ? { ...(result.question ? { question: result.question } : {}), ...(result.approval ? { approval: result.approval } : {}) }
            : { executionId, reason: error }, timestamp, `event:${runId}:${result.type}:${executionId}`)
          return (await load(runId))!
        }

        await run(db, 'UPDATE step_executions SET status = ?, output_json = ?, finished_at = ? WHERE id = ?', ['completed', result.output ? json(result.output) : null, timestamp, executionId])
        await appendEvent(runId, 'step_completed', { executionId, artifacts: result.artifacts?.map((artifact) => artifact.name) ?? [] }, timestamp)
        const completedRun = (await load(runId))!
        let cursor = nextCursor(completedRun.workflow, completedRun.snapshot.phaseIndex, completedRun.snapshot.stepIndex)
        while (cursor) {
          const step = completedRun.workflow.phases[cursor.phaseIndex]?.steps[cursor.stepIndex]
          const result = conditionResult(step?.condition, { ...completedRun, snapshot: { ...completedRun.snapshot, ...cursor } })
          if (result.satisfied) break
          const skippedExecutionId = await insertExecution(runId, completedRun.workflow, cursor.phaseIndex, cursor.stepIndex, 1, 'skipped', timestamp)
          await run(db, 'UPDATE step_executions SET output_json = ?, finished_at = ? WHERE id = ?', [json({ reason: result.reason }), timestamp, skippedExecutionId])
          await appendEvent(runId, 'step_skipped', { executionId: skippedExecutionId, stepId: step?.id ?? null, phaseIndex: cursor.phaseIndex, stepIndex: cursor.stepIndex, reason: result.reason }, timestamp)
          cursor = nextCursor(completedRun.workflow, cursor.phaseIndex, cursor.stepIndex)
        }
        if (!cursor) {
          await updateRunStatus(runId, 'completed', null, timestamp)
          await updateSnapshot(runId, { ...current.snapshot, currentStepExecutionId: null, pendingQuestion: null, pendingApproval: null, pendingQuestionDetails: null, pendingApprovalDetails: null, blockedBy: null, nextAction: statusNextAction('completed') })
          await appendEvent(runId, 'completed', {}, timestamp)
        } else if (current.status === 'paused') {
          await updateSnapshot(runId, { ...current.snapshot, ...cursor, currentStepExecutionId: null, pendingQuestion: null, pendingApproval: null, pendingQuestionDetails: null, pendingApprovalDetails: null, blockedBy: null, nextAction: statusNextAction('paused') })
        } else {
          const nextExecutionId = await insertExecution(runId, completedRun.workflow, cursor.phaseIndex, cursor.stepIndex, 1, 'running', timestamp)
          await updateSnapshot(runId, { ...current.snapshot, ...cursor, currentStepExecutionId: nextExecutionId, pendingQuestion: null, pendingApproval: null, pendingQuestionDetails: null, pendingApprovalDetails: null, blockedBy: null, nextAction: statusNextAction('running') })
          await appendEvent(runId, 'step_started', { executionId: nextExecutionId, phaseIndex: cursor.phaseIndex, stepIndex: cursor.stepIndex, attempt: 1 }, timestamp)
        }
        return (await load(runId))!
      }))
    },

    async recordRuntimeLocator(runId: string, executionId: string, runtimeLocator: RuntimeLocator): Promise<void> {
      await locked(async () => transaction(async () => {
        await run(db, 'UPDATE step_executions SET runtime_locator_json = ?, runtime_session_id = ? WHERE id = ? AND run_id = ?', [json(runtimeLocator), runtimeLocator.threadId, executionId, runId])
      }))
    },

    async registerArtifact(runId: string, executionId: string, artifact: RuntimeArtifact): Promise<void> {
      await registerArtifact(runId, executionId, artifact)
    },

    async setPullRequest(runId: string, pullRequest: WorkflowRun['pullRequest']): Promise<StoredRun> {
      return locked(async () => transaction(async () => {
        const current = await load(runId)
        if (!current) throw new Error('找不到 Workflow Run。')
        const timestamp = now()
        const comparable = (state: WorkflowRun['pullRequest']): string | null => state ? json({ ...state, updatedAt: null }) : null
        const previous = comparable(current.pullRequest)
        const next = comparable(pullRequest)
        const persisted = pullRequest ? json(pullRequest) : null
        await run(db, 'UPDATE runs SET pull_request_json = ?, updated_at = ? WHERE id = ?', [persisted, timestamp, runId])
        if (previous !== next) await appendEvent(runId, 'pull_request_updated', pullRequest ? { number: pullRequest.number, url: pullRequest.url, canMerge: pullRequest.gate.canMerge } : {}, timestamp)
        return (await load(runId))!
      }))
    },

    async markDeliveryFailed(runId: string, executionId: string, error: string): Promise<void> {
      await markDeliveryFailed(runId, executionId, error)
    },

    async requestApproval(runId: string, executionId: string, approval: string): Promise<StoredRun> {
      return locked(async () => transaction(async () => {
        const current = await load(runId)
        if (!current) throw new Error('找不到 Workflow Run。')
        if (current.snapshot.currentStepExecutionId !== executionId || current.status !== 'running') return current
        if (current.events.some((event) => event.type === 'approval_approved' && event.data.executionId === executionId)) return current
        const timestamp = now()
        await run(db, 'UPDATE step_executions SET status = ?, finished_at = NULL WHERE id = ?', ['waiting', executionId])
        await updateRunStatus(runId, 'waiting', null, timestamp)
        const continuation = { phaseIndex: current.snapshot.phaseIndex, stepIndex: current.snapshot.stepIndex, executionId }
        await updateSnapshot(runId, { ...current.snapshot, pendingQuestion: null, pendingApproval: approval, pendingQuestionDetails: null, pendingApprovalDetails: { approval, decision: null, continuation }, blockedBy: null, nextAction: statusNextAction('waiting') })
        await appendEvent(runId, 'waiting', { approval }, timestamp)
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
        await updateSnapshot(runId, { ...current.snapshot, blockedBy: status === 'cancelled' ? null : current.snapshot.blockedBy, nextAction: statusNextAction(status) })
        await appendEvent(runId, status, {}, timestamp)
        return (await load(runId))!
      }))
    },

    async resume(runId: string): Promise<StoredRun> {
      return locked(async () => transaction(async () => {
        const current = await load(runId)
        if (!current) throw new Error('找不到 Workflow Run。')
        if (!['paused', 'waiting', 'blocked'].includes(current.status)) return current
        if (current.status === 'waiting' && (current.snapshot.pendingQuestionDetails || current.snapshot.pendingApprovalDetails)) return current
        const timestamp = now()
        let executionId = current.snapshot.currentStepExecutionId
        if (!executionId) executionId = await insertExecution(runId, current.workflow, current.snapshot.phaseIndex, current.snapshot.stepIndex, 1, 'running', timestamp)
        else await run(db, 'UPDATE step_executions SET status = ?, error = NULL, finished_at = NULL, started_at = ? WHERE id = ?', ['running', timestamp, executionId])
        await updateRunStatus(runId, 'running', null, timestamp)
        await updateSnapshot(runId, { ...current.snapshot, currentStepExecutionId: executionId, pendingQuestion: null, pendingApproval: null, pendingQuestionDetails: null, pendingApprovalDetails: null, blockedBy: null, nextAction: statusNextAction('running') })
        await appendEvent(runId, 'resumed', { executionId }, timestamp)
        return (await load(runId))!
      }))
    },

    async retry(runId: string): Promise<StoredRun> {
      return locked(async () => transaction(async () => {
        const current = await load(runId)
        if (!current) throw new Error('找不到 Workflow Run。')
        const failed = current.stepExecutions.find((execution) => execution.id === current.snapshot.currentStepExecutionId && execution.status === 'failed')
        const skipped = failed ? null : [...current.stepExecutions].reverse().find((execution) => execution.status === 'skipped')
        const previous = failed ?? skipped
        if (!previous) return current
        const timestamp = now()
        const phaseIndex = current.workflow.phases.findIndex((phase) => phase.id === previous.phaseId)
        const stepIndex = current.workflow.phases[phaseIndex]?.steps.findIndex((step) => step.id === previous.stepId) ?? -1
        if (phaseIndex < 0 || stepIndex < 0) return current
        const executionId = await insertExecution(runId, current.workflow, phaseIndex, stepIndex, previous.attempt + 1, 'running', timestamp)
        await updateRunStatus(runId, 'running', null, timestamp)
        await updateSnapshot(runId, { ...current.snapshot, phaseIndex, stepIndex, currentStepExecutionId: executionId, pendingQuestion: null, pendingApproval: null, pendingQuestionDetails: null, pendingApprovalDetails: null, blockedBy: null, nextAction: statusNextAction('running') })
        await appendEvent(runId, 'step_retried', { previousExecutionId: previous.id, executionId, attempt: previous.attempt + 1 }, timestamp)
        await appendEvent(runId, 'step_started', { executionId, phaseIndex, stepIndex, attempt: previous.attempt + 1 }, timestamp)
        return (await load(runId))!
      }))
    },

    async answerQuestion(runId: string, answer: string): Promise<StoredRun> {
      return locked(async () => transaction(async () => {
        const current = await load(runId)
        if (!current) throw new Error('找不到 Workflow Run。')
        const pending = current.snapshot.pendingQuestionDetails
        if (current.status !== 'waiting' || !pending || !current.snapshot.pendingQuestion) return current
        if (!answer.trim()) throw new Error('回答不能为空。')
        const timestamp = now()
        await appendDecisionRecord(current, pending.continuation.executionId, 'runtime-question', pending.question, answer.trim(), pending.continuation, timestamp)
        await run(db, 'UPDATE step_executions SET status = ?, input_json = ?, error = NULL, finished_at = NULL, started_at = ? WHERE id = ?', ['running', json({ ...current.stepExecutions.find((execution) => execution.id === pending.continuation.executionId)?.input, answer: answer.trim() }), timestamp, pending.continuation.executionId])
        await updateRunStatus(runId, 'running', null, timestamp)
        await updateSnapshot(runId, { ...current.snapshot, currentStepExecutionId: pending.continuation.executionId, pendingQuestion: null, pendingApproval: null, pendingQuestionDetails: { ...pending, answer: answer.trim() }, pendingApprovalDetails: null, blockedBy: null, nextAction: statusNextAction('running') })
        await appendEvent(runId, 'question_answered', { executionId: pending.continuation.executionId, answer: answer.trim(), continuation: pending.continuation }, timestamp)
        return (await load(runId))!
      }))
    },

    async decideApproval(runId: string, decision: 'approved' | 'rejected'): Promise<StoredRun> {
      return locked(async () => transaction(async () => {
        const current = await load(runId)
        if (!current) throw new Error('找不到 Workflow Run。')
        const pending = current.snapshot.pendingApprovalDetails
        if (current.status !== 'waiting' || !pending || !current.snapshot.pendingApproval) return current
        const timestamp = now()
        const executionId = pending.continuation.executionId
        await appendDecisionRecord(current, executionId, 'approval-gate', pending.approval, decision, pending.continuation, timestamp)
        if (decision === 'rejected') {
          await run(db, 'UPDATE step_executions SET status = ?, error = ?, finished_at = ? WHERE id = ?', ['cancelled', 'Approval Gate 已拒绝，未执行对应副作用。', timestamp, executionId])
          await updateRunStatus(runId, 'cancelled', 'Approval Gate 已拒绝，未执行对应副作用。', timestamp)
          await updateSnapshot(runId, { ...current.snapshot, pendingApprovalDetails: { ...pending, decision }, pendingApproval: null, pendingQuestion: null, pendingQuestionDetails: null, blockedBy: null, currentStepExecutionId: null, nextAction: statusNextAction('cancelled') })
          await appendEvent(runId, 'approval_rejected', { executionId, continuation: pending.continuation }, timestamp)
        } else {
          await run(db, 'UPDATE step_executions SET status = ?, error = NULL, finished_at = NULL, started_at = ? WHERE id = ?', ['running', timestamp, executionId])
          await updateRunStatus(runId, 'running', null, timestamp)
          await updateSnapshot(runId, { ...current.snapshot, pendingApprovalDetails: { ...pending, decision }, pendingApproval: null, pendingQuestion: null, pendingQuestionDetails: null, blockedBy: null, currentStepExecutionId: executionId, nextAction: statusNextAction('running') })
          await appendEvent(runId, 'approval_approved', { executionId, continuation: pending.continuation }, timestamp)
        }
        return (await load(runId))!
      }))
    },

    async recoverableRuns(): Promise<StoredRun[]> {
      return locked(async () => {
        const rows = await all<{ id: string }>(db, "SELECT id FROM runs WHERE status IN ('running', 'waiting', 'blocked', 'completed') ORDER BY updated_at", [])
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
