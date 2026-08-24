// @vitest-environment node

import { describe, expect, it, vi } from 'vitest'

import { createGitDeliveryManager } from './git-delivery'

describe('GitDeliveryManager public API', () => {
  it('commits the isolated workspace and returns a Run-linked commit artifact', async () => {
    const execGit = vi.fn()
      .mockResolvedValueOnce('')
      .mockResolvedValueOnce('')
      .mockResolvedValueOnce('abc123\n')
    const manager = createGitDeliveryManager({ execGit })

    await expect(manager.commitAfterReview({
      workspacePath: '/work/demo-agent-space/run-1',
      runId: 'run-1',
      baseCommit: 'base456',
      ticket: '10'
    })).resolves.toEqual({
      commit: 'abc123',
      artifact: {
        type: 'commit',
        name: 'commit',
        runId: 'run-1',
        location: '/work/demo-agent-space/run-1@abc123',
        versionHash: 'abc123',
        status: 'available'
      }
    })
    expect(execGit).toHaveBeenNthCalledWith(1, '/work/demo-agent-space/run-1', ['add', '-A'])
    expect(execGit).toHaveBeenNthCalledWith(2, '/work/demo-agent-space/run-1', ['commit', '-m', 'agent-space: complete implementation for #10 (Run run-1, base base456)'])
    expect(execGit).toHaveBeenNthCalledWith(3, '/work/demo-agent-space/run-1', ['rev-parse', 'HEAD'])
  })

  it('does not create a duplicate commit when the review is retried without changes', async () => {
    const execGit = vi.fn()
      .mockResolvedValueOnce('')
      .mockRejectedValueOnce(new Error('nothing to commit, working tree clean'))
      .mockResolvedValueOnce('abc123\n')
    const manager = createGitDeliveryManager({ execGit })

    await expect(manager.commitAfterReview({ workspacePath: '/work/demo', runId: 'run-1', baseCommit: 'abc123', ticket: null })).resolves.toMatchObject({ commit: 'abc123' })
    expect(execGit).toHaveBeenCalledTimes(3)
  })
})
