// @vitest-environment node

import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'

import { APP_SHELL_CHANNELS } from '../shared/app-shell'
import type { Project } from '../shared/project'
import { registerProjectHandlers } from './project-handlers'

const project: Project = {
  id: 'project-1',
  name: 'demo',
  workspacePath: '/work/demo',
  remote: null,
  currentBranch: 'main',
  head: 'abc123',
  defaultBranch: 'main',
  isGreenfield: false,
  dirty: true,
  dirtySummary: { staged: 0, unstaged: 1, untracked: 0, files: ['README.md'] },
  updatedAt: '2026-08-14T00:00:00.000Z'
}

describe('Project IPC handlers', () => {
  it('imports the selected directory and warns about dirty changes', async () => {
    const handlers = new Map<string, (...args: unknown[]) => unknown>()
    const service = {
      list: vi.fn().mockResolvedValue([project]),
      inspectDirectory: vi.fn().mockResolvedValue({ dirty: true }),
      importDirectory: vi.fn().mockResolvedValue(project),
      findById: vi.fn().mockResolvedValue(project)
    }
    const dialog = {
      showOpenDialog: vi.fn().mockResolvedValue({ canceled: false, filePaths: ['/work/demo'] }),
      showMessageBox: vi.fn().mockResolvedValue({ response: 0 })
    }

    registerProjectHandlers({
      handle: (channel, listener) => handlers.set(channel, listener),
      dialog,
      openPath: vi.fn().mockResolvedValue(''),
      userDataPath: '/data',
      service
    })

    await expect(handlers.get(APP_SHELL_CHANNELS.importProject)?.({})).resolves.toEqual({
      project,
      warning: '该 Workspace 有未提交修改。继续导入不会 stash、reset 或丢弃这些修改。'
    })
    expect(dialog.showMessageBox).toHaveBeenCalledWith(expect.objectContaining({
      type: 'warning',
      cancelId: 1
    }))
    expect(service.importDirectory).toHaveBeenCalledWith(join('/data', 'projects.json'), '/work/demo')
  })

  it('does not register a Dirty Workspace when the user cancels the warning', async () => {
    const handlers = new Map<string, (...args: unknown[]) => unknown>()
    const importDirectory = vi.fn()

    registerProjectHandlers({
      handle: (channel, listener) => handlers.set(channel, listener),
      dialog: {
        showOpenDialog: vi.fn().mockResolvedValue({ canceled: false, filePaths: ['/work/demo'] }),
        showMessageBox: vi.fn().mockResolvedValue({ response: 1 })
      },
      openPath: vi.fn(),
      userDataPath: '/data',
      service: {
        list: vi.fn(),
        inspectDirectory: vi.fn().mockResolvedValue({ dirty: true }),
        importDirectory,
        findById: vi.fn()
      }
    })

    await expect(handlers.get(APP_SHELL_CHANNELS.importProject)?.({})).resolves.toBeNull()
    expect(importDirectory).not.toHaveBeenCalled()
  })

  it('opens a known Project through the system-associated application', async () => {
    const handlers = new Map<string, (...args: unknown[]) => unknown>()
    const openPath = vi.fn().mockResolvedValue('')
    const openProject = vi.fn().mockImplementation(async (_filePath: string, projectId: string) => (
      projectId === 'project-1' ? project : null
    ))

    registerProjectHandlers({
      handle: (channel, listener) => handlers.set(channel, listener),
      dialog: { showOpenDialog: vi.fn(), showMessageBox: vi.fn() },
      openPath,
      userDataPath: '/data',
      service: {
        list: vi.fn(),
        inspectDirectory: vi.fn(),
        importDirectory: vi.fn(),
        findById: openProject
      }
    })

    await expect(handlers.get(APP_SHELL_CHANNELS.openProjectInIde)?.({}, 'project-1')).resolves.toEqual({
      ok: true,
      error: null
    })
    expect(openProject).toHaveBeenCalledWith(join('/data', 'projects.json'), 'project-1')
    expect(openPath).toHaveBeenCalledWith('/work/demo')
  })
})
