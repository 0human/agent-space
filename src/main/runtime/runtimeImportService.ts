import { readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import type {
  RuntimeImportCommitInput,
  RuntimeImportCommitResult,
  RuntimeImportPreview,
  RuntimeImportPreviewInput,
  RuntimeImportPreviewResult
} from '../../shared/api'
import { createRepositories } from '../db'
import type { AppDatabase } from '../db/client'
import {
  CcswitchProviderImportAdapter,
  GenericJsonRuntimeImportAdapter,
  type RuntimeImportAdapter,
  type RuntimeImportCandidate
} from './importAdapters'
import { RuntimeService } from './runtimeService'
import { ValidationError } from './validation'

interface RuntimeImportSession {
  id: string
  candidates: RuntimeImportCandidate[]
  createdAt: string
}

export class RuntimeImportService {
  private readonly adapters: RuntimeImportAdapter[] = [
    new CcswitchProviderImportAdapter(),
    new GenericJsonRuntimeImportAdapter()
  ]
  private readonly sessions = new Map<string, RuntimeImportSession>()

  constructor(
    private readonly db: AppDatabase,
    private readonly runtimeService: RuntimeService
  ) {}

  preview(input: RuntimeImportPreviewInput): RuntimeImportPreviewResult {
    const content = this.resolveContent(input)
    const adapter = this.resolveAdapter(content, input.formatHint)
    const candidates = adapter.preview({ content, formatHint: input.formatHint })

    if (candidates.length === 0) {
      throw new ValidationError('No importable Runtime configuration was found.')
    }

    const importSessionId = randomUUID()
    this.sessions.set(importSessionId, {
      id: importSessionId,
      candidates,
      createdAt: new Date().toISOString()
    })

    return {
      importSessionId,
      previews: candidates.map((candidate) => this.toPreview(candidate))
    }
  }

  commit(input: RuntimeImportCommitInput): RuntimeImportCommitResult {
    if (!input.importSessionId) {
      throw new ValidationError('importSessionId is required.')
    }

    const session = this.sessions.get(input.importSessionId)
    if (!session) {
      throw new ValidationError('Import session expired or does not exist.')
    }

    const result: RuntimeImportCommitResult = {
      createdCount: 0,
      updatedCount: 0,
      skippedCount: 0,
      failed: []
    }

    for (const preview of input.previews) {
      const candidate = session.candidates.find((item) => item.tempId === preview.tempId)

      if (!candidate || preview.action === 'skip') {
        result.skippedCount += 1
        continue
      }

      try {
        const secrets = preview.importSecrets === false ? [] : candidate.secrets
        if (preview.action === 'overwrite') {
          if (!preview.targetRuntimeId) {
            throw new ValidationError('targetRuntimeId is required for overwrite.')
          }

          this.runtimeService.update({
            id: preview.targetRuntimeId,
            name: preview.newName ?? candidate.name,
            provider: candidate.provider,
            model: candidate.model,
            executablePath: candidate.executablePath,
            defaultArgs: candidate.defaultArgs,
            notes: candidate.notes,
            enabled: candidate.enabled,
            replaceSecrets: secrets
          })
          result.updatedCount += 1
        } else {
          this.runtimeService.create({
            name: preview.action === 'rename' ? preview.newName || candidate.name : candidate.name,
            provider: candidate.provider,
            model: candidate.model,
            executablePath: candidate.executablePath,
            defaultArgs: candidate.defaultArgs,
            notes: candidate.notes,
            enabled: candidate.enabled,
            secrets
          })
          result.createdCount += 1
        }
      } catch (error) {
        result.failed.push({
          tempId: preview.tempId,
          reason: error instanceof Error ? error.message : 'Import failed.'
        })
      }
    }

    this.sessions.delete(input.importSessionId)
    return result
  }

  private resolveContent(input: RuntimeImportPreviewInput): string {
    if (input.sourceType === 'file') {
      if (!input.filePath) {
        throw new ValidationError('filePath is required for file imports.')
      }

      return readFileSync(input.filePath, 'utf8')
    }

    if (!input.content?.trim()) {
      throw new ValidationError('Import content is required.')
    }

    return input.content
  }

  private resolveAdapter(
    content: string,
    formatHint: RuntimeImportPreviewInput['formatHint']
  ): RuntimeImportAdapter {
    const input = { content, formatHint }

    if (formatHint && formatHint !== 'auto') {
      const adapter = this.adapters.find((candidate) => candidate.sourceFormat === formatHint)
      if (!adapter) {
        throw new ValidationError(`Unsupported import format: ${formatHint}`)
      }

      return adapter
    }

    const adapter = this.adapters.find((candidate) => candidate.detect(input))
    if (!adapter) {
      throw new ValidationError('Unsupported Runtime import format.')
    }

    return adapter
  }

  private toPreview(candidate: RuntimeImportCandidate): RuntimeImportPreview {
    const repositories = createRepositories(this.db)
    const conflict = repositories.runtimes
      .list()
      .some((runtime) => runtime.name.toLowerCase() === candidate.name.toLowerCase())

    return {
      tempId: candidate.tempId,
      name: candidate.name,
      provider: candidate.provider,
      model: candidate.model,
      containsSecrets: candidate.secrets.length > 0,
      secretKinds: candidate.secrets.map((secret) => secret.secretKind),
      conflict: conflict ? 'name_exists' : 'none',
      rawSummary: candidate.rawSummary,
      warnings: candidate.warnings
    }
  }
}
