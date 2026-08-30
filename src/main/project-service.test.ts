// @vitest-environment node

import { resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'

import { createProjectService, inspectWorkspace } from './project-service'
import type { Project } from '../shared/project'

describe('Workspace inspection', () => {
  it('clones a GitHub repository through the system Git credential chain', async () => {
    let stored = ''
    let cloned = false
    const cloneGitHub = vi.fn(async () => { cloned = true })
    const service = createProjectService({
      readFile: async () => stored || (() => { throw Object.assign(new Error('missing'), { code: 'ENOENT' }) })(),
      writeFile: async (_path, data) => { stored = data },
      mkdir: async () => undefined,
      createId: () => 'github-project-1',
      cloneGitHub,
      execGit: async (_path, args) => {
        const command = args.join(' ')
        if (command === 'rev-parse --is-inside-work-tree') {
          if (!cloned) throw new Error('not yet cloned')
          return 'true\n'
        }
        if (command === 'remote') return 'origin\n'
        if (command === 'config --get remote.origin.url') return 'https://github.com/example/demo.git\n'
        if (command === 'branch --show-current') return 'main\n'
        if (command === 'rev-parse HEAD') return 'abc123\n'
        if (command === 'status --porcelain=v1 --untracked-files=all') return ''
        return ''
      }
    })

    const project = await service.cloneGitHub('/data/projects.json', 'https://github.com/example/demo.git', '/work/demo')

    expect(cloneGitHub).toHaveBeenCalledWith('https://github.com/example/demo.git', resolve('/work/demo'))
    expect(project.remote).toBe('https://github.com/example/demo.git')
    expect(stored).not.toContain('token')
  })

  it('rejects non-GitHub URLs before any network operation', async () => {
    const cloneGitHub = vi.fn()
    const service = createProjectService({
      readFile: async () => '[]', writeFile: async () => undefined, mkdir: async () => undefined,
      execGit: async () => { throw new Error('not used') }, cloneGitHub
    })

    await expect(service.cloneGitHub('/data/projects.json', 'https://evil.example/repo.git', '/work/repo'))
      .rejects.toThrow('请输入有效的 GitHub 仓库地址。')
    expect(cloneGitHub).not.toHaveBeenCalled()
  })

  it('accepts an SSH alias that resolves to GitHub', async () => {
    let stored = ''
    let cloned = false
    const cloneGitHub = vi.fn(async () => { cloned = true })
    const service = createProjectService({
      readFile: async () => stored || (() => { throw Object.assign(new Error('missing'), { code: 'ENOENT' }) })(),
      writeFile: async (_path, data) => { stored = data },
      mkdir: async () => undefined,
      createId: () => 'github-alias-project-1',
      resolveSshHost: vi.fn().mockResolvedValue('github.com'),
      cloneGitHub,
      execGit: async (_path, args) => {
        const command = args.join(' ')
        if (command === 'rev-parse --is-inside-work-tree') {
          if (!cloned) throw new Error('not yet cloned')
          return 'true\n'
        }
        if (command === 'remote') return 'origin\n'
        if (command === 'config --get remote.origin.url') return 'git@0humanbuilder:example/demo.git\n'
        if (command === 'branch --show-current') return 'main\n'
        if (command === 'rev-parse HEAD') return 'abc123\n'
        if (command === 'status --porcelain=v1 --untracked-files=all') return ''
        return ''
      }
    })

    await expect(service.cloneGitHub('/data/projects.json', 'git@0humanbuilder:example/demo.git', '/work/demo')).resolves.toMatchObject({ remote: 'git@0humanbuilder:example/demo.git' })
    expect(cloneGitHub).toHaveBeenCalledWith('git@0humanbuilder:example/demo.git', resolve('/work/demo'))
  })

  it('fetches an existing partial clone to recover without repeating clone', async () => {
    let recovered = false
    const fetchGitHub = vi.fn(async () => { recovered = true })
    const cloneGitHub = vi.fn()
    const service = createProjectService({
      readFile: async () => '[]', writeFile: async () => undefined, mkdir: async () => undefined,
      readDirectory: async () => ['.git'],
      execGit: async (_path, args) => {
        if (args.join(' ') === 'rev-parse --is-inside-work-tree') {
          if (!recovered) throw new Error('partial clone')
          return 'true\n'
        }
        if (args.join(' ') === 'remote') return 'origin\n'
        if (args.join(' ') === 'config --get remote.origin.url') return 'https://github.com/example/demo.git\n'
        if (args.join(' ') === 'status --porcelain=v1 --untracked-files=all') return ''
        return ''
      }, fetchGitHub, cloneGitHub
    })

    await service.cloneGitHub('/data/projects.json', 'https://github.com/example/demo.git', '/work/demo')

    expect(fetchGitHub).toHaveBeenCalledWith(resolve('/work/demo'))
    expect(cloneGitHub).not.toHaveBeenCalled()
  })

  it('reports the real Git identity and dirty workspace summary', async () => {
    const commands: Record<string, string> = {
      'rev-parse --is-inside-work-tree': 'true\n',
      'remote': 'origin\n',
      'config --get remote.origin.url': 'git@github.com:example/demo.git\n',
      'branch --show-current': 'feature/import\n',
      'rev-parse HEAD': '0123456789abcdef0123456789abcdef01234567\n',
      'symbolic-ref --short refs/remotes/origin/HEAD': 'origin/main\n',
      'status --porcelain=v1 --untracked-files=all': 'M  staged.ts\n M working.ts\n?? notes.md\n'
    }

    const state = await inspectWorkspace('/work/demo', {
      execGit: async (_workspacePath, args) => commands[args.join(' ')] ?? ''
    })

    expect(state).toEqual({
      workspaceAvailable: true,
      remote: 'git@github.com:example/demo.git',
      currentBranch: 'feature/import',
      head: '0123456789abcdef0123456789abcdef01234567',
      defaultBranch: 'main',
      isGreenfield: false,
      dirty: true,
      dirtySummary: {
        staged: 1,
        unstaged: 1,
        untracked: 1,
        files: ['staged.ts', 'working.ts', 'notes.md']
      }
    })
  })

  it('reports version control metadata from a non-origin remote', async () => {
    const commands: Record<string, string> = {
      'rev-parse --is-inside-work-tree': 'true\n',
      'remote': 'upstream\n',
      'config --get remote.upstream.url': 'https://github.com/example/upstream.git\n',
      'branch --show-current': 'feature/import\n',
      'rev-parse HEAD': 'abc123\n',
      'symbolic-ref --short refs/remotes/upstream/HEAD': 'upstream/trunk\n',
      'status --porcelain=v1 --untracked-files=all': ''
    }

    const state = await inspectWorkspace('/work/demo', {
      execGit: async (_workspacePath, args) => commands[args.join(' ')] ?? ''
    })

    expect(state.remote).toBe('https://github.com/example/upstream.git')
    expect(state.defaultBranch).toBe('trunk')
  })

  it('accepts an empty non-Git directory as a Greenfield Project', async () => {
    const state = await inspectWorkspace('/work/blank', {
      execGit: async () => {
        throw new Error('not a git repository')
      },
      readDirectory: async () => []
    })

    expect(state).toEqual({
      workspaceAvailable: true,
      remote: null,
      currentBranch: null,
      head: null,
      defaultBranch: null,
      isGreenfield: true,
      dirty: false,
      dirtySummary: { staged: 0, unstaged: 0, untracked: 0, files: [] }
    })
  })

  it('rejects a non-empty non-Git directory', async () => {
    await expect(inspectWorkspace('/work/not-empty', {
      execGit: async () => {
        throw new Error('not a git repository')
      },
      readDirectory: async () => ['README.md']
    })).rejects.toThrow('目录不是 Git Workspace，也不是空目录')
  })

  it('persists imported metadata and refreshes Git state when listed again', async () => {
    let stored = ''
    let status = ''
    const service = createProjectService({
      readFile: async () => {
        if (!stored) throw Object.assign(new Error('missing'), { code: 'ENOENT' })
        return stored
      },
      writeFile: async (_path, data) => {
        stored = data
      },
      mkdir: async () => undefined,
      createId: () => 'project-1',
      now: () => '2026-08-14T00:00:00.000Z',
      execGit: async (_path, args) => {
        const command = args.join(' ')
        if (command === 'rev-parse --is-inside-work-tree') return 'true\n'
        if (command === 'remote') return 'origin\n'
        if (command === 'config --get remote.origin.url') return 'https://github.com/example/demo.git\n'
        if (command === 'branch --show-current') return 'main\n'
        if (command === 'rev-parse HEAD') return 'abc123\n'
        if (command === 'symbolic-ref --short refs/remotes/origin/HEAD') return 'origin/main\n'
        if (command === 'status --porcelain=v1 --untracked-files=all') return status
        throw new Error(`unexpected command: ${command}`)
      }
    })

    const imported = await service.importDirectory('/data/projects.json', '/work/demo')
    expect(imported.dirty).toBe(false)

    status = '?? draft.md\n'
    const listed = await service.list('/data/projects.json')
    expect(listed).toHaveLength(1)
    expect(listed[0]).toMatchObject({
      id: 'project-1',
      name: 'demo',
      workspacePath: resolve('/work/demo'),
      dirty: true,
      dirtySummary: { staged: 0, unstaged: 0, untracked: 1, files: ['draft.md'] }
    })
  })

  it('keeps persisted Project metadata when its Workspace is temporarily unavailable', async () => {
    const storedProject: Project = {
      id: 'project-1',
      name: 'demo',
      workspacePath: '/work/demo',
      workspaceAvailable: true,
      remote: 'https://github.com/example/demo.git',
      currentBranch: 'main',
      head: 'abc123',
      defaultBranch: 'main',
      isGreenfield: false,
      dirty: false,
      dirtySummary: { staged: 0, unstaged: 0, untracked: 0, files: [] },
      updatedAt: '2026-08-14T00:00:00.000Z'
    }
    const service = createProjectService({
      readFile: async () => JSON.stringify([storedProject]),
      writeFile: async () => undefined,
      mkdir: async () => undefined,
      execGit: async () => { throw new Error('workspace is unavailable') }
    })

    await expect(service.list('/data/projects.json')).resolves.toMatchObject([{
      ...storedProject,
      workspaceAvailable: false
    }])
  })

  it('does not overwrite durable Project metadata when the registry is malformed', async () => {
    const writeFile = vi.fn()
    const service = createProjectService({
      readFile: async () => '{not-json',
      writeFile,
      mkdir: async () => undefined,
      execGit: async () => ''
    })

    await expect(service.list('/data/projects.json')).rejects.toThrow()
    expect(writeFile).not.toHaveBeenCalled()
  })

  it('keeps one Project registration for equivalent Workspace paths', async () => {
    let stored = ''
    let nextId = 0
    const service = createProjectService({
      readFile: async () => {
        if (!stored) throw Object.assign(new Error('missing'), { code: 'ENOENT' })
        return stored
      },
      writeFile: async (_path, data) => {
        stored = data
      },
      mkdir: async () => undefined,
      createId: () => `project-${++nextId}`,
      execGit: async (_path, args) => {
        const command = args.join(' ')
        if (command === 'rev-parse --is-inside-work-tree') return 'true\n'
        if (command === 'branch --show-current') return 'main\n'
        if (command === 'rev-parse HEAD') return 'abc123\n'
        return ''
      }
    })

    const first = await service.importDirectory('/data/projects.json', '/work/demo')
    const second = await service.importDirectory('/data/projects.json', '/work/demo/')

    expect(second.id).toBe(first.id)
    expect(second.workspacePath).toBe(resolve('/work/demo'))
    expect(JSON.parse(stored)).toHaveLength(1)
  })

  it('soft-deletes a Project while keeping its durable registration readable', async () => {
    let stored = JSON.stringify([{
      id: 'project-1',
      name: 'demo',
      workspacePath: '/work/demo',
      workspaceAvailable: true,
      remote: null,
      currentBranch: 'main',
      head: 'abc123',
      defaultBranch: 'main',
      isGreenfield: false,
      dirty: false,
      dirtySummary: { staged: 0, unstaged: 0, untracked: 0, files: [] },
      updatedAt: '2026-08-14T00:00:00.000Z'
    }])
    const service = createProjectService({
      readFile: async () => stored,
      writeFile: async (_path, data) => { stored = data },
      mkdir: async () => undefined,
      now: () => '2026-08-30T00:00:00.000Z',
      execGit: async () => ''
    })

    const result = await service.deleteProject('/data/projects.json', 'project-1')

    expect(result).toMatchObject({ ok: true, status: 'deleted' })
    expect(result.project).toMatchObject({
      id: 'project-1',
      status: 'deleted',
      deletedAt: '2026-08-30T00:00:00.000Z'
    })
    await expect(service.list('/data/projects.json')).resolves.toEqual([])
    await expect(service.findById('/data/projects.json', 'project-1')).resolves.toMatchObject({
      id: 'project-1',
      workspacePath: '/work/demo',
      status: 'deleted',
      deletedAt: '2026-08-30T00:00:00.000Z'
    })
  })

  it('blocks deletion while a Workflow Run is still in progress', async () => {
    let stored = JSON.stringify([{
      id: 'project-1',
      name: 'demo',
      workspacePath: '/work/demo',
      workspaceAvailable: true,
      remote: null,
      currentBranch: 'main',
      head: 'abc123',
      defaultBranch: 'main',
      isGreenfield: false,
      dirty: false,
      dirtySummary: { staged: 0, unstaged: 0, untracked: 0, files: [] },
      updatedAt: '2026-08-14T00:00:00.000Z'
    }])
    const writeFile = vi.fn(async (_path: string, data: string) => { stored = data })
    const service = createProjectService({
      readFile: async () => stored,
      writeFile,
      mkdir: async () => undefined,
      hasActiveWorkflowRuns: vi.fn().mockResolvedValue(true),
      now: () => '2026-08-30T00:00:00.000Z',
      execGit: async () => ''
    })

    await expect(service.deleteProject('/data/projects.json', 'project-1')).resolves.toMatchObject({
      ok: false,
      status: 'blocked',
      error: 'Project 存在进行中的 Workflow Run。'
    })
    expect(writeFile).not.toHaveBeenCalled()
    expect(JSON.parse(stored)[0]).not.toHaveProperty('deletedAt')
  })

  it('does not reuse a deleted registration when the same Workspace is imported again', async () => {
    let stored = JSON.stringify([{
      id: 'deleted-project-1',
      name: 'old-demo',
      workspacePath: resolve('/work/demo'),
      workspaceAvailable: true,
      remote: null,
      currentBranch: 'main',
      head: 'abc123',
      defaultBranch: 'main',
      isGreenfield: false,
      dirty: false,
      dirtySummary: { staged: 0, unstaged: 0, untracked: 0, files: [] },
      status: 'deleted',
      deletedAt: '2026-08-30T00:00:00.000Z',
      updatedAt: '2026-08-30T00:00:00.000Z'
    }])
    let nextId = 0
    const service = createProjectService({
      readFile: async () => stored,
      writeFile: async (_path, data) => { stored = data },
      mkdir: async () => undefined,
      createId: () => `project-${++nextId}`,
      execGit: async (_path, args) => {
        if (args.join(' ') === 'rev-parse --is-inside-work-tree') return 'true\n'
        return ''
      }
    })

    const imported = await service.importDirectory('/data/projects.json', '/work/demo')

    expect(imported.id).toBe('project-1')
    expect(imported.status).toBe('active')
    expect(JSON.parse(stored)).toHaveLength(2)
    expect(JSON.parse(stored)[0]).toMatchObject({ id: 'deleted-project-1', status: 'deleted' })
  })

  it('reports an already deleted Project without changing its deletion timestamp', async () => {
    const stored = JSON.stringify([{
      id: 'project-1',
      name: 'demo',
      workspacePath: '/work/demo',
      status: 'deleted',
      deletedAt: '2026-08-29T00:00:00.000Z',
      updatedAt: '2026-08-29T00:00:00.000Z'
    }])
    const writeFile = vi.fn()
    const service = createProjectService({
      readFile: async () => stored,
      writeFile,
      mkdir: async () => undefined,
      hasActiveWorkflowRuns: vi.fn().mockRejectedValue(new Error('must not inspect terminal Project runs')),
      execGit: async () => ''
    })

    await expect(service.deleteProject('/data/projects.json', 'project-1')).resolves.toMatchObject({
      ok: true,
      status: 'already-deleted',
      project: { id: 'project-1', deletedAt: '2026-08-29T00:00:00.000Z' }
    })
    expect(writeFile).not.toHaveBeenCalled()
  })
})
