import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createDatabaseHandle, type DatabaseHandle } from '../db/client'
import { createRepositories } from '../db/repositories'
import { PermissionService } from './permissionService'

const handles: DatabaseHandle[] = []

function createService() {
  const dir = mkdtempSync(join(tmpdir(), 'agent-space-permissions-'))
  const handle = createDatabaseHandle(join(dir, 'test.sqlite'))
  handles.push(handle)
  return {
    handle,
    repositories: createRepositories(handle.db),
    service: new PermissionService(handle.db)
  }
}

afterEach(() => {
  while (handles.length > 0) {
    handles.pop()?.sqlite.close()
  }
})

describe('PermissionService', () => {
  it('initializes recommended policy templates once', () => {
    const { service } = createService()

    service.ensureRecommendedPolicySets()
    service.ensureRecommendedPolicySets()

    expect(service.listPolicySets().map((policy) => policy.name)).toEqual([
      'Project Read Only',
      'Project Safe Write',
      'Command Approval',
      'Git Safe',
      'Network Restricted',
      'Env Minimal',
      'Full Access'
    ])
  })

  it('merges additive, override, and restrictive policies by inheritance layer and priority', () => {
    const { repositories, service } = createService()
    const profile = repositories.agentProfiles.create({ name: 'Profile' })
    const runtime = repositories.runtimes.create({ name: 'Runtime', provider: 'codex_cli' })
    const project = repositories.projects.create({ name: 'Project', localPath: '/tmp/project' })
    const session = repositories.workSessions.create({
      projectId: project.id,
      title: 'Session',
      assignmentMode: 'runtime',
      activeAssigneeType: 'runtime',
      aiRuntimeConfigId: runtime.id
    })
    const allow = service.createPolicySet({
      name: 'Allow Shell',
      rules: [{ scope: 'command', action: 'execute', decision: 'allow', resources: ['pnpm test'] }]
    })
    const overrideAsk = service.createPolicySet({
      name: 'Ask Shell',
      rules: [{ scope: 'command', action: 'execute', decision: 'ask', resources: ['pnpm test'] }]
    })
    const restrictiveDeny = service.createPolicySet({
      name: 'Deny Shell',
      rules: [{ scope: 'command', action: 'execute', decision: 'deny', resources: ['pnpm test'] }]
    })
    const additiveNetwork = service.createPolicySet({
      name: 'Allow Localhost',
      rules: [{ scope: 'network', action: 'request', decision: 'allow', resources: ['localhost'] }]
    })

    service.bindPolicySet({
      ownerType: 'agent_profile',
      ownerId: profile.id,
      permissionPolicySetId: allow.id,
      mergeStrategy: 'additive',
      priority: 10
    })
    service.bindPolicySet({
      ownerType: 'runtime_config',
      ownerId: runtime.id,
      permissionPolicySetId: overrideAsk.id,
      mergeStrategy: 'override',
      priority: 1
    })
    service.bindPolicySet({
      ownerType: 'project',
      ownerId: project.id,
      permissionPolicySetId: restrictiveDeny.id,
      mergeStrategy: 'restrictive',
      priority: 1
    })
    service.bindPolicySet({
      ownerType: 'work_session',
      ownerId: session.id,
      permissionPolicySetId: additiveNetwork.id,
      mergeStrategy: 'additive',
      priority: 0
    })

    const preview = service.resolvePreview({
      agentProfileId: profile.id,
      runtimeConfigId: runtime.id,
      projectId: project.id,
      workSessionId: session.id
    })

    expect(preview.effectiveRules).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ scope: 'command', action: 'execute', decision: 'deny' }),
        expect.objectContaining({ scope: 'network', action: 'request', decision: 'allow' })
      ])
    )
    expect(preview.sources.map((source) => source.ownerType)).toEqual([
      'agent_profile',
      'runtime_config',
      'project',
      'work_session'
    ])
  })

  it('keeps same-layer bindings sorted by priority', () => {
    const { repositories, service } = createService()
    const profile = repositories.agentProfiles.create({ name: 'Profile' })
    const first = service.createPolicySet({
      name: 'First',
      rules: [{ scope: 'tool', action: 'request', decision: 'ask' }]
    })
    const second = service.createPolicySet({
      name: 'Second',
      rules: [{ scope: 'tool', action: 'approve', decision: 'allow' }]
    })

    service.bindPolicySet({
      ownerType: 'agent_profile',
      ownerId: profile.id,
      permissionPolicySetId: second.id,
      priority: 20
    })
    service.bindPolicySet({
      ownerType: 'agent_profile',
      ownerId: profile.id,
      permissionPolicySetId: first.id,
      priority: 10
    })

    expect(
      service
        .resolvePreview({ agentProfileId: profile.id })
        .sources.map((source) => source.policySetName)
    ).toEqual(['First', 'Second'])
  })
})
