import type {
  RuntimeCreateInput,
  RuntimeDetail,
  RuntimeListInput,
  RuntimeSummary,
  RuntimeTestInput,
  RuntimeTestResult,
  RuntimeUpdateInput
} from '../../shared/api'
import { createRepositories } from '../db'
import type { AppDatabase } from '../db/client'
import type { AiRuntimeConfig, AiRuntimeSecret } from '../db/schema'
import type { SecretService } from './secretService'
import { RuntimeTester } from './runtimeTester'
import {
  validateRuntimeCreateInput,
  validateRuntimeTestInput,
  validateRuntimeUpdateInput,
  ValidationError
} from './validation'

function parseJsonArray(value: string | null): string[] {
  if (!value) {
    return []
  }

  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) && parsed.every((item) => typeof item === 'string') ? parsed : []
  } catch {
    return []
  }
}

function optional<T>(value: T | null): T | undefined {
  return value ?? undefined
}

function toSummary(runtime: AiRuntimeConfig): RuntimeSummary {
  return {
    id: runtime.id,
    name: runtime.name,
    runtimeType: runtime.runtimeType as RuntimeSummary['runtimeType'],
    provider: runtime.provider as RuntimeSummary['provider'],
    model: optional(runtime.model),
    executablePath: optional(runtime.executablePath),
    permissionPreset: optional(runtime.permissionPreset) as RuntimeSummary['permissionPreset'],
    enabled: runtime.enabled === 1,
    isDefault: runtime.isDefault === 1,
    lastTestStatus: optional(runtime.lastTestStatus) as RuntimeSummary['lastTestStatus'],
    lastTestedAt: optional(runtime.lastTestedAt),
    lastUsedAt: optional(runtime.lastUsedAt)
  }
}

function toSecretSummary(secret: AiRuntimeSecret): RuntimeDetail['secrets'][number] {
  return {
    id: secret.id,
    secretKind: secret.secretKind,
    maskedValue: optional(secret.maskedValue),
    lastValidatedAt: optional(secret.lastValidatedAt)
  }
}

export class RuntimeService {
  constructor(
    private readonly db: AppDatabase,
    private readonly secretService: SecretService,
    private readonly runtimeTester: RuntimeTester
  ) {}

  list(input: RuntimeListInput = {}): RuntimeSummary[] {
    const query = input.query?.trim().toLowerCase()
    const repositories = createRepositories(this.db)

    return repositories.runtimes
      .list()
      .filter((runtime) => input.enabled === undefined || (runtime.enabled === 1) === input.enabled)
      .filter((runtime) => input.provider === undefined || runtime.provider === input.provider)
      .filter((runtime) => {
        if (!query) {
          return true
        }

        return (
          runtime.name.toLowerCase().includes(query) ||
          runtime.provider.toLowerCase().includes(query) ||
          (runtime.model?.toLowerCase().includes(query) ?? false)
        )
      })
      .map(toSummary)
  }

  get(id: string): RuntimeDetail {
    const repositories = createRepositories(this.db)
    const runtime = repositories.runtimes.getById(id)

    if (!runtime) {
      throw new ValidationError('Runtime not found.')
    }

    const secrets = repositories.runtimeSecrets.listByRuntime(id)
    return this.toDetail(runtime, secrets)
  }

  create(input: RuntimeCreateInput): RuntimeDetail {
    const validated = validateRuntimeCreateInput(input)

    return this.db.transaction((tx) => {
      const transactionRepositories = createRepositories(tx)

      if (validated.isDefault) {
        for (const runtime of transactionRepositories.runtimes.listEnabled()) {
          transactionRepositories.runtimes.update(runtime.id, { isDefault: 0 })
        }
      }

      const runtime = transactionRepositories.runtimes.create({
        name: validated.name,
        runtimeType: 'cli_agent',
        provider: validated.provider,
        agentProfileId: validated.agentProfileId,
        source: 'manual',
        model: validated.model,
        executablePath: validated.executablePath,
        defaultArgsJson: JSON.stringify(validated.defaultArgs ?? []),
        defaultCwdMode: validated.defaultCwdMode ?? 'project_root',
        customCwd: validated.customCwd,
        systemPrompt: validated.systemPrompt,
        streamEnabled: validated.streamEnabled ? 1 : 0,
        permissionPreset: validated.permissionPreset,
        isDefault: validated.isDefault ? 1 : 0,
        enabled: validated.enabled ? 1 : 0,
        notes: validated.notes
      })

      for (const secret of validated.secrets ?? []) {
        const stored = this.secretService.saveSecret({
          runtimeConfigId: runtime.id,
          secretKind: secret.secretKind,
          value: secret.value
        })
        transactionRepositories.runtimeSecrets.create({
          runtimeConfigId: runtime.id,
          secretKind: secret.secretKind,
          secretRef: stored.secretRef,
          maskedValue: stored.maskedValue
        })
      }

      return this.toDetail(
        runtime,
        transactionRepositories.runtimeSecrets.listByRuntime(runtime.id)
      )
    })
  }

