// @vitest-environment node

import { describe, expect, it, vi } from 'vitest'

import { APP_SHELL_CHANNELS } from '../shared/app-shell'
import type { RuntimeItemProjectionUpdate } from '../shared/workflow-run'
import { publishRuntimeItemUpdate, registerRuntimeItemHandlers } from './runtime-item-ipc'

const update: RuntimeItemProjectionUpdate = {
  runId: 'run-1',
  executionId: 'execution-1',
  item: { id: 'item-1', runId: 'run-1', executionId: 'execution-1', type: 'agent_message', status: 'in_progress', text: 'Hello' }
}

describe('Runtime Item IPC', () => {
  it('lists the current in-memory projection through a controlled handler', async () => {
    const handlers = new Map<string, (...args: unknown[]) => unknown>()
    const item = update.item
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

    expect(() => publishRuntimeItemUpdate([unavailable, available], update)).not.toThrow()
    expect(available.webContents.send).toHaveBeenCalledWith(APP_SHELL_CHANNELS.runtimeItemUpdated, update)
  })
})
