// @vitest-environment node

import { describe, expect, it, vi } from 'vitest'

import type { CodexAppServerMessage, JsonRpcServerRequest } from './codex-app-server-transport'
import { createCodexItemProjection } from './codex-item-projection'
import { createCodexSessionModule, type CodexSessionTransport, type CodexRuntimeApprovalRequest } from './codex-session-module'

class ControlledTransport implements CodexSessionTransport {
  readonly requests: Array<{ method: string; params: Record<string, unknown> }> = []
  readonly notifications: Array<{ method: string; params: Record<string, unknown> }> = []
  readonly serverRequests: CodexRuntimeApprovalRequest[] = []
  readonly close = vi.fn(async () => undefined)
  readonly respond = vi.fn(async (_id: number | string, _result: unknown) => undefined)

  constructor(
    private readonly incoming: Array<Record<string, unknown>> = [],
    private readonly threadId = 'thread-1',
    private readonly capabilities: Record<string, unknown> = {
      methods: ['thread/start', 'thread/resume', 'thread/read', 'turn/start', 'turn/interrupt'],
      events: ['item/started', 'item/completed', 'turn/completed']
    },
    private readonly userAgent = 'codex-cli/0.144.3'
  ) {}

  async request(method: string, params: Record<string, unknown>): Promise<unknown> {
    this.requests.push({ method, params })
    if (method === 'initialize') return { userAgent: this.userAgent, capabilities: this.capabilities }
    if (method === 'thread/start') return { thread: { id: this.threadId } }
    if (method === 'thread/resume') return { thread: { id: String(params.threadId) } }
    if (method === 'turn/start') return { turn: { id: 'turn-1' } }
    if (method === 'turn/interrupt') return {}
    if (method === 'thread/read') return { thread: { id: String(params.threadId), turns: [] } }
    throw new Error(`Unexpected request: ${method}`)
  }

  async notify(method: string, params: Record<string, unknown>): Promise<void> {
    this.notifications.push({ method, params })
  }

  async nextNotification() {
    return this.incoming.shift() as never ?? null
  }

  async nextMessage(): Promise<CodexAppServerMessage | null> {
    return this.incoming.shift() as CodexAppServerMessage | undefined ?? null
  }

  async nextRequest() {
    const request = this.incoming.shift()
    return request?.method && request.id !== undefined ? request as unknown as JsonRpcServerRequest : null
  }

  enqueue(...messages: Array<Record<string, unknown>>): void {
    this.incoming.push(...messages)
  }

}

function completedTurn(threadId = 'thread-1') {
  return { method: 'turn/completed', params: { threadId, turn: { id: 'turn-1', status: 'completed', error: null } } }
}

