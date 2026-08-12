// @vitest-environment node

import { describe, expect, it, vi } from 'vitest'

import { createMainWindow, registerAppShellHandlers } from './app-shell'

describe('App Shell main process boundary', () => {
  it('creates a sandboxed renderer without Node.js access', () => {
    const window = {
      loadFile: vi.fn(),
      loadURL: vi.fn(),
      on: vi.fn(),
      show: vi.fn()
    }
    const createWindow = vi.fn(() => window)

    createMainWindow(
      {
        createWindow,
        preloadPath: '/app/out/preload/index.js',
        rendererUrl: 'http://localhost:5173'
      }
    )

    expect(createWindow).toHaveBeenCalledWith(
      expect.objectContaining({
        show: false,
        webPreferences: {
          preload: '/app/out/preload/index.js',
          contextIsolation: true,
          sandbox: true,
          nodeIntegration: false
        }
      })
    )
    expect(window.loadURL).toHaveBeenCalledWith('http://localhost:5173')
  })

  it('answers runtime information through the stable IPC channel', async () => {
    const handle = vi.fn()

    registerAppShellHandlers({
      handle,
      getVersion: () => '0.1.0',
      platform: 'linux'
    })

    expect(handle).toHaveBeenCalledWith('app-shell:get-runtime-info', expect.any(Function))
    const handler = handle.mock.calls[0][1]
    await expect(handler()).resolves.toEqual({ platform: 'linux', version: '0.1.0' })
  })
})
