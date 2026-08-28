import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import App from '../../App'
import { createAppShellApi } from '../../test/app-shell-fake'

describe('Settings through the App seam', () => {
  beforeEach(() => {
    window.appShell = createAppShellApi()
  })

  it('shows a localized error when Runtime Info cannot be loaded', async () => {
    const user = userEvent.setup()
    window.appShell.getRuntimeInfo = vi
      .fn()
      .mockRejectedValue(new Error('runtime unavailable'))

    render(<App />)
    await user.click(screen.getByRole('button', { name: '设置' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '读取运行信息失败。',
    )
  })

  it('previews risk and installs a Skill Package while preserving the installed list', async () => {
    const user = userEvent.setup()
    const manifest = {
      schemaVersion: 1 as const,
      name: 'delivery-skills',
      version: '1.2.3',
      skills: [
        {
          name: 'deliver',
          version: '1.2.3',
          entry: 'skills/deliver/SKILL.md',
          dependencies: ['code-review'],
          supportedRuntimes: ['codex'],
          capabilities: ['workspace'],
          requiredPermissions: ['workspace.read'],
        },
      ],
    }
    const source = {
      type: 'local-directory' as const,
      value: '/tmp/delivery-skills',
    }
    const preview = {
      source,
      manifest,
      resolvedVersion: '1.2.3',
      contentHash: 'abc123',
      lifecycleScriptsRisk: ['检查来源可信性。'],
      warnings: [],
    }
    const installed = {
      ...preview,
      installedPath: '/skills/delivery-skills/1.2.3',
      installedAt: '2026-08-29T00:00:00.000Z',
    }
    window.appShell.listInstalledSkills = vi.fn().mockResolvedValue([
      {
        ...installed,
        manifest: { ...manifest, name: 'existing-skills' },
        installedPath: '/skills/existing/1.2.3',
      },
    ])
    window.appShell.previewSkillInstall = vi.fn().mockResolvedValue(preview)
    window.appShell.installSkill = vi.fn().mockResolvedValue(installed)

    render(<App />)
    await user.click(screen.getByRole('button', { name: '设置' }))

    expect(await screen.findByText('existing-skills@1.2.3')).toBeVisible()
    await user.type(screen.getByLabelText('来源地址或路径'), source.value)
    await user.click(screen.getByRole('button', { name: '解析并预览' }))

    const dialog = await screen.findByRole('dialog', {
      name: 'Skill Package 安装预览',
    })
    expect(dialog).toHaveTextContent('delivery-skills@1.2.3')
    expect(dialog).toHaveTextContent('code-review')
    expect(dialog).toHaveTextContent('workspace.read')
    expect(dialog).toHaveTextContent('检查来源可信性。')

    await user.click(screen.getByRole('button', { name: '确认安装' }))
    expect(window.appShell.installSkill).toHaveBeenCalledWith(source)
    expect(await screen.findByText('delivery-skills@1.2.3')).toBeVisible()
    expect(screen.getByText('existing-skills@1.2.3')).toBeVisible()
  })

  it('shows the Skill Package source error without opening a preview Dialog', async () => {
    const user = userEvent.setup()
    window.appShell.previewSkillInstall = vi
      .fn()
      .mockRejectedValue(new Error('Skill Package manifest 无效。'))

    render(<App />)
    await user.click(screen.getByRole('button', { name: '设置' }))
    await user.type(
      screen.getByLabelText('来源地址或路径'),
      '/tmp/invalid-skills',
    )
    await user.click(screen.getByRole('button', { name: '解析并预览' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Skill Package manifest 无效。',
    )
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