describe('Codex Session Module', () => {
  it('publishes reasoning deltas while the Turn is still running without adding business events', async () => {
    const params = { threadId: 'thread-1', turnId: 'turn-1' }
    const messages: CodexAppServerMessage[] = [
      { method: 'item/started', params: { ...params, item: { id: 'thinking', type: 'reasoning', summary: [], content: [] } } },
      { method: 'item/reasoning/summaryTextDelta', params: { ...params, itemId: 'thinking', summaryIndex: 0, delta: '检查' } },
      { method: 'item/reasoning/summaryTextDelta', params: { ...params, itemId: 'thinking', summaryIndex: 0, delta: '文件' } },
      { method: 'item/reasoning/textDelta', params: { ...params, itemId: 'thinking', contentIndex: 0, delta: 'Runtime 提供的详情' } },
    ]
    let finish!: (message: CodexAppServerMessage) => void
    const completion = new Promise<CodexAppServerMessage>((resolve) => { finish = resolve })
    const transport = new ControlledTransport()
    transport.nextMessage = async () => messages.shift() ?? completion
    const publish = vi.fn()
    const projection = createCodexItemProjection({ publish })
    const session = createCodexSessionModule({ createTransport: () => transport, itemProjection: projection })
    const settled = vi.fn()
    const turn = session.runTurn({ cwd: '/work/demo', command: 'codex', executionId: 'execution-1', workUnit: { kind: 'phase', runId: 'run-1', phaseId: 'discovery' }, input: '检查文件' }).then((result) => { settled(); return result })
    await vi.waitFor(() => expect(publish).toHaveBeenLastCalledWith(expect.objectContaining({ type: 'reasoning', status: 'in_progress', summary: ['检查文件'], content: ['Runtime 提供的详情'] })))
    expect(transport.requests).toContainEqual(expect.objectContaining({ method: 'turn/start', params: expect.objectContaining({ summary: 'concise' }) }))
    expect(settled).not.toHaveBeenCalled()
    finish(completedTurn())
    expect((await turn).events).toEqual([])
    expect(projection.list('execution-1').find((item) => item.type === 'turn')).toMatchObject({ status: 'completed', elapsedMs: expect.any(Number), activeSince: null })
    expect(projection.list('execution-1').filter((item) => item.type !== 'turn')).toEqual([expect.objectContaining({ type: 'reasoning', status: 'completed' })])
  })

  it('ends reasoning when the transport fails before Turn completion', async () => {
    const transport = new ControlledTransport([
      { method: 'item/started', params: { threadId: 'thread-1', turnId: 'turn-1', item: { id: 'thinking', type: 'reasoning', summary: [], content: [] } } },
    ])
    const projection = createCodexItemProjection()
    const session = createCodexSessionModule({ createTransport: () => transport, itemProjection: projection })
    await expect(session.runTurn({ cwd: '/work/demo', command: 'codex', executionId: 'execution-1', workUnit: { kind: 'phase', runId: 'run-1', phaseId: 'discovery' }, input: '检查文件' })).rejects.toThrow()
    expect(projection.list('execution-1').filter((item) => item.type !== 'turn')).toEqual(expect.arrayContaining([expect.objectContaining({ type: 'reasoning', status: 'failed' })]))
  })

  it('reports explicit missing capabilities during negotiation', async () => {
    const transport = new ControlledTransport([], 'thread-1', { methods: ['thread/start'], events: [] })
    const session = createCodexSessionModule({ createTransport: async () => transport })

    const result = await session.preflight({ cwd: '/work/demo', command: 'codex' })

    expect(result.compatible).toBe(false)
    expect(result.missingCapabilities).toEqual(expect.arrayContaining(['thread/resume', 'thread/read', 'turn/start', 'turn/interrupt', 'events:item/completed']))
    expect(result.reason).toContain('turn/start')
  })

  it('uses the local schema inspector when initialize omits a capability description', async () => {
    const transport = new ControlledTransport()
    transport.request = async (method: string, params: Record<string, unknown>): Promise<unknown> => {
      transport.requests.push({ method, params })
      if (method === 'initialize') return { userAgent: 'codex-cli/0.144.3' }
      throw new Error(`Unexpected request: ${method}`)
    }
    const inspectCapabilities = vi.fn(async () => ({
      methods: ['thread/start', 'thread/resume', 'thread/read', 'turn/start', 'turn/interrupt'],
      events: ['item/started', 'item/completed', 'turn/completed']
    }))
    const session = createCodexSessionModule({ createTransport: async () => transport, inspectCapabilities })

    const result = await session.preflight({ cwd: '/work/demo', command: 'codex' })

    expect(result.compatible).toBe(true)
    expect(result.missingCapabilities).toEqual([])
    expect(inspectCapabilities).toHaveBeenCalledWith(expect.objectContaining({ cwd: '/work/demo', command: expect.stringContaining('codex') }))
  })

  it('blocks when neither initialize nor the local schema inspector confirms capabilities', async () => {
    const transport = new ControlledTransport()
    transport.request = async (method: string, params: Record<string, unknown>): Promise<unknown> => {
      transport.requests.push({ method, params })
      if (method === 'initialize') return { userAgent: 'codex-cli/0.144.3' }
      throw new Error(`Unexpected request: ${method}`)
    }
    const session = createCodexSessionModule({ createTransport: async () => transport, inspectCapabilities: async () => null })

    const result = await session.preflight({ cwd: '/work/demo', command: 'codex' })

    expect(result.compatible).toBe(false)
    expect(result.missingCapabilities).toEqual(expect.arrayContaining(['thread/start', 'turn/start', 'events:item/completed']))
    expect(result.reason).toContain('Codex App Server')
  })

  it('reuses a logical work-unit Thread and isolates the next Ticket', async () => {
    const transports: ControlledTransport[] = []
    const session = createCodexSessionModule({
      createTransport: async () => {
        const threadId = transports.length === 1 ? 'thread-1' : `thread-${transports.length + 1}`
        const transport = new ControlledTransport([completedTurn(threadId)], threadId)
        transports.push(transport)
        return transport
      }
    })

    const first = await session.runTurn({ cwd: '/work/demo', command: 'codex', workUnit: { kind: 'implementation-ticket', runId: 'run-1', ticketId: 'ticket-1' }, input: 'first' })
    const second = await session.runTurn({ cwd: '/work/demo', command: 'codex', workUnit: { kind: 'implementation-ticket', runId: 'run-1', ticketId: 'ticket-1' }, input: 'continue' })
    const third = await session.runTurn({ cwd: '/work/demo', command: 'codex', workUnit: { kind: 'implementation-ticket', runId: 'run-1', ticketId: 'ticket-2' }, input: 'next' })

    expect(first.locator.threadId).toBe(second.locator.threadId)
    expect(third.locator.threadId).not.toBe(second.locator.threadId)
    expect(transports[1]?.requests.map(({ method }) => method)).toEqual(['initialize', 'thread/resume', 'turn/start'])
  })

  it('publishes the Runtime Locator before waiting for Turn notifications', async () => {
    const transport = new ControlledTransport([completedTurn()])
    const session = createCodexSessionModule({ createTransport: async () => transport })
    const onLocator = vi.fn(async () => undefined)

    await session.runTurn({ cwd: '/work/demo', command: 'codex', workUnit: { kind: 'phase', runId: 'run-1', phaseId: 'requirements' }, input: 'run', onLocator })

    expect(onLocator).toHaveBeenCalledWith(expect.objectContaining({ threadId: 'thread-1', turnId: 'turn-1' }))
  })

  it('interrupts an active Turn and rejects an approval request it did not receive', async () => {
    let resolveNotification: ((value: unknown) => void) | undefined
    const transport = new ControlledTransport()
    transport.nextMessage = vi.fn(() => new Promise((resolve) => { resolveNotification = resolve })) as never
    const session = createCodexSessionModule({ createTransport: async () => transport })
    const approval = { id: 'missing-approval', kind: 'command', summary: 'Runtime Approval：git status' } satisfies CodexRuntimeApprovalRequest
    const run = session.runTurn({ cwd: '/work/demo', command: 'codex', workUnit: { kind: 'phase', runId: 'run-1', phaseId: 'discovery' }, input: 'run', onApproval: async () => 'decline' })

    await vi.waitFor(() => expect(transport.requests.map(({ method }) => method)).toContain('turn/start'))
    await session.interrupt({ threadId: 'thread-1', turnId: 'turn-1' })
    await expect(session.respondToApproval(approval, 'decline')).rejects.toThrow('Runtime Approval 请求已失效')
    expect(transport.respond).not.toHaveBeenCalled()
    resolveNotification?.(completedTurn())
    await run

    expect(transport.requests).toEqual(expect.arrayContaining([{ method: 'turn/interrupt', params: { threadId: 'thread-1', turnId: 'turn-1' } }]))
  })

  it('projects one Interrupt Item from stop request through interrupted completion', async () => {
    let resolveMessage: ((value: CodexAppServerMessage) => void) | undefined
    const transport = new ControlledTransport()
    transport.nextMessage = vi.fn(() => new Promise<CodexAppServerMessage>((resolve) => { resolveMessage = resolve })) as never
    const projection = createCodexItemProjection()
    const session = createCodexSessionModule({ createTransport: async () => transport, itemProjection: projection })
    const run = session.runTurn({
      cwd: '/work/demo', command: 'codex', executionId: 'execution-interrupt',
      workUnit: { kind: 'phase', runId: 'run-1', phaseId: 'interrupt' }, input: 'run'
    })

    await vi.waitFor(() => expect(transport.requests.map(({ method }) => method)).toContain('turn/start'))
    await session.interrupt({ threadId: 'thread-1', turnId: 'turn-1' })
    expect(projection.list('execution-interrupt').filter((item) => item.type !== 'turn')).toEqual([
      expect.objectContaining({ type: 'interrupt', status: 'in_progress' })
    ])

    resolveMessage?.({ method: 'turn/completed', params: { threadId: 'thread-1', turn: { id: 'turn-1', status: 'interrupted', error: null } } })
    await run

    expect(projection.list('execution-interrupt').filter((item) => item.type !== 'turn')).toEqual([
      expect.objectContaining({ type: 'interrupt', status: 'completed' })
    ])
  })

  it('exposes a scoped command approval and waits for server acknowledgement before resolving it', async () => {
    const request = { id: 7, method: 'item/commandExecution/requestApproval', params: {
      threadId: 'thread-1', turnId: 'turn-1', itemId: 'command-1', approvalId: 'callback-1',
      command: 'git status', reason: '需要访问工作区', availableDecisions: ['accept', 'decline', 'cancel'],
    } }
    const transport = new ControlledTransport([request])
    const projection = createCodexItemProjection({ publish: () => undefined })
    const session = createCodexSessionModule({ createTransport: () => transport, itemProjection: projection })
    let received!: CodexRuntimeApprovalRequest
    const resolved = vi.fn(async () => undefined)
    const waiting = await session.runTurn({ cwd: '/work/demo', command: 'codex', executionId: 'execution-1',
      workUnit: { kind: 'phase', runId: 'run-1', phaseId: 'discovery' }, input: 'run',
      onApproval: (request) => { received = request },
    })
    expect(received.runtimeApproval).toMatchObject({
      requestId: 7, approvalId: 'callback-1', itemId: 'command-1', requestType: 'command',
      runtimeLocator: waiting.locator, availableDecisions: ['accept', 'decline', 'cancel'],
    })
    await expect(session.respondToApproval(received, 'acceptForSession')).rejects.toThrow()
    expect(transport.respond).not.toHaveBeenCalled()
    let deliver!: (message: CodexAppServerMessage) => void
    const messages: CodexAppServerMessage[] = []
    transport.nextMessage = async () => messages.shift() ?? new Promise((resolve) => { deliver = resolve })
    const continued = session.respondToApproval(received, 'accept', false, resolved)
    await vi.waitFor(() => expect(transport.respond).toHaveBeenCalledWith(7, { decision: 'accept' }))
    expect(projection.list('execution-1').find((item) => item.type === 'approval')).toMatchObject({ status: 'in_progress' })
    expect(resolved).not.toHaveBeenCalled()
    deliver({ method: 'serverRequest/resolved', params: { threadId: 'thread-1', requestId: '7' } })
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(resolved).not.toHaveBeenCalled()
    deliver({ method: 'serverRequest/resolved', params: { threadId: 'thread-1', requestId: 7 } })
    await vi.waitFor(() => expect(resolved).toHaveBeenCalledOnce())
    expect(projection.list('execution-1').find((item) => item.type === 'approval')).toMatchObject({ status: 'completed', decision: 'accept' })
    deliver(completedTurn())
    expect((await continued).locator).toEqual(waiting.locator)
    expect(transport.requests.filter((request) => request.method === 'turn/start')).toHaveLength(1)
  })

  it('resolves a file approval from the final Item and ignores retransmitted requests', async () => {
    const params = { threadId: 'thread-1', turnId: 'turn-1', itemId: 'file-1' }
    const request = { id: 'file-request', method: 'item/fileChange/requestApproval', params }
    const transport = new ControlledTransport([request])
    const session = createCodexSessionModule({ createTransport: () => transport })
    let received!: CodexRuntimeApprovalRequest
    const approval = vi.fn((request: CodexRuntimeApprovalRequest) => { received = request })
    await session.runTurn({ cwd: '/work/demo', command: 'codex', workUnit: { kind: 'phase', runId: 'run-1', phaseId: 'discovery' }, input: 'run', onApproval: approval })
    const resolved = vi.fn(async () => undefined)
    transport.enqueue(
      { method: 'item/completed', params: { ...params, item: { id: 'file-1', type: 'fileChange', status: 'declined', changes: [] } } },
      request, completedTurn(),
    )
    const result = await session.respondToApproval(received, 'decline', false, resolved)
    expect(result.status).toBe('completed')
    expect(resolved).toHaveBeenCalledOnce()
    expect(approval).toHaveBeenCalledOnce()
    expect(transport.respond).toHaveBeenCalledTimes(1)
  })

  it('keeps distinct approvals for the same Item visible within one Turn', async () => {
    const params = { threadId: 'thread-1', turnId: 'turn-1', itemId: 'command-1' }
    const first = { id: 1, method: 'item/commandExecution/requestApproval', params: { ...params, command: 'git status', reason: 'First callback' } }
    const second = { id: 2, method: first.method, params: { ...params, command: 'git diff', reason: 'Second callback' } }
    const transport = new ControlledTransport([first])
    const projection = createCodexItemProjection({ publish: () => undefined })
    const session = createCodexSessionModule({ createTransport: () => transport, itemProjection: projection })
    let received!: CodexRuntimeApprovalRequest
    await session.runTurn({ cwd: '/work/demo', command: 'codex', executionId: 'execution-1', workUnit: { kind: 'phase', runId: 'run-1', phaseId: 'discovery' }, input: 'run', onApproval: (request) => { received = request } })
    transport.enqueue({ method: 'serverRequest/resolved', params: { threadId: params.threadId, requestId: 1 } }, second)
    expect((await session.respondToApproval(received, 'decline')).status).toBe('waiting')
    expect(projection.list('execution-1').filter((item) => item.type === 'approval')).toEqual([
      expect.objectContaining({ requestId: 1, decision: 'decline', status: 'declined' }),
      expect.objectContaining({ requestId: 2, reason: 'Second callback', decision: null, status: 'in_progress' }),
    ])
    transport.enqueue(completedTurn())
    await session.respondToApproval(received, 'accept')
    expect(transport.requests.filter((request) => request.method === 'turn/start')).toHaveLength(1)
  })

  it('retains a pending approval request after returning waiting and responds through its original transport', async () => {
    const approval = { id: 'approval-1', method: 'item/commandExecution/requestApproval', params: { threadId: 'thread-1', turnId: 'turn-1', command: 'git status' } }
    const transport = new ControlledTransport([approval])
    const session = createCodexSessionModule({ createTransport: async () => transport })
    let received: CodexRuntimeApprovalRequest | null = null

    const result = await session.runTurn({
      cwd: '/work/demo',
      command: 'codex',
      workUnit: { kind: 'phase', runId: 'run-1', phaseId: 'approval-wait' },
      input: 'run',
      onApproval: async (request) => {
        received = request
        return undefined
      }
    })

    expect(result.status).toBe('waiting')
    expect(received).toEqual({ id: expect.stringMatching(/^runtime-approval-/), kind: 'command', summary: 'Runtime Approval：git status' })
    expect(transport.respond).not.toHaveBeenCalled()
    expect(transport.close).not.toHaveBeenCalled()

    transport.enqueue(completedTurn())
    await session.respondToApproval(received!, 'accept')
    expect(transport.respond).toHaveBeenCalledWith('approval-1', { decision: 'accept' })
    expect(transport.close).toHaveBeenCalledOnce()
    await session.close()
  })

  it('continues the original Turn after responding to Runtime Approval', async () => {
    const approval = { id: 'approval-2', method: 'item/fileChange/requestApproval', params: { threadId: 'thread-1', turnId: 'turn-1', reason: 'write file' } }
    const transport = new ControlledTransport([approval])
    const session = createCodexSessionModule({ createTransport: async () => transport })
    const completed = vi.fn(async () => undefined)
    let received: CodexRuntimeApprovalRequest | null = null

    const waiting = await session.runTurn({
      cwd: '/work/demo', command: 'codex', workUnit: { kind: 'phase', runId: 'run-1', phaseId: 'approval-continue' }, input: 'run',
      onApproval: async (request) => { received = request; return undefined },
      onTurnCompleted: completed
    })
    expect(waiting.status).toBe('waiting')

    transport.enqueue(completedTurn())
    await session.respondToApproval(received!, { decision: 'accept' })

    expect(transport.requests.map(({ method }) => method)).toEqual(['initialize', 'thread/start', 'turn/start'])
    expect(transport.respond).toHaveBeenCalledWith('approval-2', { decision: 'accept' })
    expect(completed).toHaveBeenCalledWith(expect.objectContaining({ status: 'completed', locator: waiting.locator }))
    expect(transport.close).toHaveBeenCalledOnce()
  })

  it('projects a user-input request and immediate response while returning a question Runtime Event', async () => {
    const request = {
      id: 'question-request',
      method: 'item/tool/requestUserInput',
      params: {
        threadId: 'thread-1', turnId: 'turn-1', itemId: 'question-item',
        questions: [{ id: 'choice', header: 'Choice', question: 'Choose one', options: [{ label: 'A', description: 'First' }] }]
      }
    }
    const transport = new ControlledTransport([request, completedTurn()])
    const projection = createCodexItemProjection()
    const session = createCodexSessionModule({ createTransport: async () => transport, itemProjection: projection })

    const result = await session.runTurn({
      cwd: '/work/demo', command: 'codex', executionId: 'execution-question',
      workUnit: { kind: 'phase', runId: 'run-1', phaseId: 'question' }, input: 'run',
      permissionPolicy: { grantedPermissions: ['workspace.read'] },
      onApproval: async () => ({ answers: { choice: { answers: ['A'] } } })
    })

    expect(result.events).toContainEqual({ type: 'question', question: 'Choose one' })
    expect(projection.list('execution-question').filter((item) => item.type !== 'turn')).toEqual([
      expect.objectContaining({ id: 'question:question-item', type: 'question', status: 'completed', answers: { choice: ['A'] } })
    ])
  })

  it('passes the Project Permission Policy as a final constrained Session configuration', async () => {
    const transport = new ControlledTransport([completedTurn()])
    const session = createCodexSessionModule({ createTransport: async () => transport })

    await session.runTurn({
      cwd: '/work/demo', command: 'codex', workUnit: { kind: 'phase', runId: 'run-1', phaseId: 'permission-policy' }, input: 'run',
      permissionPolicy: {
        grantedPermissions: ['workspace.read'],
        allowedPaths: ['/work/demo'],
        allowedCommands: ['git'],
        allowedNetworkHosts: ['github.com']
      },
      sandbox: 'workspace-write',
      approvalPolicy: 'never'
    })

    expect(transport.requests[1]?.params).toEqual(expect.objectContaining({
      sandbox: 'read-only',
      approvalPolicy: 'on-request'
    }))
    expect(transport.requests[2]?.params).toEqual(expect.objectContaining({
      sandboxPolicy: { type: 'readOnly', networkAccess: false },
      approvalPolicy: 'on-request'
    }))
  })

  it('does not allow an explicit sandbox override to exceed the Project Permission Policy', async () => {
    const transport = new ControlledTransport([completedTurn()])
    const session = createCodexSessionModule({ createTransport: async () => transport })

    await session.runTurn({
      cwd: '/work/demo', command: 'codex', workUnit: { kind: 'phase', runId: 'run-1', phaseId: 'sandbox-convergence' }, input: 'run',
      permissionPolicy: { grantedPermissions: ['workspace.read', 'workspace.write'] },
      sandbox: 'danger-full-access'
    })

    expect(transport.requests[1]?.params.sandbox).toBe('workspace-write')
    expect(transport.requests[2]?.params.sandboxPolicy).toEqual(expect.objectContaining({ type: 'workspaceWrite' }))
  })

  it('renegotiates on every new connection and reports the new version and missing capabilities', async () => {
    const transports = [
      new ControlledTransport([], 'thread-1'),
      new ControlledTransport([], 'thread-2', { methods: ['thread/start'], events: [] }, 'codex-cli/0.200.0')
    ]
    const session = createCodexSessionModule({
      createTransport: async () => transports.shift()!
    })

    const first = await session.preflight({ cwd: '/work/demo', command: 'codex' })
    expect(first.compatible).toBe(true)
    const second = await session.preflight({ cwd: '/work/demo', command: 'codex' })
    expect(second.compatible).toBe(false)
    expect(second.version).toBe('0.200.0')
    expect(second.missingCapabilities).toContain('turn/start')
    expect(second.reason).toContain('0.200.0')
  })

  it('reads a Thread with complete Turn history after renegotiating capabilities', async () => {
    const transport = new ControlledTransport()
    const session = createCodexSessionModule({ createTransport: async () => transport })

    await session.readThread({ cwd: '/work/demo', command: 'codex', locator: { threadId: 'thread-history' } })

    expect(transport.requests.map(({ method }) => method)).toEqual(['initialize', 'thread/read'])
    expect(transport.requests[1]?.params).toEqual({ threadId: 'thread-history', includeTurns: true })
  })

  it('selects only the Runtime Locator Turn when reading history', async () => {
    const transport = new ControlledTransport()
    transport.request = async (method: string, params: Record<string, unknown>): Promise<unknown> => {
      transport.requests.push({ method, params })
      if (method === 'initialize') return { userAgent: 'codex-cli/0.144.3', capabilities: { methods: ['thread/start', 'thread/resume', 'thread/read', 'turn/start', 'turn/interrupt'], events: ['item/started', 'item/completed', 'turn/completed'] } }
      if (method === 'thread/read') return { thread: { id: 'thread-history', turns: [{ id: 'turn-1' }, { id: 'turn-2' }] } }
      throw new Error(`Unexpected request: ${method}`)
    }
    const session = createCodexSessionModule({ createTransport: async () => transport })

    const history = await session.readThread({ cwd: '/work/demo', command: 'codex', locator: { threadId: 'thread-history', turnId: 'turn-2' } })

    expect(history).toEqual({ thread: { id: 'thread-history', turns: [{ id: 'turn-2' }] } })
  })

  it('restores a selected historical Turn into the Display Projection', async () => {
    const transport = new ControlledTransport()
    transport.request = async (method: string, params: Record<string, unknown>): Promise<unknown> => {
      transport.requests.push({ method, params })
      if (method === 'initialize') return { userAgent: 'codex-cli/0.144.3', capabilities: { methods: ['thread/start', 'thread/resume', 'thread/read', 'turn/start', 'turn/interrupt'], events: ['item/started', 'item/completed', 'turn/completed'] } }
      if (method === 'thread/read') return { thread: { id: 'thread-history', turns: [{ id: 'turn-history', items: [{ type: 'agentMessage', id: 'historical-final', phase: 'final_answer', text: 'Recovered' }] }] } }
      throw new Error(`Unexpected request: ${method}`)
    }
    const projection = createCodexItemProjection()
    const session = createCodexSessionModule({ createTransport: async () => transport, itemProjection: projection })
    const locator = { runtimeProvider: 'codex', threadId: 'thread-history', turnId: 'turn-history', runtimeVersion: '0.144.3' }

    await session.readThread({
      cwd: '/work/demo', command: 'codex', locator,
      projectionScope: { runId: 'run-history', executionId: 'execution-history', permissionPolicy: { grantedPermissions: ['workspace.read'] }, source: 'codex app-server' }
    })

    expect(projection.list('execution-history').filter((item) => item.type !== 'turn')).toEqual([
      expect.objectContaining({ id: 'historical-final', type: 'final_response', status: 'completed', text: 'Recovered', runtimeLocator: locator })
    ])
  })

  it('fails closed when the Runtime Locator Turn is absent from history', async () => {
    const transport = new ControlledTransport()
    transport.request = async (method: string, params: Record<string, unknown>): Promise<unknown> => {
      transport.requests.push({ method, params })
      if (method === 'initialize') return { userAgent: 'codex-cli/0.144.3', capabilities: { methods: ['thread/start', 'thread/resume', 'thread/read', 'turn/start', 'turn/interrupt'], events: ['item/started', 'item/completed', 'turn/completed'] } }
      if (method === 'thread/read') return { thread: { id: 'thread-history', turns: [{ id: 'turn-1' }] } }
      throw new Error(`Unexpected request: ${method}`)
    }
    const session = createCodexSessionModule({ createTransport: async () => transport })

    await expect(session.readThread({ cwd: '/work/demo', command: 'codex', locator: { threadId: 'thread-history', turnId: 'turn-missing' } })).rejects.toThrow('未返回指定的 Turn 历史')
    expect(transport.close).toHaveBeenCalledOnce()
  })

  it('rebuilds final Items across ordered Turns with the same contract as live completion, even without a recorded version', async () => {
    const items = [
      { id: 'reply', type: 'agentMessage', phase: 'final_answer', text: 'Finished' },
      { id: 'command', type: 'commandExecution', command: 'pnpm test', aggregatedOutput: 'PASS', status: 'completed', exitCode: 0, durationMs: 42 },
      { id: 'files', type: 'fileChange', status: 'completed', changes: [{ path: 'src/app.ts', kind: { type: 'update' }, diff: '+done\n-old' }] },
      { id: 'tool', type: 'mcpToolCall', server: 'docs', tool: 'read', status: 'completed', result: { content: [{ type: 'text', text: 'Found documentation' }] } },
    ]
    const projection = createCodexItemProjection()
    const live = createCodexItemProjection()
    const session = createCodexSessionModule({ itemProjection: projection, createTransport: () => {
      const transport = new ControlledTransport()
      const request = transport.request.bind(transport)
      transport.request = (method, params) => method === 'thread/read'
        ? Promise.resolve({ thread: { id: 'thread-history', turns: [
          { id: 'unrelated', status: 'completed', items: [{ id: 'private', type: 'agentMessage', text: 'Other attempt' }] },
          { id: 'second', status: 'completed', items }, { id: 'first', status: 'completed', items },
        ] } }) : request(method, params)
      return transport
    } })
    for (const turnId of ['first', 'second']) {
      const locator = { runtimeProvider: 'codex', threadId: 'thread-history', turnId, runtimeVersion: '' }
      const projectionScope = { runId: 'run-history', executionId: 'execution-history', permissionPolicy: { grantedPermissions: [] }, source: 'codex app-server' }
      for (const item of items) live.handle({ method: 'item/completed', params: { threadId: locator.threadId, turnId, item } }, { ...projectionScope, runtimeLocator: locator })
      await session.readThread({ cwd: '/work/demo', command: 'codex', locator, projectionScope })
      await session.readThread({ cwd: '/work/demo', command: 'codex', locator, projectionScope })
    }
    const restored = projection.list('execution-history').filter((item) => item.type !== 'turn')
    expect(restored).toHaveLength(8)
    expect(restored).toEqual(live.list('execution-history'))
    expect(restored.map((item) => [item.runtimeLocator.turnId, item.type])).toEqual([
      ['first', 'final_response'], ['first', 'command'], ['first', 'file_change'], ['first', 'tool'],
      ['second', 'final_response'], ['second', 'command'], ['second', 'file_change'], ['second', 'tool'],
    ])
  })

  it.each(['interrupted', 'failed'] as const)('restores unfinished commands in a %s Turn with the live terminal status', async (status) => {
    const command = { id: 'command', type: 'commandExecution', command: 'pnpm test', status: 'inProgress', aggregatedOutput: 'Starting tests' }
    const locator = { runtimeProvider: 'codex', threadId: 'thread-history', turnId: 'first', runtimeVersion: '0.144.3' }
    const projectionScope = { runId: 'run-history', executionId: 'execution-history', permissionPolicy: { grantedPermissions: [] }, source: 'codex app-server' }
    const transport = new ControlledTransport()
    const request = transport.request.bind(transport)
    transport.request = (method, params) => method === 'thread/read'
      ? Promise.resolve({ thread: { id: locator.threadId, turns: [{ id: locator.turnId, status, items: [command] }] } }) : request(method, params)
    const projection = createCodexItemProjection()
    const live = createCodexItemProjection()
    live.handle({ method: 'item/started', params: { threadId: locator.threadId, turnId: locator.turnId, item: command } }, { ...projectionScope, runtimeLocator: locator })
    live.completeTurn(status, null, { ...projectionScope, runtimeLocator: locator })
    const session = createCodexSessionModule({ createTransport: () => transport, itemProjection: projection })
    await session.readThread({ cwd: '/work/demo', command: 'codex', locator, projectionScope })
    expect(projection.list('execution-history').find((item) => item.type === 'command')).toEqual(live.list('execution-history').find((item) => item.type === 'command'))
    expect(projection.list('execution-history').find((item) => item.type === 'command')?.status).toBe(status === 'interrupted' ? 'declined' : 'failed')
  })

  it.each([
    { id: 'wrong-thread', turns: [{ id: 'turn-history', items: [] }] },
    { id: 'thread-history', turns: [{ id: 'turn-history' }] },
  ])('rejects mismatched or unreadable history instead of projecting an empty success: %j', async (thread) => {
    const transport = new ControlledTransport()
    const request = transport.request.bind(transport)
    transport.request = (method, params) => method === 'thread/read' ? Promise.resolve({ thread }) : request(method, params)
    const projection = createCodexItemProjection()
    const session = createCodexSessionModule({ createTransport: () => transport, itemProjection: projection })

    await expect(session.readThread({
      cwd: '/work/demo', command: 'codex',
      locator: { runtimeProvider: 'codex', threadId: 'thread-history', turnId: 'turn-history', runtimeVersion: '' },
      projectionScope: { runId: 'run-history', executionId: 'execution-history', permissionPolicy: { grantedPermissions: [] }, source: 'codex app-server' }
    })).rejects.toThrow('Thread 历史无效')
    expect(projection.list('execution-history')).toEqual([])
    expect(transport.close).toHaveBeenCalledOnce()
  })
})
