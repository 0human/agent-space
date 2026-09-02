// @vitest-environment node

import { describe, expect, it, vi } from 'vitest'

import type { RuntimeExecutionContext } from '../shared/workflow-run'
import { createCodexRuntimeAdapter } from './codex-runtime'

interface JsonRpcNotification {
  method: string
  params?: Record<string, unknown>
}

class ControlledTransport {
  readonly requests: Array<{ method: string; params: Record<string, unknown> }> = []
  readonly notifications: Array<{ method: string; params: Record<string, unknown> }> = []
  readonly close = vi.fn(async () => undefined)

  constructor(
    private readonly responses: Record<string, unknown>,
    private readonly incoming: JsonRpcNotification[]
  ) {}

  async request(method: string, params: Record<string, unknown>): Promise<unknown> {
    this.requests.push({ method, params })
    const response = this.responses[method]
    if (response instanceof Error) throw response
    return response
  }

  async notify(method: string, params: Record<string, unknown>): Promise<void> {
    this.notifications.push({ method, params })
  }

  async nextNotification(): Promise<JsonRpcNotification | null> {
    return this.incoming.shift() ?? null
  }
}

function executionContext(overrides: Partial<RuntimeExecutionContext> = {}): RuntimeExecutionContext {
  return {
    runId: 'run-1',
    project: { workspacePath: '/work/demo', defaultBranch: 'main' } as never,
    workspace: { path: '/work/demo' },
    idea: 'Implement the requested Step',
    workflow: { phases: [{ id: 'implementation', name: 'Implementation', goal: 'Build', steps: [] }] } as never,
    phaseIndex: 0,
    stepIndex: 0,
    execution: { id: 'execution-1', runtimeLocators: [] } as never,
    skill: null,
    phaseContext: null,
    inputArtifacts: [],
    decisionRecords: [],
    permissionPolicy: { grantedPermissions: ['workspace.read', 'workspace.write'] },
    events: [],
    ...overrides
  }
}

function successfulTransport(incoming: JsonRpcNotification[], threadId = 'thread-1', turnId = 'turn-1'): ControlledTransport {
  return new ControlledTransport({
    initialize: { userAgent: 'codex-cli/0.144.3' },
    'thread/start': { thread: { id: threadId } },
    'thread/resume': { thread: { id: threadId } },
    'turn/start': { turn: { id: turnId } }
  }, incoming)
}

