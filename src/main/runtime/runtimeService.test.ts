import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createDatabaseHandle, type DatabaseHandle } from '../db/client'
import { createRepositories } from '../db/repositories'
import type { ProcessRunner, ProcessRunResult } from './processRunner'
import { RuntimeImportService } from './runtimeImportService'
import { MemorySecretService } from './secretService'
import { RuntimeService } from './runtimeService'
import { RuntimeTester } from './runtimeTester'

class FakeProcessRunner implements ProcessRunner {
  constructor(private readonly result: ProcessRunResult) {}

  run(): Promise<ProcessRunResult> {
    return Promise.resolve(this.result)
  }
}

const handles: DatabaseHandle[] = []

function createService(
  result: ProcessRunResult = { exitCode: 0, stdout: 'codex 1.0.0\n', stderr: '' }
) {
  const dir = mkdtempSync(join(tmpdir(), 'agent-space-runtime-'))
  const handle = createDatabaseHandle(join(dir, 'test.sqlite'))
  const secretService = new MemorySecretService()
  const service = new RuntimeService(
    handle.db,
    secretService,
    new RuntimeTester(new FakeProcessRunner(result))
  )
  handles.push(handle)

  const importService = new RuntimeImportService(handle.db, service)

  return { handle, service, importService, secretService }
}

afterEach(() => {
  while (handles.length > 0) {
    handles.pop()?.sqlite.close()
  }
})

describe('RuntimeService', () => {
  it('creates a runtime with default args and masked secrets', () => {
    const { handle, service, secretService } = createService()

    const runtime = service.create({
      name: 'Codex',
      provider: 'codex_cli',
      executablePath: 'codex',
      defaultArgs: ['--model', 'gpt-5'],
      secrets: [{ secretKind: 'api_key', value: 'sk-secret-value' }]
    })

    expect(runtime.defaultArgs).toEqual(['--model', 'gpt-5'])
    expect(runtime.secrets).toEqual([
      expect.objectContaining({
        secretKind: 'api_key',
        maskedValue: 'sk••••ue'
      })
    ])

    const secretRow = createRepositories(handle.db).runtimeSecrets.listByRuntime(runtime.id)[0]
    expect(secretRow.secretRef).not.toContain('sk-secret-value')
    expect(secretService.readSecret(secretRow.secretRef)).toBe('sk-secret-value')
  })

  it('validates provider and normalizes missing default args to an empty array', () => {
    const { service } = createService()

    expect(() =>
      service.create({
        name: 'Bad',
        provider: 'unknown' as 'codex_cli'
      })
    ).toThrow('provider is invalid')

    const runtime = service.create({
      name: 'Custom',
      provider: 'custom_cli',
      executablePath: '/bin/echo'
    })

    expect(runtime.defaultArgs).toEqual([])
  })

  it('tests a runtime and stores the latest test result', async () => {
    const { service } = createService({ exitCode: 0, stdout: 'codex 2.0.0\n', stderr: '' })
    const runtime = service.create({
      name: 'Codex',
      provider: 'codex_cli',
      executablePath: 'codex'
    })

    const result = await service.test({ runtimeConfigId: runtime.id })

    expect(result.status).toBe('success')
    expect(result.version).toBe('codex 2.0.0')
    expect(service.get(runtime.id).lastTestStatus).toBe('success')
  })

  it('reports command_not_found when the executable is missing', async () => {
    const { service } = createService({
      exitCode: null,
      stdout: '',
      stderr: '',
      error: Object.assign(new Error('missing'), { code: 'ENOENT' })
    })

    const result = await service.test({
      provider: 'custom_cli',
      executablePath: '/missing/agent'
    })

    expect(result.status).toBe('command_not_found')
  })

  it('disables a default runtime so it cannot remain default', () => {
    const { service } = createService()
    const runtime = service.create({
      name: 'Default Codex',
      provider: 'codex_cli',
      executablePath: 'codex',
      isDefault: true
    })

    const disabled = service.disable(runtime.id)

    expect(disabled.enabled).toBe(false)
    expect(disabled.isDefault).toBe(false)
    expect(service.list({ enabled: true })).toHaveLength(0)
  })

  it('previews and commits generic JSON imports without exposing secret values', () => {
    const { handle, importService, secretService } = createService()
    const preview = importService.preview({
      sourceType: 'json_text',
      formatHint: 'generic_json',
      content: JSON.stringify({
        name: 'Imported Codex',
        provider: 'codex_cli',
        model: 'gpt-5',
        apiKey: 'sk-imported'
      })
    })

    expect(preview.previews).toEqual([
      expect.objectContaining({
        name: 'Imported Codex',
        provider: 'codex_cli',
        containsSecrets: true,
        secretKinds: ['api_key']
      })
    ])
    expect(JSON.stringify(preview)).not.toContain('sk-imported')

    const result = importService.commit({
      importSessionId: preview.importSessionId,
      previews: [{ tempId: preview.previews[0].tempId, action: 'create', importSecrets: true }]
    })

    expect(result.createdCount).toBe(1)
    const runtime = createRepositories(handle.db).runtimes.list()[0]
    const secret = createRepositories(handle.db).runtimeSecrets.listByRuntime(runtime.id)[0]
    expect(secretService.readSecret(secret.secretRef)).toBe('sk-imported')
  })

  it('supports ccswitch deep link preview and rename conflict handling', () => {
    const { service, importService } = createService()
    service.create({
      name: 'Codex',
      provider: 'codex_cli',
      executablePath: 'codex'
    })
    const payload = encodeURIComponent(
      JSON.stringify({
        app: 'codex',
        name: 'Codex',
        model: 'gpt-5-mini',
        apiKey: 'sk-ccswitch'
      })
    )

    const preview = importService.preview({
      sourceType: 'deep_link_text',
      formatHint: 'ccswitch',
      content: `ccswitch://v1/import?resource=provider&payload=${payload}`
    })

    expect(preview.previews[0]).toEqual(
      expect.objectContaining({
        conflict: 'name_exists',
        provider: 'codex_cli'
      })
    )

    const result = importService.commit({
      importSessionId: preview.importSessionId,
      previews: [
        {
          tempId: preview.previews[0].tempId,
          action: 'rename',
          newName: 'Codex Imported',
          importSecrets: false
        }
      ]
    })

    expect(result.createdCount).toBe(1)
    expect(service.list().map((runtime) => runtime.name)).toContain('Codex Imported')
    expect(
      service.get(service.list().find((runtime) => runtime.name === 'Codex Imported')!.id).secrets
    ).toEqual([])
  })

  it('supports skip and overwrite import actions', () => {
    const { service, importService } = createService()
    const runtime = service.create({
      name: 'Codex',
      provider: 'codex_cli',
      executablePath: 'codex'
    })
    const preview = importService.preview({
      sourceType: 'json_text',
      content: JSON.stringify([
        { name: 'Skip Me', provider: 'gemini_cli' },
        { name: 'Codex Overwrite', provider: 'codex_cli', model: 'gpt-5.1' }
      ])
    })

    const result = importService.commit({
      importSessionId: preview.importSessionId,
      previews: [
        { tempId: preview.previews[0].tempId, action: 'skip' },
        {
          tempId: preview.previews[1].tempId,
          action: 'overwrite',
          targetRuntimeId: runtime.id,
          importSecrets: true
        }
      ]
    })

    expect(result.skippedCount).toBe(1)
    expect(result.updatedCount).toBe(1)
    expect(service.get(runtime.id).model).toBe('gpt-5.1')
  })
})
