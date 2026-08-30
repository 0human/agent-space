// @vitest-environment node

import { join, resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'

import { APP_SHELL_CHANNELS } from '../shared/app-shell'
import type { Project } from '../shared/project'
import { registerProjectHandlers } from './project-handlers'

const project: Project = {
  id: 'project-1',
  name: 'demo',
  workspacePath: '/work/demo',
  workspaceAvailable: true,
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
      openInIde: vi.fn().mockResolvedValue(undefined),
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

  it('shows a Data Transfer Notice before cloning a GitHub Project', async () => {
    const handlers = new Map<string, (...args: unknown[]) => unknown>()
    const cloneGitHub = vi.fn().mockResolvedValue(project)
    const dialog = {
      showOpenDialog: vi.fn().mockResolvedValue({ canceled: false, filePaths: ['/work'] }),
      showMessageBox: vi.fn().mockResolvedValue({ response: 0 })
    }
    registerProjectHandlers({
      handle: (channel, listener) => handlers.set(channel, listener), dialog,
      openInIde: vi.fn(), userDataPath: '/data',
      service: { list: vi.fn(), inspectDirectory: vi.fn(), importDirectory: vi.fn(), findById: vi.fn(), cloneGitHub }
    })

    await expect(handlers.get(APP_SHELL_CHANNELS.cloneGitHubProject)?.({}, 'https://github.com/example/demo.git')).resolves.toMatchObject({
      project,
      transferNotice: { destination: 'https://github.com/example/demo.git' }
    })
    expect(dialog.showMessageBox).toHaveBeenCalledWith(expect.objectContaining({ title: 'Data Transfer Notice' }))
    expect(cloneGitHub).toHaveBeenCalledWith(join('/data', 'projects.json'), 'https://github.com/example/demo.git', resolve('/work/demo'))
  })

  it('does not clone when the transfer notice is cancelled', async () => {
    const handlers = new Map<string, (...args: unknown[]) => unknown>()
    const cloneGitHub = vi.fn()
    registerProjectHandlers({
      handle: (channel, listener) => handlers.set(channel, listener),
      dialog: {
        showOpenDialog: vi.fn().mockResolvedValue({ canceled: false, filePaths: ['/work'] }),
        showMessageBox: vi.fn().mockResolvedValue({ response: 1 })
      },
      openInIde: vi.fn(), userDataPath: '/data',
      service: { list: vi.fn(), inspectDirectory: vi.fn(), importDirectory: vi.fn(), findById: vi.fn(), cloneGitHub }
    })

    await expect(handlers.get(APP_SHELL_CHANNELS.cloneGitHubProject)?.({}, 'git@github.com:example/demo.git')).resolves.toBeNull()
    expect(cloneGitHub).not.toHaveBeenCalled()
  })

  it('returns a blocked result when GitHub is unavailable after confirmation', async () => {
    const handlers = new Map<string, (...args: unknown[]) => unknown>()
    registerProjectHandlers({
      handle: (channel, listener) => handlers.set(channel, listener),
      dialog: {
        showOpenDialog: vi.fn().mockResolvedValue({ canceled: false, filePaths: ['/work'] }),
        showMessageBox: vi.fn().mockResolvedValue({ response: 0 })
      },
      openInIde: vi.fn(), userDataPath: '/data',
      service: { list: vi.fn(), inspectDirectory: vi.fn(), importDirectory: vi.fn(), findById: vi.fn(), cloneGitHub: vi.fn().mockRejectedValue(new Error('网络连接失败')) }
    })

    await expect(handlers.get(APP_SHELL_CHANNELS.cloneGitHubProject)?.({}, 'https://github.com/example/demo.git')).resolves.toMatchObject({
      blocked: true,
      reason: '网络连接失败'
    })
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
      openInIde: vi.fn(),
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

  it('opens a known Project through an external IDE launcher', async () => {
    const handlers = new Map<string, (...args: unknown[]) => unknown>()
    const openInIde = vi.fn().mockResolvedValue('')
    const openProject = vi.fn().mockImplementation(async (_filePath: string, projectId: string) => (
      projectId === 'project-1' ? project : null
    ))

    registerProjectHandlers({
      handle: (channel, listener) => handlers.set(channel, listener),
      dialog: { showOpenDialog: vi.fn(), showMessageBox: vi.fn() },
      openInIde,
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
    expect(openInIde).toHaveBeenCalledWith('/work/demo')
  })

  it('returns a localized error when no external IDE can be launched', async () => {
    const handlers = new Map<string, (...args: unknown[]) => unknown>()

    registerProjectHandlers({
      handle: (channel, listener) => handlers.set(channel, listener),
      dialog: { showOpenDialog: vi.fn(), showMessageBox: vi.fn() },
      openInIde: vi.fn().mockRejectedValue(new Error('ENOENT: code not found')),
      userDataPath: '/data',
      service: {
        list: vi.fn(),
        inspectDirectory: vi.fn(),
        importDirectory: vi.fn(),
        findById: vi.fn().mockResolvedValue(project)
      }
    })

    await expect(handlers.get(APP_SHELL_CHANNELS.openProjectInIde)?.({}, 'project-1')).resolves.toEqual({
      ok: false,
      error: '没有找到可用的外部 IDE。请安装并启用 IDE 的命令行启动器。'
    })
  })

  it('requires explicit confirmation before soft-deleting a Project', async () => {
    const handlers = new Map<string, (...args: unknown[]) => unknown>()
    const deletedProject = { ...project, status: 'deleted' as const, deletedAt: '2026-08-30T00:00:00.000Z' }
    const deleteProject = vi.fn().mockResolvedValue({
      ok: true,
      status: 'deleted',
      project: deletedProject,
      error: null
    })
    const dialog = {
      showOpenDialog: vi.fn(),
      showMessageBox: vi.fn().mockResolvedValue({ response: 0 })
    }

    registerProjectHandlers({
      handle: (channel, listener) => handlers.set(channel, listener),
      dialog,
      openInIde: vi.fn(),
      userDataPath: '/data',
      service: {
        list: vi.fn(),
        inspectDirectory: vi.fn(),
        importDirectory: vi.fn(),
        findById: vi.fn().mockResolvedValue(project),
        deleteProject
      }
    })

    await expect(handlers.get(APP_SHELL_CHANNELS.deleteProject)?.({}, 'project-1')).resolves.toEqual({
      ok: true,
      status: 'deleted',
      project: deletedProject,
      error: null
    })
    expect(dialog.showMessageBox).toHaveBeenCalledWith(expect.objectContaining({
      type: 'warning',
      title: '删除 Project',
      message: expect.stringContaining('不会删除本地 Workspace 目录或其中任何文件'),
      detail: expect.stringContaining('不会删除本地 Workspace 目录或其中任何文件'),
      buttons: ['删除 Project', '取消'],
      defaultId: 1,
      cancelId: 1
    }))
    expect(deleteProject).toHaveBeenCalledWith(join('/data', 'projects.json'), 'project-1')
  })

  it('does not delete when the confirmation is cancelled', async () => {
    const handlers = new Map<string, (...args: unknown[]) => unknown>()
    const deleteProject = vi.fn()

    registerProjectHandlers({
      handle: (channel, listener) => handlers.set(channel, listener),
      dialog: {
        showOpenDialog: vi.fn(),
        showMessageBox: vi.fn().mockResolvedValue({ response: 1 })
      },
      openInIde: vi.fn(),
      userDataPath: '/data',
      service: {
        list: vi.fn(),
        inspectDirectory: vi.fn(),
        importDirectory: vi.fn(),
        findById: vi.fn().mockResolvedValue(project),
        deleteProject
      }
    })

    await expect(handlers.get(APP_SHELL_CHANNELS.deleteProject)?.({}, 'project-1')).resolves.toBeNull()
    expect(deleteProject).not.toHaveBeenCalled()
  })

  it('returns an explainable blocked result when a Project has an active Run', async () => {
    const handlers = new Map<string, (...args: unknown[]) => unknown>()
    registerProjectHandlers({
      handle: (channel, listener) => handlers.set(channel, listener),
      dialog: {
        showOpenDialog: vi.fn(),
        showMessageBox: vi.fn().mockResolvedValue({ response: 0 })
      },
      openInIde: vi.fn(),
      userDataPath: '/data',
      service: {
        list: vi.fn(),
        inspectDirectory: vi.fn(),
        importDirectory: vi.fn(),
        findById: vi.fn().mockResolvedValue(project),
        deleteProject: vi.fn().mockResolvedValue({
          ok: false,
          status: 'blocked',
          project,
          error: 'Project 存在进行中的 Workflow Run。'
        })
      }
    })

    await expect(handlers.get(APP_SHELL_CHANNELS.deleteProject)?.({}, 'project-1')).resolves.toMatchObject({
      ok: false,
      status: 'blocked',
      error: '该 Project 有进行中的 Workflow Run，请先暂停、取消或完成 Run 后再删除。'
    })
  })

  it('keeps the Workspace reachable for a soft-deleted Project', async () => {
    const handlers = new Map<string, (...args: unknown[]) => unknown>()
    const openInIde = vi.fn()
    registerProjectHandlers({
      handle: (channel, listener) => handlers.set(channel, listener),
      dialog: { showOpenDialog: vi.fn(), showMessageBox: vi.fn() },
      openInIde,
      userDataPath: '/data',
      service: {
        list: vi.fn(),
        inspectDirectory: vi.fn(),
        importDirectory: vi.fn(),
        findById: vi.fn().mockResolvedValue({ ...project, status: 'deleted', deletedAt: '2026-08-30T00:00:00.000Z' })
      }
    })

    await expect(handlers.get(APP_SHELL_CHANNELS.openProjectInIde)?.({}, 'project-1')).resolves.toEqual({
      ok: true,
      error: null
    })
    expect(openInIde).toHaveBeenCalledWith('/work/demo')
  })
})
