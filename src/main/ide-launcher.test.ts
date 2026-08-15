// @vitest-environment node

import { describe, expect, it, vi } from 'vitest'

import { createDefaultIdeLauncher } from './ide-launcher'

describe('External IDE launcher', () => {
  it('launches the first available IDE with the Workspace path', async () => {
    const spawn = vi.fn((command: string) => {
      const child = {
        once: vi.fn((event: string, listener: (error?: Error) => void) => {
          if (event === 'error' && command === 'code') listener(new Error('not installed'))
          if (event === 'spawn' && command === 'cursor') listener()
        }),
        unref: vi.fn()
      }
      return child
    })

    await createDefaultIdeLauncher('linux', spawn)('/work/demo')

    expect(spawn).toHaveBeenNthCalledWith(1, 'code', ['/work/demo'], expect.objectContaining({ shell: false }))
    expect(spawn).toHaveBeenNthCalledWith(2, 'cursor', ['/work/demo'], expect.objectContaining({ shell: false }))
  })

  it('fails when no supported IDE command is available', async () => {
    const spawn = vi.fn(() => ({
      once: vi.fn((event: string, listener: (error?: Error) => void) => {
        if (event === 'error') listener(new Error('not installed'))
      }),
      unref: vi.fn()
    }))

    await expect(createDefaultIdeLauncher('win32', spawn)('D:\\work\\demo'))
      .rejects.toThrow('No supported external IDE command is available')

    expect(spawn).toHaveBeenCalledWith('code.cmd', ['D:\\work\\demo'], expect.objectContaining({ shell: true }))
  })
})
