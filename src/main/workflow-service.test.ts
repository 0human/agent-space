// @vitest-environment node

import { describe, expect, it } from 'vitest'
import { join } from 'node:path'

import { BUILT_IN_DEVELOPMENT_WORKFLOW, BUILT_IN_SKILL_MANIFESTS } from '../shared/workflow'
import { createWorkflowService, validateWorkflow } from './workflow-service'

describe('Workflow service', () => {
  it('returns a read-only built-in workflow with machine-readable skill manifests', async () => {
    const service = createWorkflowService({
      readFile: async () => '',
      writeFile: async () => undefined,
      mkdir: async () => undefined,
      manifests: BUILT_IN_SKILL_MANIFESTS
    })

    const view = await service.getBuiltIn()

    expect(view.source).toBe('built-in')
    expect(view.path).toBeNull()
    expect(view.definition).toEqual(BUILT_IN_DEVELOPMENT_WORKFLOW)
    expect(view.validation.valid).toBe(true)
    expect(view.canStart).toBe(true)
    expect(BUILT_IN_SKILL_MANIFESTS[1]).toMatchObject({ name: 'implement', entry: 'skills/implement/SKILL.md' })
  })

  it('returns the continuously running Development Workflow with product-level Verification', async () => {
    const service = createWorkflowService({
      readFile: async () => '',
      writeFile: async () => undefined,
      mkdir: async () => undefined,
      manifests: BUILT_IN_SKILL_MANIFESTS
    })

    const view = await service.getBuiltIn()
    const requirements = view.definition.phases.find((phase) => phase.id === 'requirements')
    const planning = view.definition.phases.find((phase) => phase.id === 'planning')
    const implementation = view.definition.phases.find((phase) => phase.id === 'implementation')
    const verification = view.definition.phases.find((phase) => phase.id === 'verification')

    expect(view).toMatchObject({ source: 'built-in', canStart: true, validation: { valid: true } })
    expect(requirements?.steps.every((step) => !step.approvalGate)).toBe(true)
    expect(planning?.steps.every((step) => !step.approvalGate)).toBe(true)
    expect(implementation?.steps).toEqual([
      expect.objectContaining({ skill: { name: 'implement', version: '1.0.0' }, approvalGate: '高风险写操作确认' })
    ])
    expect(verification?.steps).toEqual([
      expect.objectContaining({ skill: { name: 'product-verification', version: '1.0.0' } })
    ])
    expect(view.skillManifests).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'product-verification', entry: 'skills/product-verification/SKILL.md' })
    ]))
  })

  it('rejects missing skills, unsupported versions, permissions, and embedded prompts', () => {
    const result = validateWorkflow({
      schemaVersion: 2,
      id: 'broken',
      name: 'Broken',
      version: '1.0.0',
      prompt: 'must not be accepted',
      phases: [{
        id: 'phase', name: 'Phase', goal: 'goal', steps: [{
          id: 'step', name: 'Step', kind: 'skill',
          skill: { name: 'missing-skill', version: '9.0.0' },
          approvalGate: '危险操作'
        }, {
          id: 'permission-step', name: 'Permission Step', kind: 'skill',
          skill: { name: 'implement', version: '1.0.0' }
        }]
      }]
    } as never, BUILT_IN_SKILL_MANIFESTS, [])

    expect(result.valid).toBe(false)
    expect(result.errors).toEqual(expect.arrayContaining([
      expect.stringContaining('schemaVersion'),
      expect.stringContaining('missing-skill'),
      expect.stringContaining('权限'),
      expect.stringContaining('prompt')
    ]))
  })

  it('rejects invalid step field types from externally edited workflow files', () => {
    const result = validateWorkflow({
      ...BUILT_IN_DEVELOPMENT_WORKFLOW,
      phases: [{
        id: 'phase',
        name: 'Phase',
        goal: 'Goal',
        steps: [{
          id: 'step',
          name: 'Step',
          kind: 'human',
          artifacts: 'not-an-array',
          condition: 42,
          approvalGate: false
        }]
      }]
    }, BUILT_IN_SKILL_MANIFESTS)

    expect(result.valid).toBe(false)
    expect(result.errors).toEqual(expect.arrayContaining([
      expect.stringContaining('artifacts'),
      expect.stringContaining('condition'),
      expect.stringContaining('approvalGate')
    ]))
  })

  it('copies the built-in workflow and reloads edited project files', async () => {
    let stored = ''
    const service = createWorkflowService({
      readFile: async () => stored || (() => { throw Object.assign(new Error('missing'), { code: 'ENOENT' }) })(),
      writeFile: async (_path, data) => { stored = data },
      mkdir: async () => undefined,
      manifests: BUILT_IN_SKILL_MANIFESTS
    })

    const copied = await service.copyToProject('/work/demo', ['workspace.read', 'workspace.write', 'git.commit', 'network.github'])
    expect(copied.source).toBe('project')
    expect(copied.path).toBe(join('/work/demo', '.agent-space', 'workflow.json'))
    expect(JSON.parse(stored)).toEqual({
      ...BUILT_IN_DEVELOPMENT_WORKFLOW,
      derivedFrom: { id: 'development-workflow', version: '1.0.0' }
    })

    const edited = { ...JSON.parse(stored), name: 'Edited Workflow' }
    stored = JSON.stringify(edited)
    const reloaded = await service.loadProject('/work/demo', ['workspace.read', 'workspace.write', 'git.commit', 'network.github'])
    expect(reloaded.definition.name).toBe('Edited Workflow')
    expect(reloaded.validation.valid).toBe(true)
  })

  it('does not permit a run when the project workflow is invalid', async () => {
    const service = createWorkflowService({
      readFile: async () => JSON.stringify({ schemaVersion: 1, id: 'broken', name: 'Broken', version: '1.0.0', phases: [] }),
      writeFile: async () => undefined,
      mkdir: async () => undefined,
      manifests: BUILT_IN_SKILL_MANIFESTS
    })

    await expect(service.startProjectRun('/work/demo', [])).resolves.toEqual({
      ok: false,
      error: expect.stringContaining('校验失败')
    })
  })

  it('rejects a Project Workflow that loses its source version', async () => {
    const service = createWorkflowService({
      readFile: async () => JSON.stringify(BUILT_IN_DEVELOPMENT_WORKFLOW),
      writeFile: async () => undefined,
      mkdir: async () => undefined,
      manifests: BUILT_IN_SKILL_MANIFESTS
    })

    const workflow = await service.loadProject('/work/demo', ['workspace.read', 'workspace.write', 'git.commit', 'network.github'])
    expect(workflow.canStart).toBe(false)
    expect(workflow.validation.errors).toContain('Project Workflow 必须保留有效的 derivedFrom 来源版本。')
  })

  it('rejects a Project Workflow with a mismatched source version', async () => {
    const service = createWorkflowService({
      readFile: async () => JSON.stringify({
        ...BUILT_IN_DEVELOPMENT_WORKFLOW,
        derivedFrom: { id: BUILT_IN_DEVELOPMENT_WORKFLOW.id, version: '9.9.9' }
      }),
      writeFile: async () => undefined,
      mkdir: async () => undefined,
      manifests: BUILT_IN_SKILL_MANIFESTS
    })

    const workflow = await service.loadProject('/work/demo', ['workspace.read', 'workspace.write', 'git.commit', 'network.github'])
    expect(workflow.canStart).toBe(false)
    expect(workflow.validation.errors).toContain('Project Workflow 必须保留有效的 derivedFrom 来源版本。')
  })

  it('returns actionable validation for malformed externally edited files', async () => {
    const service = createWorkflowService({
      readFile: async () => '{not-json',
      writeFile: async () => undefined,
      mkdir: async () => undefined,
      manifests: BUILT_IN_SKILL_MANIFESTS
    })

    const reloaded = await service.loadProject('/work/demo', [])
    expect(reloaded.canStart).toBe(false)
    expect(reloaded.definition.phases).toEqual([])
    expect(reloaded.validation.errors).toEqual([expect.stringContaining('JSON')])
  })

  it('rejects a referenced Skill when a manifest dependency is unavailable', () => {
    const service = createWorkflowService({
      readFile: async () => '',
      writeFile: async () => undefined,
      mkdir: async () => undefined,
      manifests: [{
        name: 'implement', version: '1.0.0', entry: 'skills/implement/SKILL.md',
        dependencies: ['tdd'], supportedRuntimes: ['codex'], capabilities: [],
        requiredPermissions: []
      }]
    })

    const result = service.validate({
      schemaVersion: 1, id: 'workflow', name: 'Workflow', version: '1.0.0',
      phases: [{ id: 'phase', name: 'Phase', goal: 'Goal', steps: [{
        id: 'step', name: 'Step', kind: 'skill', skill: { name: 'implement', version: '1.0.0' }
      }] }]
    })
    expect(result.errors).toContain('Skill implement 缺少依赖 tdd。')
  })

  it('loads Installed Skill manifests when a Project Workflow is copied after installation', async () => {
    const installed = [{ name: 'external', version: '1.0.0', entry: 'skills/external/SKILL.md', dependencies: [], supportedRuntimes: ['codex'], capabilities: ['question'], requiredPermissions: ['workspace.read'] }]
    const service = createWorkflowService({
      readFile: async () => '',
      writeFile: async () => undefined,
      mkdir: async () => undefined,
      manifests: BUILT_IN_SKILL_MANIFESTS,
      getManifests: () => [...BUILT_IN_SKILL_MANIFESTS, ...installed]
    })

    const result = await service.getBuiltIn()

    expect(result.skillManifests).toEqual(expect.arrayContaining([expect.objectContaining({ name: 'external', version: '1.0.0' })]))
  })

  it('fails Preflight for transitive or ambiguous Skill dependencies before Runtime execution', () => {
    const manifests = [
      { name: 'root-skill', version: '1.0.0', entry: 'root.md', dependencies: ['child@1.0.0'], supportedRuntimes: ['codex'], capabilities: [], requiredPermissions: [] },
      { name: 'child', version: '1.0.0', entry: 'child.md', dependencies: ['missing'], supportedRuntimes: ['codex'], capabilities: [], requiredPermissions: [] },
      { name: 'child', version: '2.0.0', entry: 'child-v2.md', dependencies: [], supportedRuntimes: ['codex'], capabilities: [], requiredPermissions: [] }
    ]
    const transitive = validateWorkflow({
      schemaVersion: 1, id: 'workflow', name: 'Workflow', version: '1.0.0',
      phases: [{ id: 'phase', name: 'Phase', goal: 'Goal', steps: [{ id: 'step', name: 'Step', kind: 'skill', skill: { name: 'root-skill', version: '1.0.0' } }] }]
    }, manifests)
    expect(transitive.errors).toEqual(expect.arrayContaining([expect.stringContaining('missing')]))
    const ambiguous = validateWorkflow({
      schemaVersion: 1, id: 'workflow', name: 'Workflow', version: '1.0.0',
      phases: [{ id: 'phase', name: 'Phase', goal: 'Goal', steps: [{ id: 'step', name: 'Step', kind: 'skill', skill: { name: 'ambiguous', version: '1.0.0' } }] }]
    }, [...manifests, { name: 'ambiguous', version: '1.0.0', entry: 'ambiguous.md', dependencies: ['child'], supportedRuntimes: ['codex'], capabilities: [], requiredPermissions: [] }])
    expect(ambiguous.errors).toEqual(expect.arrayContaining([expect.stringContaining('多个版本')]))
  })
})
