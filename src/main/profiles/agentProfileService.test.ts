import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createDatabaseHandle, type DatabaseHandle } from '../db/client'
import { createRepositories } from '../db/repositories'
import { PermissionService } from '../permissions/permissionService'
import { AgentProfileService } from './agentProfileService'

const handles: DatabaseHandle[] = []

function createServices() {
  const dir = mkdtempSync(join(tmpdir(), 'agent-space-profiles-'))
  const handle = createDatabaseHandle(join(dir, 'test.sqlite'))
  const permissionService = new PermissionService(handle.db)
  handles.push(handle)
  return {
    repositories: createRepositories(handle.db),
    permissionService,
    profileService: new AgentProfileService(handle.db, permissionService)
  }
}

afterEach(() => {
  while (handles.length > 0) {
    handles.pop()?.sqlite.close()
  }
})

describe('AgentProfileService', () => {
  it('creates profiles and binds selected permission policies', () => {
    const { repositories, permissionService, profileService } = createServices()
    const policy = permissionService.createPolicySet({
      name: 'Read',
      rules: [{ scope: 'filesystem', action: 'read', decision: 'allow' }]
    })

    const profile = profileService.create({
      name: 'Architect',
      description: 'Design reviewer',
      permissionPolicySetIds: [policy.id],
      defaultArgs: ['--model', 'gpt-5'],
      envWhitelist: ['PATH']
    })

    expect(profile.defaultArgs).toEqual(['--model', 'gpt-5'])
    expect(profile.envWhitelist).toEqual(['PATH'])
    expect(
      repositories.permissionPolicyBindings.listByOwner('agent_profile', profile.id)
    ).toHaveLength(1)
    expect(
      permissionService.resolvePreview({ agentProfileId: profile.id }).effectiveRules
    ).toHaveLength(1)
  })

  it('updates profiles without overwriting omitted optional fields', () => {
    const { profileService } = createServices()
    const profile = profileService.create({
      name: 'Developer',
      description: 'Writes code',
      defaultArgs: ['--fast']
    })

    const updated = profileService.update({ id: profile.id, name: 'Senior Developer' })

    expect(updated.name).toBe('Senior Developer')
    expect(updated.description).toBe('Writes code')
    expect(updated.defaultArgs).toEqual(['--fast'])
  })
})
