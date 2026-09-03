// @vitest-environment node

import { describe, expect, it, vi } from 'vitest'

import type { CodexAppServerMessage } from './codex-app-server-transport'
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
    return request?.method && request.id !== undefined ? request as unknown as CodexRuntimeApprovalRequest : null
  }

}

function completedTurn(threadId = 'thread-1') {
  return { method: 'turn/completed', params: { threadId, turn: { id: 'turn-1', status: 'completed', error: null } } }
}

describe('Codex Session Module', () => {
  it('reports explicit missing capabilities during negotiation', async () => {
    const transport = new ControlledTransport([], 'thread-1', { methods: ['thread/start'], events: [] })
    const session = createCodexSessionModule({ createTransport: async () => transport })

    const result = await session.preflight({ cwd: '/work/demo', command: 'codex' })

    expect(result.compatible).toBe(false)
    expect(result.missingCapabilities).toEqual(expect.arrayContaining(['thread/resume', 'thread/read', 'turn/start', 'turn/interrupt', 'events:item/completed']))
    expect(result.reason).toContain('turn/start')
  })

  it('blocks when the App Server omits a capability description', async () => {
    const transport = new ControlledTransport()
    transport.request = async (method: string, params: Record<string, unknown>): Promise<unknown> => {
      transport.requests.push({ method, params })
      if (method === 'initialize') return { userAgent: 'codex-cli/0.144.3' }
      throw new Error(`Unexpected request: ${method}`)
    }
    const session = createCodexSessionModule({ createTransport: async () => transport })

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

    const first = await session.runTurn({ cwd: '/work/demo', command: 'codex', workUnitKey: 'implementation-ticket:ticket-1', input: 'first' })
    const second = await session.runTurn({ cwd: '/work/demo', command: 'codex', workUnitKey: 'implementation-ticket:ticket-1', input: 'continue' })
    const third = await session.runTurn({ cwd: '/work/demo', command: 'codex', workUnitKey: 'implementation-ticket:ticket-2', input: 'next' })

    expect(first.locator.threadId).toBe(second.locator.threadId)
    expect(third.locator.threadId).not.toBe(second.locator.threadId)
    expect(transports[1]?.requests.map(({ method }) => method)).toEqual(['initialize', 'thread/resume', 'turn/start'])
  })

  it('publishes the Runtime Locator before waiting for Turn notifications', async () => {
    const transport = new ControlledTransport([completedTurn()])
    const session = createCodexSessionModule({ createTransport: async () => transport })
    const onLocator = vi.fn(async () => undefined)

    await session.runTurn({ cwd: '/work/demo', command: 'codex', workUnitKey: 'requirements', input: 'run', onLocator })

    expect(onLocator).toHaveBeenCalledWith(expect.objectContaining({ threadId: 'thread-1', turnId: 'turn-1' }))
  })

  it('interrupts an active Turn and responds to an original Runtime approval request', async () => {
    let resolveNotification: ((value: unknown) => void) | undefined
    const transport = new ControlledTransport()
    transport.nextMessage = vi.fn(() => new Promise((resolve) => { resolveNotification = resolve })) as never
    const session = createCodexSessionModule({ createTransport: async () => transport })
    const approval = { id: 42, method: 'item/commandExecution/requestApproval', params: { threadId: 'thread-1', turnId: 'turn-1', command: 'git status' } } satisfies CodexRuntimeApprovalRequest
    const run = session.runTurn({ cwd: '/work/demo', command: 'codex', workUnitKey: 'discovery', input: 'run', onApproval: async (request) => request.id === 42 ? 'accept' : 'decline' })

    await vi.waitFor(() => expect(transport.requests.map(({ method }) => method)).toContain('turn/start'))
    await session.interrupt({ threadId: 'thread-1', turnId: 'turn-1' })
    await session.respondToApproval(approval, 'decline')
    expect(transport.respond).toHaveBeenCalledWith(42, 'decline')
    resolveNotification?.(completedTurn())
    await run

    expect(transport.requests).toEqual(expect.arrayContaining([{ method: 'turn/interrupt', params: { threadId: 'thread-1', turnId: 'turn-1' } }]))
  })

  it('retains a pending approval request after returning waiting and responds through its original transport', async () => {
    const approval = { id: 'approval-1', method: 'item/commandExecution/requestApproval', params: { threadId: 'thread-1', turnId: 'turn-1', command: 'git status' } } satisfies CodexRuntimeApprovalRequest
    const transport = new ControlledTransport([approval])
    const session = createCodexSessionModule({ createTransport: async () => transport })
    let received: CodexRuntimeApprovalRequest | null = null

    const result = await session.runTurn({
      cwd: '/work/demo',
      command: 'codex',
      workUnitKey: 'approval-wait',
      input: 'run',
      onApproval: async (request) => {
        received = request
        return undefined
      }
    })

    expect(result.status).toBe('waiting')
    expect(received).toBeTruthy()
    expect(transport.respond).not.toHaveBeenCalled()
    expect(transport.close).not.toHaveBeenCalled()

    await session.respondToApproval(received!, 'accept')
    expect(transport.respond).toHaveBeenCalledWith('approval-1', 'accept')
    await session.close()
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
})
