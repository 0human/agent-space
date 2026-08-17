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
      error: 'Workflow 校验失败：schemaVersion 无效。'
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
})
