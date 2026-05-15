import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createDatabaseHandle, type DatabaseHandle } from '../db/client'
import { createRepositories } from '../db/repositories'
import { ProjectService } from './projectService'

const handles: DatabaseHandle[] = []

function createServices() {
  const dir = mkdtempSync(join(tmpdir(), 'agent-space-projects-'))
  const handle = createDatabaseHandle(join(dir, 'test.sqlite'))
  const repositories = createRepositories(handle.db)
  handles.push(handle)

  return {
    repositories,
    projectService: new ProjectService(handle.db)
  }
}

afterEach(() => {
  while (handles.length > 0) {
    handles.pop()?.sqlite.close()
  }
})

describe('ProjectService', () => {
  it('creates a manual project and initializes metrics', () => {
    const { projectService } = createServices()

    const result = projectService.create({
      name: 'Manual Project',
      localPath: '/tmp/manual-project'
    })

    expect(result.project).toEqual(
      expect.objectContaining({
        name: 'Manual Project',
        mode: 'manual',
        phase: 'requirements',
        riskStatus: 'normal'
      })
    )
    expect(result.project.metrics).toEqual(
      expect.objectContaining({
        activeSessionCount: 0,
        runningAgentCount: 0,
        waitingInputCount: 0,
        waitingPermissionCount: 0,
        errorSessionCount: 0,
        fileChangeCount: 0
      })
    )
  })

  it('infers team mode when a default team is selected', () => {
    const { repositories, projectService } = createServices()
    const team = repositories.teams.create({
      name: 'Delivery Team'
    })

    const result = projectService.create({
      name: 'Team Project',
      localPath: '/tmp/team-project',
      defaultAiTeamId: team.id
    })

    expect(result.project.mode).toBe('team')
    expect(result.project.defaultAiTeamId).toBe(team.id)
  })

  it('keeps runtime-backed projects in manual mode', () => {
    const { repositories, projectService } = createServices()
    const runtime = repositories.runtimes.create({
      name: 'Codex',
      provider: 'codex_cli'
    })

    const result = projectService.create({
      name: 'Runtime Project',
      localPath: '/tmp/runtime-project',
      defaultAiRuntimeConfigId: runtime.id
    })

    expect(result.project.mode).toBe('manual')
    expect(result.project.defaultAiRuntimeConfigId).toBe(runtime.id)
  })

  it('rejects choosing both a default team and runtime', () => {
    const { projectService } = createServices()

    expect(() =>
      projectService.create({
        name: 'Invalid Project',
        localPath: '/tmp/invalid-project',
        defaultAiTeamId: 'team-id',
        defaultAiRuntimeConfigId: 'runtime-id'
      })
    ).toThrow('defaultAiTeamId and defaultAiRuntimeConfigId are mutually exclusive.')
  })

  it('creates the first work session when requested', () => {
    const { repositories, projectService } = createServices()

    const result = projectService.create({
      name: 'Session Later',
      localPath: '/tmp/session-later',
      postCreateAction: 'open_first_session'
    })

    expect(result.createdSessionId).toBeTruthy()
    expect(repositories.projects.getById(result.project.id)).toBeTruthy()
    expect(repositories.workSessions.listByProject(result.project.id)).toEqual([
      expect.objectContaining({
        id: result.createdSessionId,
        title: 'Session Later Session',
        assignmentMode: 'manual',
        activeAssigneeType: 'user'
      })
    ])
  })

  it('archives a project and its sessions when requested', () => {
    const { repositories, projectService } = createServices()
    const project = projectService.create({
      name: 'Archive Me',
      localPath: '/tmp/archive-me'
    }).project
    const session = repositories.workSessions.create({
      projectId: project.id,
      title: 'Planning',
      assignmentMode: 'manual',
      activeAssigneeType: 'user'
    })

    const archived = projectService.archive({ id: project.id, archiveSessions: true })

    expect(archived.archivedAt).toBeTruthy()
    expect(repositories.workSessions.getById(session.id)?.archivedAt).toBeTruthy()
  })
})
