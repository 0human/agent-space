// @vitest-environment node

import { describe, expect, it, vi } from 'vitest'
import { join } from 'node:path'

import { APP_SHELL_CHANNELS } from '../shared/app-shell'
import { BUILT_IN_DEVELOPMENT_WORKFLOW, type WorkflowView } from '../shared/workflow'
import { registerWorkflowHandlers } from './workflow-handlers'

const view: WorkflowView = {
  definition: BUILT_IN_DEVELOPMENT_WORKFLOW,
  source: 'built-in',
  path: null,
  validation: { valid: true, errors: [], warnings: [] },
  canStart: false,
  skillManifests: []
}

describe('Workflow IPC handlers', () => {
  it('loads the built-in workflow and copies it for a known Project', async () => {
    const handlers = new Map<string, (...args: unknown[]) => unknown>()
    const workflow = {
      getBuiltIn: vi.fn().mockResolvedValue(view),
      copyToProject: vi.fn().mockResolvedValue({ ...view, source: 'project', path: '/work/demo/.agent-space/workflow.json' }),
      loadProject: vi.fn().mockResolvedValue(view),
      startProjectRun: vi.fn().mockResolvedValue({ ok: true, error: null })
    }
    const projectService = { findById: vi.fn().mockResolvedValue({ id: 'project-1', workspacePath: '/work/demo' }) }

    registerWorkflowHandlers({
      handle: (channel, listener) => handlers.set(channel, listener),
      projectService,
      workflowService: workflow
    })

    await expect(handlers.get(APP_SHELL_CHANNELS.getWorkflow)?.({}, 'project-1')).resolves.toEqual(view)
    expect(workflow.loadProject).toHaveBeenCalledWith('/work/demo', expect.any(Array))
    await expect(handlers.get(APP_SHELL_CHANNELS.copyWorkflow)?.({}, 'project-1')).resolves.toMatchObject({ source: 'project' })
    expect(workflow.copyToProject).toHaveBeenCalledWith('/work/demo', expect.any(Array))
  })

  it('validates a built-in Workflow against the Project permissions before direct runs', async () => {
    const handlers = new Map<string, (...args: unknown[]) => unknown>()
    const workflow = {
      getBuiltIn: vi.fn().mockResolvedValue({ ...view, canStart: false }),
      copyToProject: vi.fn(),
      loadProject: vi.fn().mockRejectedValue(Object.assign(new Error('missing'), { code: 'ENOENT' })),
      startProjectRun: vi.fn()
    }
    const project = { id: 'project-1', workspacePath: '/work/demo', permissionPolicy: { grantedPermissions: [] } }
    const projectService = { findById: vi.fn().mockResolvedValue(project) }

    registerWorkflowHandlers({
      handle: (channel, listener) => handlers.set(channel, listener),
      projectService,
      workflowService: workflow
    })

    await expect(handlers.get(APP_SHELL_CHANNELS.getWorkflow)?.({}, project.id)).resolves.toMatchObject({ canStart: false })
    expect(workflow.getBuiltIn).toHaveBeenCalledWith([])
  })

  it('reloads the Project Workflow and blocks invalid starts', async () => {
    const handlers = new Map<string, (...args: unknown[]) => unknown>()
    const invalid = { ...view, source: 'project' as const, canStart: false, validation: { valid: false, errors: ['schemaVersion 无效。'], warnings: [] } }
    const workflow = {
      getBuiltIn: vi.fn(),
      copyToProject: vi.fn(),
      loadProject: vi.fn().mockResolvedValue(invalid),
      startProjectRun: vi.fn().mockResolvedValue({ ok: false, error: 'Workflow 校验失败：schemaVersion 无效。' })
    }

    registerWorkflowHandlers({
      handle: (channel, listener) => handlers.set(channel, listener),
      projectService: {
        findById: vi.fn().mockResolvedValue({
          id: 'project-1',
          workspacePath: '/work/demo',
          permissionPolicy: { grantedPermissions: [] }
        })
      },
      workflowService: workflow
    })

    await expect(handlers.get(APP_SHELL_CHANNELS.reloadWorkflow)?.({}, 'project-1')).resolves.toEqual(invalid)
    await expect(handlers.get(APP_SHELL_CHANNELS.startWorkflowRun)?.({}, 'project-1')).resolves.toEqual({
      ok: false,
      error: 'Workflow 校验失败：schemaVersion 无效。',
      run: null
    })
    expect(workflow.loadProject).toHaveBeenCalledWith('/work/demo', [])
    expect(workflow.startProjectRun).toHaveBeenCalledWith('/work/demo', [])
  })

  it('opens the Project Workflow file in the external IDE', async () => {
    const handlers = new Map<string, (...args: unknown[]) => unknown>()
    const openInIde = vi.fn().mockResolvedValue(undefined)

    registerWorkflowHandlers({
      handle: (channel, listener) => handlers.set(channel, listener),
      projectService: { findById: vi.fn().mockResolvedValue({ id: 'project-1', workspacePath: '/work/demo' }) },
      workflowService: {
        getBuiltIn: vi.fn(),
        copyToProject: vi.fn(),
        loadProject: vi.fn(),
        startProjectRun: vi.fn()
      },
      openInIde
    })

    await expect(handlers.get(APP_SHELL_CHANNELS.openWorkflowFile)?.({}, 'project-1')).resolves.toEqual({
      ok: true,
      error: null
    })
    expect(openInIde).toHaveBeenCalledWith(join('/work/demo', '.agent-space', 'workflow.json'))
  })

  it('runs Preflight and starts through the public Workflow Engine API', async () => {
    const handlers = new Map<string, (...args: unknown[]) => unknown>()
    const engine = {
      preflight: vi.fn().mockResolvedValue({ passed: true, checks: ['Idea 已填写。'], errors: [] }),
      startRun: vi.fn().mockResolvedValue({ id: 'run-1' })
    }
    const workflow = { ...view, source: 'project' as const, canStart: true, validation: { valid: true, errors: [], warnings: [] } }
    registerWorkflowHandlers({
      handle: (channel, listener) => handlers.set(channel, listener),
      projectService: { findById: vi.fn().mockResolvedValue({ id: 'project-1', workspacePath: '/work/demo' }) },
      workflowService: {
        getBuiltIn: vi.fn(), copyToProject: vi.fn(), loadProject: vi.fn().mockResolvedValue(workflow), startProjectRun: vi.fn()
      },
      workflowEngine: engine as never
    })

    await expect(handlers.get(APP_SHELL_CHANNELS.preflightWorkflowRun)?.({}, 'project-1', 'An idea')).resolves.toEqual({ passed: true, checks: ['Idea 已填写。'], errors: [] })
    expect(engine.preflight).toHaveBeenCalledWith(expect.objectContaining({ idea: 'An idea', project: expect.objectContaining({ id: 'project-1' }), workflow }))
    await expect(handlers.get(APP_SHELL_CHANNELS.startWorkflowRun)?.({}, 'project-1', 'An idea')).resolves.toEqual({ ok: true, error: null, run: { id: 'run-1' } })
    expect(engine.startRun).toHaveBeenCalledWith(expect.objectContaining({ idea: 'An idea', workflow }))
  })

  it('does not start new Workflow Runs for a soft-deleted Project', async () => {
    const handlers = new Map<string, (...args: unknown[]) => unknown>()
    const engine = {
      preflight: vi.fn(),
      startRun: vi.fn()
    }
    const projectService = {
      findById: vi.fn().mockResolvedValue({
        id: 'project-1',
        workspacePath: '/work/demo',
        status: 'deleted',
        deletedAt: '2026-08-30T00:00:00.000Z'
      })
    }

    registerWorkflowHandlers({
      handle: (channel, listener) => handlers.set(channel, listener),
      projectService,
      workflowService: {
        getBuiltIn: vi.fn(),
        copyToProject: vi.fn(),
        loadProject: vi.fn(),
        startProjectRun: vi.fn()
      },
      workflowEngine: engine as never
    })

    await expect(handlers.get(APP_SHELL_CHANNELS.preflightWorkflowRun)?.({}, 'project-1', 'An idea')).resolves.toEqual({
      passed: false,
      checks: [],
      errors: ['找不到这个 Project。']
    })
    await expect(handlers.get(APP_SHELL_CHANNELS.startWorkflowRun)?.({}, 'project-1', 'An idea')).resolves.toEqual({
      ok: false,
      error: '找不到这个 Project。',
      run: null
    })
    expect(engine.preflight).not.toHaveBeenCalled()
    expect(engine.startRun).not.toHaveBeenCalled()
  })

  it('does not retry a Run after its Project has been soft-deleted', async () => {
    const handlers = new Map<string, (...args: unknown[]) => unknown>()
    const engine = {
      getRun: vi.fn().mockResolvedValue({ projectId: 'project-1' }),
      retryStep: vi.fn().mockResolvedValue({ id: 'run-1', status: 'running' })
    }
    const projectService = {
      findById: vi.fn().mockResolvedValue({
        id: 'project-1',
        workspacePath: '/work/demo',
        status: 'deleted',
        deletedAt: '2026-08-30T00:00:00.000Z'
      }),
      withProjectRegistryLock: <T>(action: () => Promise<T>) => action()
    }

    registerWorkflowHandlers({
      handle: (channel, listener) => handlers.set(channel, listener),
      projectService,
      workflowService: {
        getBuiltIn: vi.fn(),
        copyToProject: vi.fn(),
        loadProject: vi.fn(),
        startProjectRun: vi.fn()
      },
      workflowEngine: engine as never
    })

    await expect(handlers.get(APP_SHELL_CHANNELS.retryWorkflowStep)?.({}, 'run-1')).rejects.toThrow('找不到这个 Project。')
    expect(engine.retryStep).not.toHaveBeenCalled()
  })
})
