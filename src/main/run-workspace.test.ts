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

  it('keeps greenfield projects on their original workspace', async () => {
    const execGit = vi.fn(async () => '')
    const manager = createRunWorkspaceManager({ execGit })

    await expect(manager.prepare({ ...project, isGreenfield: true, currentBranch: null, head: null }, 'run-1')).resolves.toEqual({
      workspacePath: '/work/demo',
      baseCommit: null,
      branch: null
    })
    expect(execGit).not.toHaveBeenCalled()
  })

  it('uses a detached worktree when the project is on a detached HEAD', async () => {
    const execGit = vi.fn(async () => '')
    const mkdir = vi.fn(async () => undefined)
    const manager = createRunWorkspaceManager({ execGit, mkdir })

    await expect(manager.prepare({ ...project, currentBranch: null }, 'run-2')).resolves.toEqual({
      workspacePath: join(dirname(project.workspacePath), 'demo-agent-space-run-2'),
      baseCommit: 'abc123',
      branch: null
    })
    expect(execGit).toHaveBeenCalledWith('/work/demo', [
      'worktree', 'add', '--detach', join(dirname(project.workspacePath), 'demo-agent-space-run-2'), 'abc123'
    ])
  })
})
