import { existsSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createDatabaseHandle, type DatabaseHandle } from './client'
import { createRepositories } from './repositories'
import { createTransactionRunner } from './transaction'
import { recoverInterruptedRuns } from '../services/startupRecovery'

const handles: DatabaseHandle[] = []

function createTestHandle(): DatabaseHandle {
  const dir = mkdtempSync(join(tmpdir(), 'agent-space-db-'))
  const handle = createDatabaseHandle(join(dir, 'test.sqlite'))
  handles.push(handle)
  return handle
}

afterEach(() => {
  while (handles.length > 0) {
    handles.pop()?.sqlite.close()
  }
})

describe('database initialization', () => {
  it('creates the sqlite database and runs migrations once', () => {
    const handle = createTestHandle()

    expect(existsSync(handle.path)).toBe(true)

    const migrations = handle.sqlite.prepare('SELECT COUNT(*) AS count FROM schema_migrations').get() as {
      count: number
    }

    expect(migrations.count).toBe(1)
  })

  it('can run migrations repeatedly without changing existing data', () => {
    const handle = createTestHandle()
    const repositories = createRepositories(handle.db)

    repositories.runtimes.create({
      name: 'Codex',
      provider: 'codex_cli',
      executablePath: 'codex'
    })

    handle.sqlite.close()
    const reopened = createDatabaseHandle(handle.path)
    handles.push(reopened)

    expect(createRepositories(reopened.db).runtimes.list()).toHaveLength(1)
  })
})

describe('repositories', () => {
  it('creates and reads the core records', () => {
    const handle = createTestHandle()
    const repositories = createRepositories(handle.db)

    const runtime = repositories.runtimes.create({
      name: 'Custom',
      provider: 'custom_cli',
      executablePath: '/usr/bin/env'
    })

    const project = repositories.projects.create({
      name: 'Agent Space',
      localPath: '/tmp/agent-space',
      defaultAiRuntimeConfigId: runtime.id
    })

    const session = repositories.workSessions.create({
      projectId: project.id,
      title: 'Planning',
      assignmentMode: 'runtime',
      activeAssigneeType: 'runtime',
      aiRuntimeConfigId: runtime.id
    })

    repositories.messages.create({
      workSessionId: session.id,
      role: 'user',
      content: 'hello'
    })

    expect(repositories.runtimes.getById(runtime.id)?.name).toBe('Custom')
    expect(repositories.projects.getById(project.id)?.mode).toBe('manual')
    expect(repositories.workSessions.listByProject(project.id)).toHaveLength(1)
    expect(repositories.messages.listBySession(session.id)).toHaveLength(1)
  })

  it('rolls back all writes when a transaction fails', () => {
    const handle = createTestHandle()
    const transaction = createTransactionRunner(handle.db)

    expect(() => {
      transaction((repositories) => {
        repositories.runtimes.create({
          name: 'Rollback Runtime',
          provider: 'custom_cli'
        })
        throw new Error('stop')
      })
    }).toThrow('stop')

    expect(createRepositories(handle.db).runtimes.list()).toHaveLength(0)
  })
})

describe('startup recovery', () => {
  it('marks active runs as interrupted and running sessions as error', () => {
    const handle = createTestHandle()
    const repositories = createRepositories(handle.db)
    const runtime = repositories.runtimes.create({
      name: 'Custom',
      provider: 'custom_cli',
      executablePath: 'custom'
    })
    const project = repositories.projects.create({
      name: 'Recovery',
      localPath: '/tmp/recovery'
    })
    const session = repositories.workSessions.create({
      projectId: project.id,
      title: 'Interrupted session',
      status: 'running',
      assignmentMode: 'runtime',
      activeAssigneeType: 'runtime',
      aiRuntimeConfigId: runtime.id
    })
    const run = repositories.runtimeRuns.create({
      workSessionId: session.id,
      runtimeConfigId: runtime.id,
      provider: 'custom_cli',
      status: 'running',
      startedAt: new Date().toISOString()
    })

    const result = recoverInterruptedRuns(handle.db)

    expect(result).toEqual({
      interruptedRunCount: 1,
      erroredSessionCount: 1
    })
    expect(repositories.runtimeRuns.listBySession(session.id)[0].status).toBe('interrupted')
    expect(repositories.workSessions.getById(session.id)?.status).toBe('error')
    expect(recoverInterruptedRuns(handle.db).interruptedRunCount).toBe(0)
    expect(repositories.runtimeRuns.listBySession(session.id)[0].id).toBe(run.id)
  })
})
