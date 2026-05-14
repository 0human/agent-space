import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createDatabaseHandle, type DatabaseHandle } from '../db/client'
import { createRepositories } from '../db/repositories'
import { PermissionService } from '../permissions/permissionService'
import { TeamService } from './teamService'

const handles: DatabaseHandle[] = []

function createServices() {
  const dir = mkdtempSync(join(tmpdir(), 'agent-space-teams-'))
  const handle = createDatabaseHandle(join(dir, 'test.sqlite'))
  const repositories = createRepositories(handle.db)
  handles.push(handle)

  return {
    repositories,
    permissionService: new PermissionService(handle.db),
    teamService: new TeamService(handle.db)
  }
}

afterEach(() => {
  while (handles.length > 0) {
    handles.pop()?.sqlite.close()
  }
})

describe('TeamService', () => {
  it('creates a team with a runtime-backed member and policy binding', () => {
    const { repositories, permissionService, teamService } = createServices()
    const runtime = repositories.runtimes.create({
      name: 'Codex',
      provider: 'codex_cli'
    })
    const policy = permissionService.createPolicySet({
      name: 'Project Write',
      rules: [{ scope: 'filesystem', action: 'write', decision: 'ask' }]
    })

    const team = teamService.create({
      name: 'Build Team',
      goal: 'Ship features',
      defaultLaunchMode: 'development',
      members: [
        {
          name: 'Developer',
          role: 'developer',
          runtimeConfigId: runtime.id,
          permissionPolicySetIds: [policy.id]
        }
      ]
    })

    expect(team.memberCount).toBe(1)
    expect(team.members[0]).toEqual(
      expect.objectContaining({
        name: 'Developer',
        runtimeName: 'Codex',
        runtimeProvider: 'codex_cli',
        enabled: true
      })
    )
    expect(
      repositories.permissionPolicyBindings.listByOwner('team_member', team.members[0].id)
    ).toHaveLength(1)
  })

  it('rejects team members that reference a missing runtime', () => {
    const { teamService } = createServices()

    expect(() =>
      teamService.create({
        name: 'Broken Team',
        members: [
          {
            name: 'Developer',
            role: 'developer',
            runtimeConfigId: 'missing-runtime'
          }
        ]
      })
    ).toThrow('Runtime not found for Team member.')
  })
})