  update(input: RuntimeUpdateInput): RuntimeDetail {
    const validated = validateRuntimeUpdateInput(input)

    return this.db.transaction((tx) => {
      const repositories = createRepositories(tx)
      const existing = repositories.runtimes.getById(validated.id)

      if (!existing) {
        throw new ValidationError('Runtime not found.')
      }

      if (validated.isDefault) {
        for (const runtime of repositories.runtimes.listEnabled()) {
          if (runtime.id !== validated.id) {
            repositories.runtimes.update(runtime.id, { isDefault: 0 })
          }
        }
      }

      const updated = repositories.runtimes.update(validated.id, {
        name: validated.name,
        provider: validated.provider,
        agentProfileId: validated.agentProfileId,
        model: validated.model,
        executablePath: validated.executablePath,
        defaultArgsJson:
          validated.defaultArgs === undefined ? undefined : JSON.stringify(validated.defaultArgs),
        defaultCwdMode: validated.defaultCwdMode,
        customCwd: validated.customCwd,
        systemPrompt: validated.systemPrompt,
        streamEnabled:
          validated.streamEnabled === undefined ? undefined : validated.streamEnabled ? 1 : 0,
        permissionPreset: validated.permissionPreset,
        isDefault: validated.isDefault === undefined ? undefined : validated.isDefault ? 1 : 0,
        enabled: validated.enabled === undefined ? undefined : validated.enabled ? 1 : 0,
        notes: validated.notes
      })

      if (validated.replaceSecrets) {
        for (const secret of repositories.runtimeSecrets.listByRuntime(validated.id)) {
          this.secretService.deleteSecret(secret.secretRef)
        }
        repositories.runtimeSecrets.deleteByRuntime(validated.id)

        for (const secret of validated.replaceSecrets) {
          const stored = this.secretService.saveSecret({
            runtimeConfigId: updated.id,
            secretKind: secret.secretKind,
            value: secret.value
          })
          repositories.runtimeSecrets.create({
            runtimeConfigId: updated.id,
            secretKind: secret.secretKind,
            secretRef: stored.secretRef,
            maskedValue: stored.maskedValue
          })
        }
      }

      return this.toDetail(updated, repositories.runtimeSecrets.listByRuntime(updated.id))
    })
  }

  disable(id: string): RuntimeDetail {
    const repositories = createRepositories(this.db)
    const runtime = repositories.runtimes.update(id, { enabled: 0, isDefault: 0 })

    if (!runtime) {
      throw new ValidationError('Runtime not found.')
    }

    return this.toDetail(runtime, repositories.runtimeSecrets.listByRuntime(id))
  }

  async test(input: RuntimeTestInput): Promise<RuntimeTestResult> {
    const validated = validateRuntimeTestInput(input)
    const repositories = createRepositories(this.db)
    let testInput = validated

    if (validated.runtimeConfigId) {
      const runtime = repositories.runtimes.getById(validated.runtimeConfigId)

      if (!runtime) {
        throw new ValidationError('Runtime not found.')
      }

      testInput = {
        provider: runtime.provider as RuntimeTestInput['provider'],
        executablePath: runtime.executablePath ?? undefined,
        defaultArgs: parseJsonArray(runtime.defaultArgsJson)
      }
    }

    const result = await this.runtimeTester.test(testInput)

    if (validated.runtimeConfigId) {
      repositories.runtimes.update(validated.runtimeConfigId, {
        lastTestStatus: result.status,
        lastTestMessage: result.message,
        lastTestedAt: result.testedAt
      })
    }

    return result
  }

  private toDetail(runtime: AiRuntimeConfig, secrets: AiRuntimeSecret[]): RuntimeDetail {
    return {
      ...toSummary(runtime),
      agentProfileId: optional(runtime.agentProfileId),
      source: runtime.source as RuntimeDetail['source'],
      sourceRef: optional(runtime.sourceRef),
      defaultArgs: parseJsonArray(runtime.defaultArgsJson),
      defaultCwdMode: runtime.defaultCwdMode as RuntimeDetail['defaultCwdMode'],
      customCwd: optional(runtime.customCwd),
      systemPrompt: optional(runtime.systemPrompt),
      streamEnabled: runtime.streamEnabled === 1,
      notes: optional(runtime.notes),
      secrets: secrets.map(toSecretSummary),
      createdAt: runtime.createdAt,
      updatedAt: runtime.updatedAt
    }
  }
}