describe('Codex App Server Agent Runtime Adapter contract', () => {
  it('initializes stdio JSON-RPC, starts a Thread and Turn, and maps supported final Items', async () => {
    const persistRuntimeLocator = vi.fn(async () => undefined)
    const transport = successfulTransport([
      { method: 'future/notification', params: { value: 'ignored' } },
      { method: 'item/completed', params: { threadId: 'thread-1', turnId: 'turn-1', item: { type: 'agentMessage', id: 'item-1', text: 'Step complete.' } } },
      { method: 'item/completed', params: { threadId: 'thread-1', turnId: 'turn-1', item: { type: 'plan', id: 'item-2', text: 'Unsupported in this projection.' } } },
      { method: 'item/completed', params: { threadId: 'thread-1', turnId: 'turn-1', item: { type: 'agentMessage', id: 'item-3', text: 'ARTIFACT: ' + JSON.stringify({ type: 'domain-context', name: 'CONTEXT.md', location: '/work/demo/CONTEXT.md' }) } } },
      { method: 'turn/completed', params: { threadId: 'thread-1', turn: { id: 'turn-1', status: 'completed', error: null } } }
    ])
    const adapter = createCodexRuntimeAdapter({
      command: '/definitely-missing-agent-space-codex',
      createTransport: async () => transport
    } as never)

    const events = await adapter.execute(executionContext({ persistRuntimeLocator } as never))

    expect(transport.requests.map((request) => request.method)).toEqual(['initialize', 'thread/start', 'turn/start'])
    expect(transport.notifications).toEqual([{ method: 'initialized', params: {} }])
    expect(transport.requests[1]?.params).toMatchObject({ cwd: '/work/demo', approvalPolicy: 'never', sandbox: 'workspace-write' })
    expect(transport.requests[2]?.params).toMatchObject({ threadId: 'thread-1', input: [expect.objectContaining({ type: 'text' })] })
    expect(persistRuntimeLocator).toHaveBeenCalledWith({ runtimeProvider: 'codex', threadId: 'thread-1', turnId: 'turn-1', runtimeVersion: '0.144.3' })
    expect(events).toEqual([
      expect.objectContaining({
        type: 'text_delta',
        text: 'Step complete.',
        runtimeLocator: { runtimeProvider: 'codex', threadId: 'thread-1', turnId: 'turn-1', runtimeVersion: '0.144.3' }
      }),
      expect.objectContaining({
        type: 'artifact_produced',
        artifact: { type: 'domain-context', name: 'CONTEXT.md', location: '/work/demo/CONTEXT.md' },
        runtimeLocator: { runtimeProvider: 'codex', threadId: 'thread-1', turnId: 'turn-1', runtimeVersion: '0.144.3' }
      }),
      expect.objectContaining({
        type: 'status_changed',
        status: 'completed',
        runtimeLocator: { runtimeProvider: 'codex', threadId: 'thread-1', turnId: 'turn-1', runtimeVersion: '0.144.3' }
      })
    ])
    expect(transport.close).toHaveBeenCalledOnce()
  })

  it('sends the current Implementation Ticket and maps its progress protocol', async () => {
    const transport = successfulTransport([
      { method: 'item/completed', params: { threadId: 'thread-1', turnId: 'turn-1', item: { type: 'agentMessage', id: 'item-1', text: 'TICKET_PROGRESS: {"stage":"testing","status":"running"}' } } },
      { method: 'turn/completed', params: { threadId: 'thread-1', turn: { id: 'turn-1', status: 'completed', error: null } } }
    ])
    const adapter = createCodexRuntimeAdapter({ command: '/definitely-missing-agent-space-codex', createTransport: async () => transport } as never)

    const events = await adapter.execute(executionContext({
      implementationTicket: {
        id: 'ticket-2', runId: 'run-1', sourceArtifactId: 'artifact-2', title: 'Expose progress', location: 'https://github.com/example/demo/issues/2', position: 2,
        status: 'running', stages: { implementation: 'completed', testing: 'running', review: 'pending', commit: 'pending' }, threadId: 'thread-1',
        result: { attemptCount: 1, failedAttemptCount: 0, artifactIds: [] }, startedAt: null, finishedAt: null
      }
    }))

    const turnInput = transport.requests.find((request) => request.method === 'turn/start')?.params.input as Array<{ text: string }>
    expect(turnInput[0]?.text).toContain('Implementation Ticket: ticket-2 · 2 · Expose progress')
    expect(events).toEqual([
      expect.objectContaining({ type: 'ticket_progress', stage: 'testing', status: 'running' }),
      expect.objectContaining({ type: 'status_changed', status: 'completed' })
    ])
  })

  it('completes the Turn when live Item projection fails', async () => {
    const transport = successfulTransport([
      { method: 'item/started', params: { threadId: 'thread-1', turnId: 'turn-1', item: { type: 'agentMessage', id: 'item-1', text: '' } } },
      { method: 'item/agentMessage/delta', params: { threadId: 'thread-1', turnId: 'turn-1', itemId: 'item-1', delta: 'Draft' } },
      { method: 'item/completed', params: { threadId: 'thread-1', turnId: 'turn-1', item: { type: 'agentMessage', id: 'item-1', text: 'Final' } } },
      { method: 'turn/completed', params: { threadId: 'thread-1', turn: { id: 'turn-1', status: 'completed', error: null } } }
    ])
    const itemProjection = { handle: vi.fn(() => { throw new Error('Renderer IPC unavailable') }) }
    const adapter = createCodexRuntimeAdapter({
      command: '/definitely-missing-agent-space-codex',
      createTransport: async () => transport,
      itemProjection
    } as never)

    await expect(adapter.execute(executionContext())).resolves.toEqual([
      expect.objectContaining({ type: 'text_delta', text: 'Final' }),
      expect.objectContaining({ type: 'status_changed', status: 'completed' })
    ])
    expect(itemProjection.handle).toHaveBeenCalledTimes(4)
  })

  it('resumes the Thread recorded by the Step Execution before starting a new Turn', async () => {
    const transport = successfulTransport([
      { method: 'turn/completed', params: { threadId: 'thread-9', turn: { id: 'turn-10', status: 'completed', error: null } } }
    ], 'thread-9', 'turn-10')
    const adapter = createCodexRuntimeAdapter({ command: '/definitely-missing-agent-space-codex', createTransport: async () => transport } as never)

    await adapter.execute(executionContext({
      execution: {
        id: 'execution-1',
        runtimeLocators: [{ runtimeProvider: 'codex', threadId: 'thread-9', turnId: 'turn-9', runtimeVersion: '0.143.0' }]
      } as never
    }))

    expect(transport.requests.map((request) => request.method)).toEqual(['initialize', 'thread/resume', 'turn/start'])
    expect(transport.requests[1]?.params).toEqual(expect.objectContaining({ threadId: 'thread-9' }))
  })

  it.each([
    {
      status: 'failed',
      error: { message: 'Model request failed.' },
      expected: { type: 'error', error: 'Model request failed.' }
    },
    {
      status: 'interrupted',
      error: null,
      expected: { type: 'status_changed', status: 'paused' }
    }
  ])('maps a $status Turn to a provider-neutral terminal event', async ({ status, error, expected }) => {
    const transport = successfulTransport([
      { method: 'turn/completed', params: { threadId: 'thread-1', turn: { id: 'turn-1', status, error } } }
    ])
    const adapter = createCodexRuntimeAdapter({ command: '/definitely-missing-agent-space-codex', createTransport: async () => transport } as never)

    await expect(adapter.execute(executionContext())).resolves.toEqual([
      expect.objectContaining(expected)
    ])
  })

  it('interrupts the active App Server Turn through its Runtime Locator', async () => {
    let releaseNotification!: (notification: JsonRpcNotification) => void
    const transport = successfulTransport([])
    transport.nextNotification = vi.fn(() => new Promise<JsonRpcNotification | null>((resolve) => { releaseNotification = resolve }))
    const originalRequest = transport.request.bind(transport)
    transport.request = vi.fn(async (method: string, params: Record<string, unknown>) => {
      const response = await originalRequest(method, params)
      if (method === 'turn/interrupt') {
        releaseNotification({ method: 'turn/completed', params: { threadId: 'thread-1', turn: { id: 'turn-1', status: 'interrupted', error: null } } })
      }
      return response
    })
    const adapter = createCodexRuntimeAdapter({ command: '/definitely-missing-agent-space-codex', createTransport: async () => transport } as never)
    const execution = adapter.execute(executionContext())

    await vi.waitFor(() => expect(transport.requests.map((request) => request.method)).toContain('turn/start'))
    await adapter.interrupt?.({
      runId: 'run-1',
      executionId: 'execution-1',
      runtimeLocator: { runtimeProvider: 'codex', threadId: 'thread-1', turnId: 'turn-1', runtimeVersion: '0.144.3' }
    })

    await expect(execution).resolves.toEqual([expect.objectContaining({ type: 'status_changed', status: 'paused' })])
    expect(transport.requests).toEqual(expect.arrayContaining([
      expect.objectContaining({ method: 'turn/interrupt', params: { threadId: 'thread-1', turnId: 'turn-1' } })
    ]))
  })

  it('returns a provider-neutral error when an App Server request fails', async () => {
    const transport = new ControlledTransport({
      initialize: { userAgent: 'codex-cli/0.144.3' },
      'thread/start': new Error('Thread unavailable')
    }, [])
    const adapter = createCodexRuntimeAdapter({ command: '/definitely-missing-agent-space-codex', createTransport: async () => transport } as never)

    await expect(adapter.execute(executionContext())).resolves.toEqual([
      expect.objectContaining({ type: 'error', error: 'Thread unavailable', provider: 'codex' })
    ])
    expect(transport.close).toHaveBeenCalledOnce()
  })

  it('preserves a network failure reason and the execution Permission Policy', async () => {
    const transport = new ControlledTransport({
      initialize: { userAgent: 'codex-cli/0.144.3' },
      'thread/start': new Error('connection refused by local App Server')
    }, [])
    const adapter = createCodexRuntimeAdapter({ command: '/definitely-missing-agent-space-codex', createTransport: async () => transport } as never)

    await expect(adapter.execute(executionContext())).resolves.toEqual([
      expect.objectContaining({
        type: 'status_changed',
        status: 'blocked',
        reason: 'connection refused by local App Server',
        permissionPolicy: { grantedPermissions: ['workspace.read', 'workspace.write'] }
      })
    ])
  })
})
