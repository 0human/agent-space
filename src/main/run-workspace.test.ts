// @vitest-environment node

import { describe, expect, it, vi } from 'vitest'
import { dirname, join } from 'node:path'

import type { Project } from '../shared/project'
import { createRunWorkspaceManager } from './run-workspace'

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
  updatedAt: '2026-08-18T00:00:00.000Z'
}

describe('RunWorkspaceManager', () => {
  it('creates a separate worktree from the project HEAD', async () => {
    const execGit = vi.fn(async () => '')
    const mkdir = vi.fn(async () => undefined)
    const manager = createRunWorkspaceManager({ execGit, mkdir })

    await expect(manager.prepare(project, 'run-1')).resolves.toEqual({
      workspacePath: join(dirname(project.workspacePath), 'demo-agent-space-run-1'),
      baseCommit: 'abc123',
      branch: 'main/agent-space/run-1'
    })
    expect(mkdir).toHaveBeenCalledWith(dirname(join(dirname(project.workspacePath), 'demo-agent-space-run-1')), { recursive: true })
    expect(execGit).toHaveBeenCalledWith('/work/demo', [
      'worktree', 'add', '-b', 'main/agent-space/run-1', join(dirname(project.workspacePath), 'demo-agent-space-run-1'), 'abc123'
    ])
  })

  it('creates an isolated writable workspace for greenfield projects', async () => {
    const execGit = vi.fn(async (_workspacePath: string, args: string[]) => args[0] === 'rev-parse' ? 'greenfield-base\n' : '')
    const mkdir = vi.fn(async () => undefined)
    const manager = createRunWorkspaceManager({ execGit, mkdir })

    await expect(manager.prepare({ ...project, isGreenfield: true, currentBranch: null, head: null }, 'run-1')).resolves.toEqual({
      workspacePath: join(dirname(project.workspacePath), 'demo-agent-space-run-1'),
      baseCommit: 'greenfield-base',
      branch: 'agent-space/run-1'
    })
    expect(execGit).toHaveBeenNthCalledWith(1, join(dirname(project.workspacePath), 'demo-agent-space-run-1'), ['init'])
    expect(execGit).toHaveBeenNthCalledWith(2, join(dirname(project.workspacePath), 'demo-agent-space-run-1'), ['checkout', '-b', 'agent-space/run-1'])
    expect(execGit).toHaveBeenNthCalledWith(3, join(dirname(project.workspacePath), 'demo-agent-space-run-1'), ['-c', 'user.name=Agent Space', '-c', 'user.email=agent-space@local', 'commit', '--allow-empty', '-m', 'Create base for run-1'])
    expect(execGit).toHaveBeenNthCalledWith(4, join(dirname(project.workspacePath), 'demo-agent-space-run-1'), ['rev-parse', 'HEAD'])
    expect(mkdir).toHaveBeenCalledWith(dirname(join(dirname(project.workspacePath), 'demo-agent-space-run-1')), { recursive: true })
    expect(mkdir).toHaveBeenCalledWith(join(dirname(project.workspacePath), 'demo-agent-space-run-1'), { recursive: true })
  })

  it('uses a detached worktree when the project is on a detached HEAD', async () => {
    const execGit = vi.fn(async () => '')
    const mkdir = vi.fn(async () => undefined)
    const manager = createRunWorkspaceManager({ execGit, mkdir })

    await expect(manager.prepare({ ...project, currentBranch: null }, 'run-2')).resolves.toEqual({
      workspacePath: join(dirname(project.workspacePath), 'demo-agent-space-run-2'),
      baseCommit: 'abc123',
      branch: 'agent-space/run-2'
    })
    expect(execGit).toHaveBeenCalledWith('/work/demo', [
      'worktree', 'add', '-b', 'agent-space/run-2', join(dirname(project.workspacePath), 'demo-agent-space-run-2'), 'abc123'
    ])
  })

  it('keeps parallel Runs on distinct workspaces and branches', async () => {
    const execGit = vi.fn(async () => '')
    const mkdir = vi.fn(async () => undefined)
    const manager = createRunWorkspaceManager({ execGit, mkdir })

    const first = await manager.prepare(project, 'run-1')
    const second = await manager.prepare(project, 'run-2')

    expect(first.workspacePath).not.toBe(second.workspacePath)
    expect(first.branch).not.toBe(second.branch)
    expect(first.baseCommit).toBe('abc123')
    expect(second.baseCommit).toBe('abc123')
  })
})
