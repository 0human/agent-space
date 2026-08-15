// @vitest-environment node

import { describe, expect, it, vi } from 'vitest'

import { createProjectService, inspectWorkspace } from './project-service'
import type { Project } from '../shared/project'

describe('Workspace inspection', () => {
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
      workspacePath: '/work/demo',
      dirty: true,
      dirtySummary: { staged: 0, unstaged: 0, untracked: 1, files: ['draft.md'] }
    })
  })

  it('keeps persisted Project metadata when its Workspace is temporarily unavailable', async () => {
    const storedProject: Project = {
      id: 'project-1',
      name: 'demo',
      workspacePath: '/work/demo',
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

    await expect(service.list('/data/projects.json')).resolves.toEqual([storedProject])
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
    expect(second.workspacePath).toBe('/work/demo')
    expect(JSON.parse(stored)).toHaveLength(1)
  })
})
