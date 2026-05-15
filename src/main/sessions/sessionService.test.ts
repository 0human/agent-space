import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createDatabaseHandle, type DatabaseHandle } from '../db/client'
import { createRepositories } from '../db/repositories'
import { ProjectService } from '../projects/projectService'
import { SessionService } from './sessionService'

const handles: DatabaseHandle[] = []

function createServices() {
  const dir = mkdtempSync(join(tmpdir(), 'agent-space-sessions-'))
  const handle = createDatabaseHandle(join(dir, 'test.sqlite'))
  const repositories = createRepositories(handle.db)
  handles.push(handle)

  return {
    repositories,
    projectService: new ProjectService(handle.db),
    sessionService: new SessionService(handle.db)
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
})
