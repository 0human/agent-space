// @vitest-environment node

import { describe, expect, it, vi } from 'vitest'

import { APP_SHELL_CHANNELS } from '../shared/app-shell'
import { registerSkillHandlers } from './skill-handlers'

const preview = {
  source: { type: 'npm' as const, value: 'demo@1.0.0' },
  manifest: { schemaVersion: 1 as const, name: 'demo-package', version: '1.0.0', skills: [{ name: 'demo', version: '1.0.0', entry: 'skills/demo/SKILL.md', dependencies: ['shared'], supportedRuntimes: ['codex'], capabilities: [], requiredPermissions: ['workspace.read'] }] },
  resolvedVersion: '1.0.0',
  contentHash: 'a'.repeat(64),
  lifecycleScriptsRisk: ['lifecycle scripts risk'],
  warnings: []
}

describe('Skill Package IPC handlers', () => {
  it('shows the complete preview and installs only after explicit confirmation', async () => {
    const handlers = new Map<string, (...args: unknown[]) => unknown>()
    const installer = { preview: vi.fn().mockResolvedValue(preview), install: vi.fn().mockResolvedValue({ installedPath: '/skills/demo' }), listInstalled: vi.fn().mockResolvedValue([]) }
    const showMessageBox = vi.fn().mockResolvedValue({ response: 0 })
    registerSkillHandlers({ handle: (channel, listener) => handlers.set(channel, listener), installer, dialog: { showMessageBox } })

    await expect(handlers.get(APP_SHELL_CHANNELS.installSkill)?.({}, preview.source)).resolves.toEqual({ installedPath: '/skills/demo' })
    expect(showMessageBox).toHaveBeenCalledWith(expect.objectContaining({ detail: expect.stringContaining('lifecycle scripts risk') }))
    expect(showMessageBox).toHaveBeenCalledWith(expect.objectContaining({ detail: expect.stringContaining('workspace.read') }))
    expect(installer.install).toHaveBeenCalledWith(preview.source, { confirmed: true })
  })

  it('does not install when the user cancels the approval dialog', async () => {
    const installer = { preview: vi.fn().mockResolvedValue(preview), install: vi.fn(), listInstalled: vi.fn() }
    const handlers = new Map<string, (...args: unknown[]) => unknown>()
    registerSkillHandlers({ handle: (channel, listener) => handlers.set(channel, listener), installer, dialog: { showMessageBox: vi.fn().mockResolvedValue({ response: 1 }) } })
    await expect(handlers.get(APP_SHELL_CHANNELS.installSkill)?.({}, preview.source)).resolves.toBeNull()
    expect(installer.install).not.toHaveBeenCalled()
  })

  it('shows a Data Transfer Notice before resolving a network Skill Source', async () => {
    const installer = { preview: vi.fn().mockResolvedValue(preview), install: vi.fn(), listInstalled: vi.fn() }
    const handlers = new Map<string, (...args: unknown[]) => unknown>()
    const showMessageBox = vi.fn().mockResolvedValue({ response: 0 })
    registerSkillHandlers({ handle: (channel, listener) => handlers.set(channel, listener), installer, dialog: { showMessageBox } })

    await handlers.get(APP_SHELL_CHANNELS.previewSkillInstall)?.({}, preview.source)

    expect(showMessageBox).toHaveBeenNthCalledWith(1, expect.objectContaining({ title: 'Data Transfer Notice', detail: expect.stringContaining('External Destination') }))
    expect(showMessageBox.mock.invocationCallOrder[0]).toBeLessThan(installer.preview.mock.invocationCallOrder[0])
  })
})
