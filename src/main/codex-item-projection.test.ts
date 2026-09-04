import { describe, expect, it, vi } from 'vitest'

import { createCodexItemProjection } from './codex-item-projection'

const scope = {
  runId: 'run-1',
  executionId: 'execution-1',
  runtimeLocator: { runtimeProvider: 'codex', threadId: 'thread-1', turnId: 'turn-1', runtimeVersion: '0.144.3' },
  permissionPolicy: { grantedPermissions: ['workspace.read', 'workspace.write'] },
  source: 'codex app-server'
}

const metadata = {
  runId: 'run-1',
  executionId: 'execution-1',
  provider: 'codex',
  source: 'codex app-server',
  permissionPolicy: { grantedPermissions: ['workspace.read', 'workspace.write'] },
  runtimeLocator: scope.runtimeLocator
}

describe('Codex Item Projection', () => {
  it('updates one Agent message Item across deltas and treats completion as authoritative', () => {
    const publish = vi.fn()
    const projection = createCodexItemProjection({ publish })

    projection.handle({ method: 'item/started', params: { threadId: 'thread-1', turnId: 'turn-1', item: { type: 'agentMessage', id: 'item-1', text: '' } } }, scope)
    projection.handle({ method: 'item/agentMessage/delta', params: { threadId: 'thread-1', turnId: 'turn-1', itemId: 'item-1', delta: 'Draft ' } }, scope)
    projection.handle({ method: 'item/agentMessage/delta', params: { threadId: 'thread-1', turnId: 'turn-1', itemId: 'item-1', delta: 'answer' } }, scope)

    expect(projection.list(scope.executionId)).toEqual([{
      id: 'item-1',
      ...metadata,
      type: 'agent_message',
      status: 'in_progress',
      text: 'Draft answer'
    }])

    projection.handle({ method: 'item/completed', params: { threadId: 'thread-1', turnId: 'turn-1', item: { type: 'agentMessage', id: 'item-1', text: 'Final answer' } } }, scope)

    expect(projection.list(scope.executionId)).toEqual([{
      id: 'item-1',
      ...metadata,
      type: 'agent_message',
      status: 'completed',
      text: 'Final answer'
    }])
    expect(publish).toHaveBeenCalledTimes(4)
  })

  it('streams Plan and Final Response Items in place before authoritative completion', () => {
    const projection = createCodexItemProjection()

    projection.handle({ method: 'item/started', params: { threadId: 'thread-1', turnId: 'turn-1', item: { type: 'plan', id: 'plan-stream', text: '' } } }, scope)
    projection.handle({ method: 'item/plan/delta', params: { threadId: 'thread-1', turnId: 'turn-1', itemId: 'plan-stream', delta: 'Draft plan' } }, scope)
    expect(projection.list(scope.executionId)).toEqual([
      expect.objectContaining({ id: 'plan-stream', type: 'plan', status: 'in_progress', text: 'Draft plan' })
    ])
    projection.handle({ method: 'item/completed', params: { threadId: 'thread-1', turnId: 'turn-1', item: { type: 'plan', id: 'plan-stream', text: 'Final plan' } } }, scope)
    projection.handle({ method: 'item/started', params: { threadId: 'thread-1', turnId: 'turn-1', item: { type: 'agentMessage', id: 'final-stream', phase: 'final_answer', text: '' } } }, scope)
    projection.handle({ method: 'item/agentMessage/delta', params: { threadId: 'thread-1', turnId: 'turn-1', itemId: 'final-stream', delta: 'Final ' } }, scope)
    projection.handle({ method: 'item/completed', params: { threadId: 'thread-1', turnId: 'turn-1', item: { type: 'agentMessage', id: 'final-stream', phase: 'final_answer', text: 'Final response' } } }, scope)

    expect(projection.list(scope.executionId)).toEqual([
      expect.objectContaining({ id: 'plan-stream', type: 'plan', status: 'completed', text: 'Final plan' }),
      expect.objectContaining({ id: 'final-stream', type: 'final_response', status: 'completed', text: 'Final response' })
    ])
  })

  it('projects command start, aggregated output, and authoritative completion details', () => {
    const projection = createCodexItemProjection()

    projection.handle({
      method: 'item/started',
      params: {
        threadId: 'thread-1', turnId: 'turn-1',
        item: { type: 'commandExecution', id: 'item-command', command: 'pnpm test', cwd: '/work/demo', status: 'inProgress', aggregatedOutput: null, exitCode: null, durationMs: null }
      }
    }, scope)
    projection.handle({ method: 'item/commandExecution/outputDelta', params: { threadId: 'thread-1', turnId: 'turn-1', itemId: 'item-command', delta: 'partial output\n' } }, scope)
    projection.handle({ method: 'item/commandExecution/outputDelta', params: { threadId: 'thread-1', turnId: 'turn-1', itemId: 'item-command', delta: 'stale ending' } }, scope)

    expect(projection.list(scope.executionId)).toEqual([expect.objectContaining({
      id: 'item-command',
      type: 'command',
      status: 'in_progress',
      output: 'partial output\nstale ending'
    })])

    projection.handle({
      method: 'item/completed',
      params: {
        threadId: 'thread-1', turnId: 'turn-1',
        item: { type: 'commandExecution', id: 'item-command', command: 'pnpm test', cwd: '/work/demo', status: 'failed', aggregatedOutput: 'authoritative output', exitCode: 2, durationMs: 1250 }
      }
    }, scope)

    expect(projection.list(scope.executionId)).toEqual([{
      id: 'item-command',
      ...metadata,
      type: 'command',
      status: 'failed',
      command: 'pnpm test',
      output: 'authoritative output',
      exitCode: 2,
      durationMs: 1250
    }])
  })

  it('updates a File Change from patch notifications before authoritative completion', () => {
    const projection = createCodexItemProjection()
    projection.handle({ method: 'item/started', params: { threadId: 'thread-1', turnId: 'turn-1', item: { type: 'fileChange', id: 'file-stream', status: 'inProgress', changes: [] } } }, scope)
    projection.handle({
      method: 'item/fileChange/patchUpdated',
      params: {
        threadId: 'thread-1', turnId: 'turn-1', itemId: 'file-stream',
        changes: [{ path: 'src/live.ts', kind: { type: 'update' }, diff: '@@\n+one\n+two\n-old' }]
      }
    }, scope)

    expect(projection.list(scope.executionId)).toEqual([
      expect.objectContaining({
        id: 'file-stream', type: 'file_change', status: 'in_progress',
        changes: [{ path: 'src/live.ts', kind: 'update', additions: 2, deletions: 1 }], additions: 2, deletions: 1
      })
    ])

    projection.handle({ method: 'item/completed', params: { threadId: 'thread-1', turnId: 'turn-1', item: { type: 'fileChange', id: 'file-stream', status: 'completed', changes: [{ path: 'src/live.ts', kind: { type: 'update' }, diff: '@@\n+final\n-old' }] } } }, scope)
    expect(projection.list(scope.executionId)).toEqual([
      expect.objectContaining({ id: 'file-stream', status: 'completed', additions: 1, deletions: 1 })
    ])
  })

  it('projects safe file, plan, supported tool and error items while ignoring reasoning and unknown items', () => {
    const projection = createCodexItemProjection()
    projection.handle({ method: 'item/started', params: { threadId: 'thread-1', turnId: 'turn-1', item: { type: 'reasoning', id: 'reasoning-1', content: ['secret'] } } }, scope)
    projection.handle({ method: 'item/started', params: { threadId: 'thread-1', turnId: 'turn-1', item: { type: 'fileChange', id: 'file-1', status: 'inProgress', changes: [{ path: 'src/a.ts', kind: { type: 'update' }, diff: '@@\n+one\n-two' }, { path: 'secrets/config.json', kind: 'add', diff: '+TOKEN=abc' }] } } }, scope)
    projection.handle({ method: 'item/completed', params: { threadId: 'thread-1', turnId: 'turn-1', item: { type: 'plan', id: 'plan-1', status: 'failed', text: 'Implement and verify', extra: 'do not expose' } } }, scope)
    projection.handle({ method: 'item/completed', params: { threadId: 'thread-1', turnId: 'turn-1', item: { type: 'mcpToolCall', id: 'tool-1', server: 'github', tool: 'list_issues', status: 'completed', arguments: { token: 'secret' }, durationMs: 42, result: { content: [{ text: '2 issues' }] } } } }, scope)
    projection.handle({ method: 'item/started', params: { threadId: 'thread-1', turnId: 'turn-1', item: { type: 'futureItem', id: 'unknown-1', secret: 'do not expose' } } }, scope)
    projection.handle({ method: 'error', params: { threadId: 'thread-1', turnId: 'turn-1', code: 'authorization=code-secret', error: { message: 'authorization=secret failed' }, rawJsonRpc: { secret: true } } }, scope)

    expect(projection.list(scope.executionId)).toEqual([
      expect.objectContaining({ type: 'file_change', changes: [{ path: 'src/a.ts', kind: 'update', additions: 1, deletions: 1 }, { path: '<redacted path>', kind: 'add', additions: 1, deletions: 0 }], additions: 2, deletions: 1 }),
      expect.objectContaining({ type: 'plan', status: 'failed', text: 'Implement and verify' }),
      expect.objectContaining({ type: 'tool', name: 'github.list_issues', status: 'completed', durationMs: 42, output: '2 issues' }),
      expect.objectContaining({ type: 'error', status: 'failed', error: 'authorization=<redacted> failed' })
    ])
    expect(JSON.stringify(projection.list(scope.executionId))).not.toContain('secret')
  })

  it('projects a dynamic Tool result from its allowlisted string output', () => {
    const projection = createCodexItemProjection()
    projection.handle({
      method: 'item/completed',
      params: {
        threadId: 'thread-1', turnId: 'turn-1',
        item: { type: 'dynamicToolCall', id: 'dynamic-1', namespace: 'workspace', tool: 'inspect', status: 'completed', arguments: { token: 'input-secret' }, result: 'TOKEN=result-secret\nInspection complete', durationMs: 12 }
      }
    }, scope)

    expect(projection.list(scope.executionId)).toEqual([
      expect.objectContaining({ type: 'tool', name: 'workspace.inspect', status: 'completed', output: 'TOKEN=<redacted>\nInspection complete', durationMs: 12 })
    ])
    expect(JSON.stringify(projection.list(scope.executionId))).not.toMatch(/input-secret|result-secret/)
  })

  it('does not reapply duplicate lifecycle or delta notifications', () => {
    const publish = vi.fn()
    const projection = createCodexItemProjection({ publish })
    const started = { method: 'item/started', params: { threadId: 'thread-1', turnId: 'turn-1', item: { type: 'agentMessage', id: 'item-1', text: '' } } } as const
    const delta = { method: 'item/agentMessage/delta', params: { threadId: 'thread-1', turnId: 'turn-1', itemId: 'item-1', delta: 'same' } } as const
    projection.handle(started, scope)
    projection.handle({ ...started, params: { ...started.params, item: { ...started.params.item } } }, scope)
    projection.handle(delta, scope)
    projection.handle({ ...delta, params: { ...delta.params } }, scope)
    expect(projection.list(scope.executionId)[0]).toMatchObject({ text: 'same' })
    expect(publish).toHaveBeenCalledTimes(2)

    const completed = { method: 'item/completed', params: { threadId: 'thread-1', turnId: 'turn-1', item: { type: 'agentMessage', id: 'item-1', text: 'final' } } } as const
    projection.handle(completed, scope)
    projection.handle({ ...completed, params: { ...completed.params, item: { ...completed.params.item } } }, scope)
    expect(projection.list(scope.executionId)[0]).toMatchObject({ status: 'completed', text: 'final' })
    expect(publish).toHaveBeenCalledTimes(3)
  })

  it('does not let a late delta or duplicate start regress a completed Item', () => {
    const projection = createCodexItemProjection()
    projection.handle({ method: 'item/started', params: { threadId: 'thread-1', turnId: 'turn-1', item: { type: 'agentMessage', id: 'terminal-1', text: '' } } }, scope)
    projection.handle({ method: 'item/completed', params: { threadId: 'thread-1', turnId: 'turn-1', item: { type: 'agentMessage', id: 'terminal-1', text: 'final' } } }, scope)
    projection.handle({ method: 'item/agentMessage/delta', params: { threadId: 'thread-1', turnId: 'turn-1', itemId: 'terminal-1', delta: ' leaked-after-completion' } }, scope)
    projection.handle({ method: 'item/started', params: { threadId: 'thread-1', turnId: 'turn-1', item: { type: 'agentMessage', id: 'terminal-1', text: 'stale-start' } } }, scope)

    expect(projection.list(scope.executionId)).toEqual([expect.objectContaining({ id: 'terminal-1', status: 'completed', text: 'final' })])
  })

  it('keeps identity isolated by provider, Thread, Turn, and item id and never rewrites a terminal Item', () => {
    const projection = createCodexItemProjection()
    const nextTurnScope = {
      ...scope,
      runtimeLocator: { ...scope.runtimeLocator, turnId: 'turn-2' }
    }

    projection.handle({ method: 'item/completed', params: { threadId: 'thread-1', turnId: 'turn-1', item: { type: 'agentMessage', id: 'shared-id', text: 'first final' } } }, scope)
    projection.handle({ method: 'item/completed', params: { threadId: 'thread-1', turnId: 'turn-1', item: { type: 'agentMessage', id: 'shared-id', text: 'stale replacement' } } }, scope)
    projection.handle({ method: 'item/completed', params: { threadId: 'thread-1', turnId: 'turn-2', item: { type: 'agentMessage', id: 'shared-id', text: 'second final' } } }, nextTurnScope)

    expect(projection.list(scope.executionId)).toEqual([
      expect.objectContaining({ id: 'shared-id', text: 'first final', runtimeLocator: expect.objectContaining({ turnId: 'turn-1' }) }),
      expect.objectContaining({ id: 'shared-id', text: 'second final', runtimeLocator: expect.objectContaining({ turnId: 'turn-2' }) })
    ])
  })

  it('redacts sensitive values that are split across incremental notifications', () => {
    const projection = createCodexItemProjection()
    projection.handle({ method: 'item/started', params: { threadId: 'thread-1', turnId: 'turn-1', item: { type: 'agentMessage', id: 'split-1', text: '' } } }, scope)
    projection.handle({ method: 'item/agentMessage/delta', params: { threadId: 'thread-1', turnId: 'turn-1', itemId: 'split-1', delta: 'OPENAI_API_' } }, scope)
    projection.handle({ method: 'item/agentMessage/delta', params: { threadId: 'thread-1', turnId: 'turn-1', itemId: 'split-1', delta: 'KEY=split-secret' } }, scope)

    expect(projection.list(scope.executionId)).toEqual([expect.objectContaining({
      id: 'split-1',
      text: 'OPENAI_API_KEY=<redacted>'
    })])
    expect(JSON.stringify(projection.list(scope.executionId))).not.toContain('split-secret')
  })

  it('sanitizes Item identity and projection metadata before IPC publication', () => {
    const projection = createCodexItemProjection()
    const sensitiveScope = {
      ...scope,
      runId: 'TOKEN=run-secret',
      source: 'authorization=source-secret',
      runtimeLocator: {
        runtimeProvider: 'codex',
        threadId: 'TOKEN=thread-secret',
        turnId: 'TOKEN=turn-secret',
        runtimeVersion: 'TOKEN=version-secret'
      }
    }
    projection.handle({
      method: 'item/completed',
      params: {
        threadId: sensitiveScope.runtimeLocator.threadId,
        turnId: sensitiveScope.runtimeLocator.turnId,
        item: { type: 'agentMessage', id: 'TOKEN=item-secret', text: 'Safe text' }
      }
    }, sensitiveScope)

    expect(projection.list(scope.executionId)).toEqual([
      expect.objectContaining({
        id: 'TOKEN=<redacted>',
        runId: 'TOKEN=<redacted>',
        source: 'authorization=<redacted>',
        runtimeLocator: expect.objectContaining({
          threadId: 'TOKEN=<redacted>',
          turnId: 'TOKEN=<redacted>',
          runtimeVersion: 'TOKEN=<redacted>'
        })
      })
    ])
    expect(JSON.stringify(projection.list(scope.executionId))).not.toContain('-secret')
  })

  it('reports ignored Item types without retaining their unreviewed fields', () => {
    const onIgnoredItem = vi.fn()
    const projection = createCodexItemProjection({ onIgnoredItem })
    projection.handle({
      method: 'item/started',
      params: {
        threadId: 'thread-1',
        turnId: 'turn-1',
        item: { type: 'futureItem', id: 'unknown-1', secret: 'do not expose' }
      }
    }, scope)

    expect(projection.list(scope.executionId)).toEqual([])
    expect(projection.listIgnoredItems(scope.executionId)).toEqual([{
      runId: 'run-1',
      executionId: 'execution-1',
      method: 'item/started',
      itemId: 'unknown-1',
      itemType: 'futureItem',
      reason: 'unsupported_item_type'
    }])
    expect(onIgnoredItem).toHaveBeenCalledWith(expect.objectContaining({
      itemId: 'unknown-1',
      itemType: 'futureItem',
      method: 'item/started'
    }))
    expect(JSON.stringify(onIgnoredItem.mock.calls)).not.toContain('do not expose')
  })

  it('reports malformed recognized Items without exposing their fields', () => {
    const onIgnoredItem = vi.fn()
    const projection = createCodexItemProjection({ onIgnoredItem })
    projection.handle({ method: 'item/completed', params: { threadId: 'thread-1', turnId: 'turn-1', item: { type: 'commandExecution', id: 'malformed-1', secret: 'command-secret' } } }, scope)
    projection.handle({ method: 'item/started', params: { threadId: 'thread-1', turnId: 'turn-1', item: { id: 'malformed-2', secret: 'missing-type-secret' } } }, scope)

    expect(projection.list(scope.executionId)).toEqual([])
    expect(projection.listIgnoredItems(scope.executionId)).toEqual([
      expect.objectContaining({ itemId: 'malformed-1', itemType: 'commandExecution', reason: 'malformed_item' }),
      expect.objectContaining({ itemId: 'malformed-2', itemType: null, reason: 'malformed_item' })
    ])
    expect(JSON.stringify(onIgnoredItem.mock.calls)).not.toMatch(/command-secret|missing-type-secret/)
  })

  it('projects a user-input request and its redacted answer on one Question identity', () => {
    const projection = createCodexItemProjection()
    const request = {
      id: 17,
      method: 'item/tool/requestUserInput',
      params: {
        threadId: 'thread-1',
        turnId: 'turn-1',
        itemId: 'question-1',
        questions: [
          { id: 'storage', header: 'Storage', question: 'Which store?', options: [{ label: 'SQLite', description: 'Local-first' }] },
          { id: 'credential', header: 'Credential', question: 'Enter token', isSecret: true }
        ],
        rawJsonRpc: { token: 'request-secret' }
      }
    } as const

    projection.handleRequest(request, scope)
    projection.completeRequest(request, {
      answers: {
        storage: { answers: ['SQLite'] },
        credential: { answers: ['answer-secret'] }
      }
    }, scope)
    projection.handleRequest(request, scope)

    expect(projection.list(scope.executionId)).toEqual([
      expect.objectContaining({
        id: 'question:question-1',
        type: 'question',
        status: 'completed',
        questions: [
          { id: 'storage', header: 'Storage', question: 'Which store?', options: [{ label: 'SQLite', description: 'Local-first' }], isSecret: false },
          { id: 'credential', header: 'Credential', question: 'Enter token', options: [], isSecret: true }
        ],
        answers: { storage: ['SQLite'], credential: ['<redacted>'] }
      })
    ])
    expect(JSON.stringify(projection.list(scope.executionId))).not.toMatch(/request-secret|answer-secret/)
  })

  it('projects an approval request and decision without retaining raw request fields', () => {
    const projection = createCodexItemProjection()
    const request = {
      id: 'approval-request-1',
      method: 'item/commandExecution/requestApproval',
      params: {
        threadId: 'thread-1',
        turnId: 'turn-1',
        itemId: 'approval-1',
        command: 'curl -H "Authorization: approval-secret" https://example.com',
        reason: 'Needs network',
        proposedNetworkPolicyAmendments: [{ host: 'secret.example', token: 'raw-secret' }]
      }
    } as const

    projection.handleRequest(request, scope)
    projection.completeRequest(request, { decision: 'decline', raw: { token: 'decision-secret' } }, scope)
    projection.handle({
      method: 'item/completed',
      params: { threadId: 'thread-1', turnId: 'turn-1', item: { type: 'commandExecution', id: 'approval-1', command: 'curl example.com', status: 'declined' } }
    }, scope)

    expect(projection.list(scope.executionId)).toEqual([
      expect.objectContaining({
        id: 'approval:approval-1',
        type: 'approval',
        status: 'declined',
        kind: 'command',
        summary: 'curl -H "Authorization: <redacted>" https://example.com',
        decision: 'decline'
      }),
      expect.objectContaining({ id: 'approval-1', type: 'command', status: 'declined' })
    ])
    expect(JSON.stringify(projection.list(scope.executionId))).not.toMatch(/approval-secret|raw-secret|decision-secret|secret\.example/)
  })

  it('rebuilds completed history through the same safe Item contract without replaying deltas', () => {
    const projection = createCodexItemProjection()

    projection.restore({
      thread: {
        id: 'thread-1',
        turns: [{
          id: 'turn-1',
          items: [
            { type: 'agentMessage', id: 'history-final', phase: 'final_answer', text: 'Recovered final' },
            { type: 'commandExecution', id: 'history-command', command: 'pnpm test', status: 'completed', aggregatedOutput: 'passed', exitCode: 0, durationMs: 80 },
            { type: 'reasoning', id: 'history-reasoning', content: ['hidden-secret'] },
            { type: 'futureItem', id: 'history-unknown', token: 'unknown-secret' }
          ]
        }]
      }
    }, scope)

    expect(projection.list(scope.executionId)).toEqual([
      expect.objectContaining({ id: 'history-final', type: 'final_response', status: 'completed', text: 'Recovered final' }),
      expect.objectContaining({ id: 'history-command', type: 'command', status: 'completed', output: 'passed', exitCode: 0 })
    ])
    expect(projection.listIgnoredItems(scope.executionId)).toEqual([
      expect.objectContaining({ itemId: 'history-unknown', itemType: 'futureItem', reason: 'unsupported_item_type' })
    ])
    expect(JSON.stringify(projection.list(scope.executionId))).not.toMatch(/hidden-secret|unknown-secret/)
  })
})
