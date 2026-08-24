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

  it('reconciles a committed idempotency key before retrying local Git side effects', async () => {
    let committed = false
    const execGit = vi.fn(async (_workspacePath: string, args: string[]) => {
      if (args[0] === 'log') return committed ? 'abc123\0agent-space: complete implementation (Idempotency Key: git.commit:run-1)' : ''
      if (args[0] === 'commit') { committed = true; return '' }
      if (args[0] === 'rev-parse') return 'abc123\n'
      return ''
    })
    const manager = createGitDeliveryManager({ execGit })
    const request = { workspacePath: '/work/demo', runId: 'run-1', baseCommit: 'base', ticket: null, idempotencyKey: 'git.commit:run-1' }

    await manager.commitAfterReview(request)
    const recovered = await manager.commitAfterReview(request)

    expect(recovered.artifact).toMatchObject({ idempotencyKey: 'git.commit:run-1', versionHash: 'abc123' })
    expect(execGit.mock.calls.filter(([, args]) => args[0] === 'commit')).toHaveLength(1)
  })

  it('pushes the feature branch and reuses the same GitHub PR on retry', async () => {
    const execGit = vi.fn(async (_workspacePath: string, args: string[]) => args[0] === 'rev-parse' ? 'abc123\n' : '')
    const execGitHub = vi.fn()
      .mockResolvedValueOnce('[]')
      .mockResolvedValueOnce('https://github.com/example/demo/pull/42\n')
      .mockResolvedValueOnce(JSON.stringify({
        number: 42,
        url: 'https://github.com/example/demo/pull/42',
        title: 'Implement #12',
        headRefName: 'main/agent-space/run-1',
        baseRefName: 'main',
        headRefOid: 'abc123',
        statusCheckRollup: [{ name: 'CI', status: 'COMPLETED', conclusion: 'SUCCESS' }],
        reviews: [{ author: { login: 'reviewer' }, state: 'APPROVED', submittedAt: '2026-08-24T00:00:00.000Z' }],
        mergeable: 'MERGEABLE',
        isDraft: false,
        mergedAt: null
      }))
      .mockResolvedValueOnce(JSON.stringify([{
        number: 42,
        url: 'https://github.com/example/demo/pull/42',
        headRefName: 'main/agent-space/run-1',
        baseRefName: 'main'
      }]))
      .mockResolvedValueOnce('')
      .mockResolvedValueOnce(JSON.stringify({
        number: 42,
        url: 'https://github.com/example/demo/pull/42',
        title: 'Implement #12',
        headRefName: 'main/agent-space/run-1',
        baseRefName: 'main',
        headRefOid: 'abc123',
        statusCheckRollup: [{ name: 'CI', status: 'COMPLETED', conclusion: 'SUCCESS' }],
        reviews: [{ author: { login: 'reviewer' }, state: 'APPROVED' }],
        mergeable: 'MERGEABLE',
        isDraft: false,
        mergedAt: null
      }))
    const manager = createGitDeliveryManager({ execGit, execGitHub })
    const request = {
      workspacePath: '/work/demo-agent-space/run-1',
      runId: 'run-1',
      commit: 'abc123',
      branch: 'main/agent-space/run-1',
      defaultBranch: 'main',
      remote: 'https://github.com/example/demo.git',
      ticket: '12',
      title: 'Implement #12',
      permissionPolicy: { grantedPermissions: ['network.github'] }
    }

    const first = await manager.deliverPullRequest(request)
    const second = await manager.deliverPullRequest(request)

    expect(first.pullRequest.number).toBe(42)
    expect(first.pullRequest.gate.canMerge).toBe(true)
    expect(first.artifact).toMatchObject({
      type: 'pull-request',
      name: 'PR #42',
      runId: 'run-1',
      location: 'https://github.com/example/demo/pull/42'
    })
    expect(second.pullRequest.number).toBe(42)
    expect(execGit).toHaveBeenNthCalledWith(1, request.workspacePath, ['rev-parse', 'HEAD'])
    expect(execGit).toHaveBeenNthCalledWith(2, request.workspacePath, ['push', '--set-upstream', request.remote, request.branch])
    expect(execGit).toHaveBeenNthCalledWith(3, request.workspacePath, ['rev-parse', 'HEAD'])
    expect(execGit).toHaveBeenNthCalledWith(4, request.workspacePath, ['push', '--set-upstream', request.remote, request.branch])
    expect(execGitHub).toHaveBeenCalledWith(request.workspacePath, expect.arrayContaining(['pr', 'list']))
    expect(execGitHub).toHaveBeenCalledWith(request.workspacePath, expect.arrayContaining(['pr', 'create']))
    expect(execGitHub).toHaveBeenCalledWith(request.workspacePath, expect.arrayContaining(['pr', 'view', '42']))
    expect(execGitHub.mock.calls.filter(([, args]) => args.includes('pr') && args.includes('create'))).toHaveLength(1)
  })

  it('prefers the PR carrying this Run ID over another historical PR on the same branch', async () => {
    const execGit = vi.fn(async (_workspacePath: string, args: string[]) => args[0] === 'rev-parse' ? 'abc123\n' : '')
    const execGitHub = vi.fn()
      .mockResolvedValueOnce(JSON.stringify([
        { number: 8, headRefName: 'feature/run-1', baseRefName: 'main', state: 'OPEN', body: 'Run ID: run-1-old', createdAt: '2026-08-24T00:02:00Z' },
        { number: 7, headRefName: 'feature/run-1', baseRefName: 'main', state: 'CLOSED', body: 'Run ID: run-1\nTicket: #12', createdAt: '2026-08-24T00:01:00Z' }
      ]))
      .mockResolvedValueOnce('')
      .mockResolvedValueOnce(JSON.stringify({
        number: 7, url: 'https://github.com/example/demo/pull/7', title: 'Implement #12', headRefName: 'feature/run-1', baseRefName: 'main', headRefOid: 'abc123',
        statusCheckRollup: [], reviews: [], mergeable: 'UNKNOWN', isDraft: false, mergedAt: null
      }))
    const manager = createGitDeliveryManager({ execGit, execGitHub, resolveSshHost: vi.fn().mockResolvedValue('github.com') })

    await expect(manager.deliverPullRequest({
      workspacePath: '/work/demo', runId: 'run-1', commit: 'abc123', branch: 'feature/run-1', defaultBranch: 'main',
      remote: 'git@0humanbuilder:example/demo.git', ticket: '12', title: 'Implement #12', permissionPolicy: { grantedPermissions: ['network.github'] }
    })).resolves.toMatchObject({ pullRequest: { number: 7 } })
    expect(execGitHub).toHaveBeenCalledWith('/work/demo', expect.arrayContaining(['pr', 'edit', '7']))
    expect(execGitHub.mock.calls.some(([, args]) => args.includes('pr') && args.includes('create'))).toBe(false)
  })

  it('rejects default-branch, force-push, and unapproved merge attempts', async () => {
    const execGit = vi.fn().mockResolvedValue('')
    const execGitHub = vi.fn().mockResolvedValue(JSON.stringify({
      number: 42,
      url: 'https://github.com/example/demo/pull/42',
      title: 'Implement #12',
      headRefName: 'main/agent-space/run-1',
      baseRefName: 'main',
      headRefOid: 'abc123',
      statusCheckRollup: [{ name: 'CI', status: 'COMPLETED', conclusion: 'SUCCESS' }],
      reviews: [{ author: { login: 'reviewer' }, state: 'APPROVED' }],
      mergeable: 'MERGEABLE',
      isDraft: false,
      mergedAt: null
    }))
    const manager = createGitDeliveryManager({ execGit, execGitHub })

    await expect(manager.deliverPullRequest({
      workspacePath: '/work/demo', runId: 'run-1', commit: 'abc123', branch: 'main', defaultBranch: 'main',
      remote: 'https://github.com/example/demo.git', ticket: '12', title: 'Implement #12',
      permissionPolicy: { grantedPermissions: ['network.github'] }
    })).rejects.toThrow('默认分支')
    expect(execGit).not.toHaveBeenCalled()

    await expect(manager.mergePullRequest({
      workspacePath: '/work/demo', runId: 'run-1', pullRequest: { number: 42, headBranch: 'main/agent-space/run-1', baseBranch: 'main', headCommit: 'abc123', gate: { canMerge: true, checksSatisfied: true, reviewsSatisfied: true, mergeabilitySatisfied: true, reason: null } },
      remote: 'https://github.com/example/demo.git', defaultBranch: 'main', permissionPolicy: { grantedPermissions: ['network.github'] }, gateApproved: false
    })).rejects.toThrow('Merge Gate')
    expect(execGitHub).not.toHaveBeenCalled()
  })

  it('refuses to publish when the verified local HEAD does not match the commit artifact', async () => {
    const execGit = vi.fn().mockResolvedValue('different-head\n')
    const execGitHub = vi.fn()
    const manager = createGitDeliveryManager({ execGit, execGitHub })

    await expect(manager.deliverPullRequest({
      workspacePath: '/work/demo', runId: 'run-1', commit: 'abc123', branch: 'feature/run-1', defaultBranch: 'main',
      remote: 'https://github.com/example/demo.git', ticket: '12', title: 'Implement #12', permissionPolicy: { grantedPermissions: ['network.github'] }
    })).rejects.toThrow('HEAD 与已验证 commit 不一致')
    expect(execGit).toHaveBeenCalledWith('/work/demo', ['rev-parse', 'HEAD'])
    expect(execGit).not.toHaveBeenCalledWith('/work/demo', expect.arrayContaining(['push']))
    expect(execGitHub).not.toHaveBeenCalled()
  })

  it('refuses to publish when the remote PR head commit differs from the verified commit', async () => {
    const execGit = vi.fn(async (_workspacePath: string, args: string[]) => args[0] === 'rev-parse' ? 'abc123\n' : '')
    const execGitHub = vi.fn(async (_workspacePath: string, args: string[]) => {
      if (args[1] === 'list') return '[]'
      if (args[1] === 'create') return 'https://github.com/example/demo/pull/51\n'
      return JSON.stringify({
        number: 51, url: 'https://github.com/example/demo/pull/51', title: 'Implement #12', headRefName: 'feature/run-1', baseRefName: 'main', headRefOid: 'def456',
        statusCheckRollup: [{ name: 'CI', status: 'COMPLETED', conclusion: 'SUCCESS' }], reviews: [], mergeable: 'MERGEABLE', isDraft: false, mergedAt: null
      })
    })
    const manager = createGitDeliveryManager({ execGit, execGitHub })

    await expect(manager.deliverPullRequest({
      workspacePath: '/work/demo', runId: 'run-1', commit: 'abc123', branch: 'feature/run-1', defaultBranch: 'main',
      remote: 'https://github.com/example/demo.git', ticket: '12', title: 'Implement #12', permissionPolicy: { grantedPermissions: ['network.github'] }
    })).rejects.toThrow('head commit')
  })

  it('keeps the Merge Gate blocked when GitHub reports no checks', async () => {
    const execGit = vi.fn(async (_workspacePath: string, args: string[]) => args[0] === 'rev-parse' ? 'abc123\n' : '')
    const payload = {
      number: 44,
      url: 'https://github.com/example/demo/pull/44',
      title: 'Implement #12',
      headRefName: 'feature/run-1',
      baseRefName: 'main',
      headRefOid: 'abc123',
      statusCheckRollup: [],
      reviews: [{ author: { login: 'reviewer' }, state: 'APPROVED', submittedAt: '2026-08-24T00:00:00Z' }],
      mergeable: 'MERGEABLE',
      isDraft: false,
      mergedAt: null
    }
    const execGitHub = vi.fn(async (_workspacePath: string, args: string[]) => {
      if (args[1] === 'list') return '[]'
      if (args[1] === 'create') return 'https://github.com/example/demo/pull/44\n'
      return JSON.stringify(payload)
    })
    const manager = createGitDeliveryManager({ execGit, execGitHub })

    const result = await manager.deliverPullRequest({
      workspacePath: '/work/demo', runId: 'run-1', commit: 'abc123', branch: 'feature/run-1', defaultBranch: 'main',
      remote: 'https://github.com/example/demo.git', ticket: '12', title: 'Implement #12', permissionPolicy: { grantedPermissions: ['network.github'] }
    })

    expect(result.pullRequest.gate).toMatchObject({ checksSatisfied: false, canMerge: false })
  })

  it('uses each reviewer\'s latest state when evaluating the Merge Gate', async () => {
    const execGit = vi.fn(async (_workspacePath: string, args: string[]) => args[0] === 'rev-parse' ? 'abc123\n' : '')
    const payload = {
      number: 45,
      url: 'https://github.com/example/demo/pull/45',
      title: 'Implement #12',
      headRefName: 'feature/run-1',
      baseRefName: 'main',
      headRefOid: 'abc123',
      statusCheckRollup: [{ name: 'CI', status: 'COMPLETED', conclusion: 'SUCCESS' }],
      reviews: [
        { author: { login: 'reviewer' }, state: 'APPROVED', submittedAt: '2026-08-24T00:00:00Z' },
        { author: { login: 'reviewer' }, state: 'CHANGES_REQUESTED', submittedAt: '2026-08-24T00:01:00Z' }
      ],
      mergeable: 'MERGEABLE',
      isDraft: false,
      mergedAt: null
    }
    const execGitHub = vi.fn(async (_workspacePath: string, args: string[]) => {
      if (args[1] === 'list') return '[]'
      if (args[1] === 'create') return 'https://github.com/example/demo/pull/45\n'
      return JSON.stringify(payload)
    })
    const manager = createGitDeliveryManager({ execGit, execGitHub })

    const result = await manager.deliverPullRequest({
      workspacePath: '/work/demo', runId: 'run-1', commit: 'abc123', branch: 'feature/run-1', defaultBranch: 'main',
      remote: 'https://github.com/example/demo.git', ticket: '12', title: 'Implement #12', permissionPolicy: { grantedPermissions: ['network.github'] }
    })

    expect(result.pullRequest.gate).toMatchObject({ reviewsSatisfied: false, canMerge: false })
  })

  it('does not reuse multiple legacy PR candidates without a Run ID', async () => {
    const execGit = vi.fn(async (_workspacePath: string, args: string[]) => args[0] === 'rev-parse' ? 'abc123\n' : '')
    const execGitHub = vi.fn(async (_workspacePath: string, args: string[]) => {
      if (args[1] === 'list') return JSON.stringify([
        { number: 46, headRefName: 'feature/run-1', baseRefName: 'main', state: 'OPEN', body: 'legacy PR' },
        { number: 47, headRefName: 'feature/run-1', baseRefName: 'main', state: 'CLOSED', body: 'legacy PR' }
      ])
      if (args[1] === 'create') return 'https://github.com/example/demo/pull/48\n'
      return JSON.stringify({
        number: 48, url: 'https://github.com/example/demo/pull/48', title: 'Implement #12', headRefName: 'feature/run-1', baseRefName: 'main', headRefOid: 'abc123',
        statusCheckRollup: [], reviews: [], mergeable: 'UNKNOWN', isDraft: false, mergedAt: null
      })
    })
    const manager = createGitDeliveryManager({ execGit, execGitHub })

    await manager.deliverPullRequest({
      workspacePath: '/work/demo', runId: 'run-1', commit: 'abc123', branch: 'feature/run-1', defaultBranch: 'main',
      remote: 'https://github.com/example/demo.git', ticket: '12', title: 'Implement #12', permissionPolicy: { grantedPermissions: ['network.github'] }
    })

    expect(execGitHub.mock.calls.some(([, args]) => args[1] === 'create')).toBe(true)
  })

  it('rejects a merge when the remote Merge Gate is no longer ready', async () => {
    const execGit = vi.fn().mockResolvedValue('')
    const execGitHub = vi.fn(async (_workspacePath: string, args: string[]) => {
      if (args[1] === 'merge') return ''
      return JSON.stringify({
        number: 49,
        url: 'https://github.com/example/demo/pull/49',
        title: 'Implement #12',
        headRefName: 'feature/run-1',
        baseRefName: 'main',
        headRefOid: 'abc123',
        statusCheckRollup: [{ name: 'CI', status: 'IN_PROGRESS', conclusion: null }],
        reviews: [{ author: { login: 'reviewer' }, state: 'APPROVED', submittedAt: '2026-08-24T00:00:00Z' }],
        mergeable: 'MERGEABLE',
        isDraft: false,
        mergedAt: null
      })
    })
    const manager = createGitDeliveryManager({ execGit, execGitHub })

    await expect(manager.mergePullRequest({
      workspacePath: '/work/demo', runId: 'run-1',
      pullRequest: { number: 49, headBranch: 'feature/run-1', baseBranch: 'main', headCommit: 'abc123', gate: { checksSatisfied: true, reviewsSatisfied: true, mergeabilitySatisfied: true, canMerge: true, reason: null } },
      remote: 'https://github.com/example/demo.git', defaultBranch: 'main', permissionPolicy: { grantedPermissions: ['network.github'] }, gateApproved: true
    })).rejects.toThrow('Merge Gate 不可批准')
    expect(execGitHub.mock.calls.some(([, args]) => args[1] === 'merge')).toBe(false)
  })
})
