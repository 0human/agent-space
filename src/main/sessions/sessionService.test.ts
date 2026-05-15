import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createDatabaseHandle, type DatabaseHandle } from '../db/client'
import { createRepositories } from '../db/repositories'
import { ProjectService } from '../projects/projectService'
import type { ProcessRunner, ProcessRunResult } from '../runtime'
import { SessionService } from './sessionService'

const handles: DatabaseHandle[] = []

class FakeProcessRunner implements ProcessRunner {
  constructor(private readonly result: ProcessRunResult) {}

  run(): Promise<ProcessRunResult> {
    return Promise.resolve(this.result)
  }
}

function createServices() {
  const dir = mkdtempSync(join(tmpdir(), 'agent-space-sessions-'))
  const handle = createDatabaseHandle(join(dir, 'test.sqlite'))
  const repositories = createRepositories(handle.db)
  handles.push(handle)

  return {
    repositories,
    projectService: new ProjectService(handle.db),
    sessionService: new SessionService(
      handle.db,
      new FakeProcessRunner({ exitCode: 0, stdout: 'assistant reply\n', stderr: '' })
    )
  }
}

function createServicesWithRunner(result: ProcessRunResult) {
  const dir = mkdtempSync(join(tmpdir(), 'agent-space-sessions-'))
  const handle = createDatabaseHandle(join(dir, 'test.sqlite'))
  const repositories = createRepositories(handle.db)
  handles.push(handle)

  return {
    repositories,
    projectService: new ProjectService(handle.db),
    sessionService: new SessionService(handle.db, new FakeProcessRunner(result))
  }
}

afterEach(() => {
  while (handles.length > 0) {
    handles.pop()?.sqlite.close()
  }
})

describe('SessionService', () => {
  it('creates a manual session and refreshes project metrics', () => {
    const { projectService, sessionService } = createServices()
    const project = projectService.create({
      name: 'Manual Project',
      localPath: '/tmp/manual-project'
    }).project

    const session = sessionService.create({
      projectId: project.id,
      title: 'Planning'
    })

    expect(session).toEqual(
      expect.objectContaining({
        title: 'Planning',
        assignmentMode: 'manual',
        activeAssigneeType: 'user',
        messageCount: 0
      })
    )
    expect(projectService.get(project.id).metrics?.activeSessionCount).toBe(1)
  })

  it('stores user messages without rewriting history', () => {
    const { projectService, sessionService } = createServices()
    const project = projectService.create({
      name: 'Message Project',
      localPath: '/tmp/message-project'
    }).project
    const session = sessionService.create({
      projectId: project.id,
      title: 'Build'
    })

    const first = sessionService.addMessage({
      workSessionId: session.id,
      content: 'Implement the session page.'
    })
    sessionService.addMessage({
      workSessionId: session.id,
      content: 'Keep this as a separate user turn.'
    })

    const messages = sessionService.listMessages({ workSessionId: session.id })

    expect(messages).toHaveLength(2)
    expect(messages[0]).toEqual(
      expect.objectContaining({
        id: first.id,
        role: 'user',
        content: 'Implement the session page.'
      })
    )
    expect(sessionService.get(session.id).messageCount).toBe(2)
  })

  it('archives a session and removes it from the default list', () => {
    const { projectService, sessionService } = createServices()
    const project = projectService.create({
      name: 'Archive Project',
      localPath: '/tmp/archive-project'
    }).project
    const session = sessionService.create({
      projectId: project.id,
      title: 'Old session'
    })

    const archived = sessionService.archive({ id: session.id })

    expect(archived.archivedAt).toBeTruthy()
    expect(sessionService.list()).toEqual([])
    expect(sessionService.list({ archived: true })).toHaveLength(1)
  })

  it('creates run, events, and assistant output when sending a message succeeds', async () => {
    const { repositories, projectService, sessionService } = createServices()
    const runtime = repositories.runtimes.create({
      name: 'Echo Runtime',
      provider: 'custom_cli',
      executablePath: '/bin/echo',
      defaultArgsJson: JSON.stringify(['assistant reply'])
    })
    const project = projectService.create({
      name: 'Run Project',
      localPath: '/tmp/run-project',
      defaultAiRuntimeConfigId: runtime.id
    }).project
    const session = sessionService.create({
      projectId: project.id,
      title: 'Run it'
    })

    const result = await sessionService.sendMessage({
      workSessionId: session.id,
      content: 'Say something'
    })

    expect(result.run.status).toBe('completed')
    expect(result.assistantMessage?.content).toBe('assistant reply')
    expect(sessionService.listRuns(session.id)).toHaveLength(1)
    expect(sessionService.listEvents(result.run.id)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'run_started' }),
        expect.objectContaining({ type: 'stdout', content: 'assistant reply' }),
        expect.objectContaining({ type: 'run_completed' })
      ])
    )
    expect(sessionService.get(session.id).status).toBe('completed')
  })

  it('records failed runs and error messages when execution fails', async () => {
    const { repositories, projectService, sessionService } = createServicesWithRunner({
      exitCode: 1,
      stdout: '',
      stderr: 'boom'
    })
    const runtime = repositories.runtimes.create({
      name: 'Fail Runtime',
      provider: 'custom_cli',
      executablePath: '/bin/false'
    })
    const project = projectService.create({
      name: 'Fail Project',
      localPath: '/tmp/fail-project',
      defaultAiRuntimeConfigId: runtime.id
    }).project
    const session = sessionService.create({
      projectId: project.id,
      title: 'Fail it'
    })

    const result = await sessionService.sendMessage({
      workSessionId: session.id,
      content: 'This should fail'
    })

    expect(result.run.status).toBe('failed')
    expect(result.run.errorSummary).toContain('boom')
    expect(result.assistantMessage?.content).toContain('boom')
    expect(sessionService.get(session.id).status).toBe('error')
  })
})
