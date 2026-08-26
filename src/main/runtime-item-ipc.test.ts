// @vitest-environment node

import { describe, expect, it, vi } from 'vitest'

import { APP_SHELL_CHANNELS } from '../shared/app-shell'
import type { RuntimeItem } from '../shared/workflow-run'
import { publishRuntimeItemUpdate, registerRuntimeItemHandlers } from './runtime-item-ipc'

const item: RuntimeItem = {
  id: 'item-1',
  runId: 'run-1',
  executionId: 'execution-1',
  type: 'agent_message',
  status: 'in_progress',
  text: 'Hello',
  provider: 'codex',
  source: 'codex app-server',
  permissionPolicy: { grantedPermissions: ['workspace.read'] },
  runtimeLocator: { runtimeProvider: 'codex', threadId: 'thread-1', turnId: 'turn-1', runtimeVersion: '0.144.3' }
}

describe('Runtime Item IPC', () => {
  it('lists the current in-memory projection through a controlled handler', async () => {
    const handlers = new Map<string, (...args: unknown[]) => unknown>()
    const projection = { list: vi.fn().mockReturnValue([item]) }

    registerRuntimeItemHandlers({
      handle: (channel, listener) => handlers.set(channel, listener),
      projection
    })

    await expect(handlers.get(APP_SHELL_CHANNELS.listRuntimeItems)?.({}, 'execution-1')).resolves.toEqual([item])
    expect(projection.list).toHaveBeenCalledWith('execution-1')
  })

  it('continues broadcasting when one Renderer IPC send fails', () => {
    const unavailable = { webContents: { send: vi.fn(() => { throw new Error('Renderer unavailable') }) } }
    const available = { webContents: { send: vi.fn() } }

    expect(() => publishRuntimeItemUpdate([unavailable, available], item)).not.toThrow()
    expect(available.webContents.send).toHaveBeenCalledWith(APP_SHELL_CHANNELS.runtimeItemUpdated, item)
  })
})
