// @vitest-environment node

import { describe, expect, it } from 'vitest'

import type { SkillInstallPreview, SkillSource } from '../shared/skill-package'
import { createSkillInstaller, type SkillSourceInstaller } from './skill-installer'

const manifest = {
  schemaVersion: 1 as const,
  name: 'demo-package',
  version: '1.0.0',
  skills: [{
    name: 'demo', version: '1.0.0', entry: 'skills/demo/SKILL.md', dependencies: [], supportedRuntimes: ['codex'], capabilities: ['question'], requiredPermissions: ['workspace.read']
  }]
}

function installerFor(rootPath: string, resolve: SkillSourceInstaller['resolve']): ReturnType<typeof createSkillInstaller> {
  return createSkillInstaller({
    rootPath,
    now: () => '2026-08-24T00:00:00.000Z',
    contentHash: async () => 'a'.repeat(64),
    installers: [{ type: 'local-directory', resolve }]
  })
}

describe('Skill Package installer', () => {
  it('returns an install preview with source, fixed version, permissions and content hash before confirmation', async () => {
    const source: SkillSource = { type: 'local-directory', value: '/source/demo' }
    const installer = installerFor('/app/skills', async () => ({ rootPath: '/source/demo', manifest, resolvedVersion: '1.0.0' }))

    const preview = await installer.preview(source)

    expect(preview).toMatchObject<Partial<SkillInstallPreview>>({
      source,
      resolvedVersion: '1.0.0',
      manifest,
      lifecycleScriptsRisk: []
    })
    expect(preview.contentHash).toMatch(/^[a-f0-9]{64}$/)
  })

  it('does not install when the user declines the preview', async () => {
    const installer = installerFor('/app/skills', async () => ({ rootPath: '/source/demo', manifest }))
    await expect(installer.install({ type: 'local-directory', value: '/source/demo' }, { confirm: () => false })).resolves.toBeNull()
    await expect(installer.listInstalled()).resolves.toEqual([])
  })

  it('records an installed package only after an atomic copy and exposes its fixed Skill manifest', async () => {
    const copied: string[] = []
    const installer = createSkillInstaller({
      rootPath: '/app/skills',
      now: () => '2026-08-24T00:00:00.000Z',
      contentHash: async () => 'a'.repeat(64),
      writeInstalled: async () => undefined,
      makeDirectory: async () => undefined,
      copyDirectory: async (_source, destination) => { copied.push(destination) },
      rename: async () => undefined,
      remove: async () => undefined,
      installers: [{ type: 'local-directory', resolve: async () => ({ rootPath: '/source/demo', manifest }) }]
    })

    const record = await installer.install({ type: 'local-directory', value: '/source/demo' }, { confirmed: true })

    expect(record).toMatchObject({ manifest, installedAt: '2026-08-24T00:00:00.000Z' })
    expect(copied).toHaveLength(1)
    await expect(installer.getManifests()).resolves.toEqual(manifest.skills)
    await expect(installer.find('demo', '1.0.0')).resolves.toMatchObject({ installedPath: expect.stringContaining('demo-package@1.0.0') })
  })

  it('removes the new package when metadata persistence fails', async () => {
    const removed: string[] = []
    const installer = createSkillInstaller({
      rootPath: '/app/skills',
      contentHash: async () => 'a'.repeat(64),
      writeInstalled: async () => { throw new Error('disk full') },
      makeDirectory: async () => undefined,
      copyDirectory: async () => undefined,
      rename: async () => undefined,
      remove: async (path) => { removed.push(path) },
      installers: [{ type: 'local-directory', resolve: async () => ({ rootPath: '/source/demo', manifest }) }]
    })

    await expect(installer.install({ type: 'local-directory', value: '/source/demo' }, { confirmed: true })).rejects.toThrow('disk full')
    expect(removed.some((path) => path.includes('demo-package@1.0.0'))).toBe(true)
    await expect(installer.listInstalled()).resolves.toEqual([])
  })

  it('serializes concurrent installs so the same package is copied once', async () => {
    let copies = 0
    const installer = createSkillInstaller({
      rootPath: '/app/skills',
      contentHash: async () => 'a'.repeat(64),
      writeInstalled: async () => undefined,
      makeDirectory: async () => undefined,
      copyDirectory: async () => { copies += 1 },
      rename: async () => undefined,
      remove: async () => undefined,
      installers: [{ type: 'local-directory', resolve: async () => ({ rootPath: '/source/demo', manifest }) }]
    })

    const [first, second] = await Promise.all([
      installer.install({ type: 'local-directory', value: '/source/demo' }, { confirmed: true }),
      installer.install({ type: 'local-directory', value: '/source/demo' }, { confirmed: true })
    ])

    expect(first).toMatchObject({ idempotencyKey: expect.stringContaining('skill-package:demo-package') })
    expect(second).toEqual(first)
    expect(copies).toBe(1)
  })
})
