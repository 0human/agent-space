import { randomUUID } from 'node:crypto'
import type { RuntimeProvider } from '../../shared/api'

export interface RuntimeImportCandidate {
  tempId: string
  name: string
  provider: RuntimeProvider
  model?: string
  executablePath?: string
  defaultArgs: string[]
  source: 'ccswitch' | 'imported'
  sourceRef?: string
  notes?: string
  enabled: boolean
  rawSummary?: string
  secrets: { secretKind: string; value: string }[]
  warnings: string[]
}

export interface RuntimeImportRawInput {
  content: string
  formatHint?: 'auto' | 'ccswitch' | 'generic_json'
}

export interface RuntimeImportAdapter {
  sourceFormat: 'ccswitch' | 'generic_json'
  detect(input: RuntimeImportRawInput): boolean
  preview(input: RuntimeImportRawInput): RuntimeImportCandidate[]
}

const APP_PROVIDER_MAP: Record<string, RuntimeProvider | undefined> = {
  claude: 'claude_code_cli',
  claude_code: 'claude_code_cli',
  claude_code_cli: 'claude_code_cli',
  codex: 'codex_cli',
  codex_cli: 'codex_cli',
  gemini: 'gemini_cli',
  gemini_cli: 'gemini_cli',
  custom: 'custom_cli',
  custom_cli: 'custom_cli',
  opencode: 'custom_cli',
  openclaw: 'custom_cli'
}

const DEFAULT_EXECUTABLES: Record<RuntimeProvider, string> = {
  claude_code_cli: 'claude',
  codex_cli: 'codex',
  gemini_cli: 'gemini',
  custom_cli: ''
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function asBoolean(value: unknown, fallback = false): boolean {
  return typeof value === 'boolean' ? value : fallback
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value.filter((item): item is string => typeof item === 'string')
}

function parseJsonContent(content: string): unknown {
  return JSON.parse(content)
}

function extractRecords(parsed: unknown): Record<string, unknown>[] {
  if (Array.isArray(parsed)) {
    return parsed.flatMap((item) => {
      const record = asRecord(item)
      return record ? [record] : []
    })
  }

  const record = asRecord(parsed)
  if (!record) {
    return []
  }

  for (const key of ['providers', 'runtimes', 'items']) {
    const nested = record[key]
    if (Array.isArray(nested)) {
      return extractRecords(nested)
    }
  }

  return [record]
}

function providerFrom(value: unknown): RuntimeProvider | undefined {
  const raw = asString(value)?.toLowerCase()
  return raw ? APP_PROVIDER_MAP[raw] : undefined
}

function secretsFrom(record: Record<string, unknown>): { secretKind: string; value: string }[] {
  return [
    ['api_key', record.apiKey],
    ['api_key', record.api_key],
    ['token', record.token],
    ['usage_api_key', record.usageApiKey],
    ['usage_api_key', record.usage_api_key]
  ].flatMap(([secretKind, value]) => {
    const secretValue = asString(value)
    return secretValue ? [{ secretKind: String(secretKind), value: secretValue }] : []
  })
}

function candidateFromRecord(
  record: Record<string, unknown>,
  source: 'ccswitch' | 'imported'
): RuntimeImportCandidate | undefined {
  const provider = providerFrom(record.app) ?? providerFrom(record.provider)
  if (!provider) {
    return undefined
  }

  const name =
    asString(record.name) ??
    asString(record.title) ??
    `${provider.replace(/_cli$/, '').replaceAll('_', ' ')} Runtime`
  const endpoint = asString(record.endpoint)
  const config = asString(record.config)
  const warnings: string[] = []

  if (
    provider === 'custom_cli' &&
    !asString(record.executablePath) &&
    !asString(record.executable_path)
  ) {
    warnings.push('Custom CLI imports should be reviewed because no executable path was provided.')
  }

  return {
    tempId: randomUUID(),
    name,
    provider,
    model: asString(record.model),
    executablePath:
      asString(record.executablePath) ??
      asString(record.executable_path) ??
      DEFAULT_EXECUTABLES[provider],
    defaultArgs: asStringArray(record.defaultArgs ?? record.default_args),
    source,
    sourceRef: endpoint,
    notes: [
      asString(record.notes),
      endpoint ? `Endpoint: ${endpoint}` : undefined,
      config ? 'Imported config payload retained in source summary.' : undefined
    ]
      .filter(Boolean)
      .join('\n'),
    enabled: asBoolean(record.enabled, false),
    rawSummary: endpoint ?? asString(record.configFormat) ?? source,
    secrets: secretsFrom(record),
    warnings
  }
}

export class GenericJsonRuntimeImportAdapter implements RuntimeImportAdapter {
  sourceFormat = 'generic_json' as const

  detect(input: RuntimeImportRawInput): boolean {
    if (input.formatHint === 'generic_json') {
      return true
    }

    try {
      return extractRecords(parseJsonContent(input.content)).some((record) =>
        Boolean(providerFrom(record.provider) ?? providerFrom(record.app))
      )
    } catch {
      return false
    }
  }

  preview(input: RuntimeImportRawInput): RuntimeImportCandidate[] {
    const parsed = parseJsonContent(input.content)
    return extractRecords(parsed).flatMap((record) => {
      const candidate = candidateFromRecord(record, 'imported')
      return candidate ? [candidate] : []
    })
  }
}

export class CcswitchProviderImportAdapter implements RuntimeImportAdapter {
  sourceFormat = 'ccswitch' as const

  detect(input: RuntimeImportRawInput): boolean {
    if (input.formatHint === 'ccswitch') {
      return true
    }

    return input.content.includes('ccswitch://') || input.content.includes('"app"')
  }

  preview(input: RuntimeImportRawInput): RuntimeImportCandidate[] {
    const content = input.content.trim()
    const jsonText = content.startsWith('ccswitch://')
      ? this.extractDeepLinkPayload(content)
      : content
    const parsed = parseJsonContent(jsonText)

    return extractRecords(parsed).flatMap((record) => {
      const candidate = candidateFromRecord(record, 'ccswitch')
      return candidate ? [candidate] : []
    })
  }

  private extractDeepLinkPayload(value: string): string {
    const url = new URL(value)
    const payload = url.searchParams.get('payload') ?? url.searchParams.get('data')

    if (payload) {
      return decodeURIComponent(payload)
    }

    const resource = url.searchParams.get('resource')
    if (resource === 'provider') {
      const provider: Record<string, unknown> = {}
      for (const [key, paramValue] of url.searchParams.entries()) {
        if (key !== 'resource') {
          provider[key] = paramValue
        }
      }
      return JSON.stringify(provider)
    }

    throw new Error('Unsupported ccswitch deep link payload.')
  }
}
