// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest'

const exposeInMainWorld = vi.fn()
const invoke = vi.fn()

vi.mock('electron', () => ({
  contextBridge: { exposeInMainWorld },
  ipcRenderer: { invoke }
}))

describe('App Shell preload contract', () => {
  beforeEach(() => {
    vi.resetModules()
    exposeInMainWorld.mockReset()
    invoke.mockReset()
  })

  it('exposes only the controlled runtime information capability', async () => {
    invoke.mockResolvedValue({ platform: 'darwin', version: '0.1.0' })

    await import('./index')

    expect(exposeInMainWorld).toHaveBeenCalledOnce()
    expect(exposeInMainWorld).toHaveBeenCalledWith('appShell', {
      getRuntimeInfo: expect.any(Function)
    })

    const api = exposeInMainWorld.mock.calls[0][1]
    await expect(api.getRuntimeInfo()).resolves.toEqual({ platform: 'darwin', version: '0.1.0' })
    expect(invoke).toHaveBeenCalledWith('app-shell:get-runtime-info')
  })
})
