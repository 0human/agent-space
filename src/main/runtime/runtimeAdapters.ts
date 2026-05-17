import type { RuntimeProvider } from '../../shared/api'
import type { AiRuntimeConfig, WorkSession } from '../db/schema'

export interface RuntimeInputEnvelope {
  version: 1
  provider: RuntimeProvider
  workSessionId: string
  title: string
  goal?: string
  prompt: string
  resumeExternalSessionId?: string
}

export interface RuntimeStartPlan {
  command: string
  args: string[]
  cwd?: string
  stdin?: string
  inputEnvelope: RuntimeInputEnvelope
  resumeExternalSessionId?: string
  supportsExternalSessionResume: boolean
}

export interface RuntimeStartPlanInput {
  runtime: AiRuntimeConfig
  session: WorkSession
  projectLocalPath: string
  prompt: string
  resumeExternalSessionId?: string
}

export interface RuntimeAdapter {
  provider: RuntimeProvider
  supportsExternalSessionResume: boolean
  createStartPlan(input: RuntimeStartPlanInput): RuntimeStartPlan
  extractAssistantMessage(stdout: string): string | undefined
}

export class RuntimeRegistryService {
  private readonly adapters = new Map<RuntimeProvider, RuntimeAdapter>()

  constructor(adapters: RuntimeAdapter[] = createDefaultRuntimeAdapters()) {
    for (const adapter of adapters) {
      this.adapters.set(adapter.provider, adapter)
    }
  }

  get(provider: RuntimeProvider): RuntimeAdapter {
    const adapter = this.adapters.get(provider)
    if (!adapter) {
      throw new Error(`Runtime adapter not registered for provider: ${provider}`)
    }
    return adapter
  }
}

abstract class BaseCliRuntimeAdapter implements RuntimeAdapter {
  abstract readonly provider: RuntimeProvider
  readonly supportsExternalSessionResume: boolean = false

  createStartPlan(input: RuntimeStartPlanInput): RuntimeStartPlan {
    const command = input.runtime.executablePath?.trim()
    if (!command) {
      throw new Error('Runtime executablePath is required before sending a message.')
    }

    const inputEnvelope = this.createInputEnvelope(input)
    return {
      command,
      args: this.createArgs(input, inputEnvelope),
      cwd:
        input.runtime.defaultCwdMode === 'custom_path'
          ? (input.runtime.customCwd ?? undefined)
          : input.projectLocalPath,
      stdin: this.createStdin(inputEnvelope),
      inputEnvelope,
      resumeExternalSessionId: this.supportsExternalSessionResume
        ? input.resumeExternalSessionId
        : undefined,
      supportsExternalSessionResume: this.supportsExternalSessionResume
    }
  }

  extractAssistantMessage(stdout: string): string | undefined {
    return stdout.trim() || undefined
  }

  protected createArgs(
    input: RuntimeStartPlanInput,
    inputEnvelope: RuntimeInputEnvelope
  ): string[] {
    void inputEnvelope
    return this.parseDefaultArgs(input)
  }

  protected parseDefaultArgs(input: RuntimeStartPlanInput): string[] {
    return this.parseArgs(input.runtime.defaultArgsJson)
  }

  protected createStdin(inputEnvelope: RuntimeInputEnvelope): string | undefined {
    void inputEnvelope
    return undefined
  }

  private createInputEnvelope(input: RuntimeStartPlanInput): RuntimeInputEnvelope {
    return {
      version: 1,
      provider: input.runtime.provider as RuntimeProvider,
      workSessionId: input.session.id,
      title: input.session.title,
      goal: input.session.goal ?? undefined,
      prompt: input.prompt,
      resumeExternalSessionId: this.supportsExternalSessionResume
        ? input.resumeExternalSessionId
        : undefined
    }
  }

  private parseArgs(value: string | null): string[] {
    if (!value) {
      return []
    }
    try {
      const parsed = JSON.parse(value) as unknown
      return Array.isArray(parsed) && parsed.every((item) => typeof item === 'string') ? parsed : []
    } catch {
      return []
    }
  }
}

export class CustomCliRuntimeAdapter extends BaseCliRuntimeAdapter {
  readonly provider = 'custom_cli'

  protected override createStdin(inputEnvelope: RuntimeInputEnvelope): string {
    return JSON.stringify(inputEnvelope, null, 2)
  }
}

export class ClaudeCodeCliRuntimeAdapter extends BaseCliRuntimeAdapter {
  readonly provider = 'claude_code_cli'
  override readonly supportsExternalSessionResume = true

  protected override createArgs(input: RuntimeStartPlanInput): string[] {
    return withMissingOptions(
      [
        ...this.resumeArgs(input.resumeExternalSessionId),
        '-p',
        input.prompt,
        ...this.parseDefaultArgs(input)
      ],
      [['--output-format', 'stream-json'], ['--verbose']]
    )
  }

  override extractAssistantMessage(stdout: string): string | undefined {
    const values = parseJsonStream(stdout)
    const result = values
      .map((value) => extractClaudeText(value))
      .filter(Boolean)
      .at(-1)

    return result ?? super.extractAssistantMessage(stdout)
  }

  private resumeArgs(resumeExternalSessionId: string | undefined): string[] {
    return resumeExternalSessionId ? ['-r', resumeExternalSessionId] : []
  }
}

export class CodexCliRuntimeAdapter extends BaseCliRuntimeAdapter {
  readonly provider = 'codex_cli'

  protected override createArgs(input: RuntimeStartPlanInput): string[] {
    const defaultArgs = this.parseDefaultArgs(input)
    return ['exec', ...withMissingOptions(defaultArgs, [['--json']])]
  }

  protected override createStdin(inputEnvelope: RuntimeInputEnvelope): string {
    return inputEnvelope.prompt
  }

  override extractAssistantMessage(stdout: string): string | undefined {
    const values = parseJsonStream(stdout)
    const text = values
      .map((value) => extractCodexText(value))
      .filter(Boolean)
      .join('\n')
      .trim()

    return text || super.extractAssistantMessage(stdout)
  }
}

export class GeminiCliRuntimeAdapter extends BaseCliRuntimeAdapter {
  readonly provider = 'gemini_cli'
  override readonly supportsExternalSessionResume = true

  protected override createArgs(input: RuntimeStartPlanInput): string[] {
    return withMissingOptions(
      [
        ...this.resumeArgs(input.resumeExternalSessionId),
        '-p',
        input.prompt,
        ...this.parseDefaultArgs(input)
      ],
      [['--output-format', 'stream-json']]
    )
  }

  override extractAssistantMessage(stdout: string): string | undefined {
    const value = parseJsonValue(stdout)
    const text = value ? extractGeminiText(value) : undefined
    return text ?? super.extractAssistantMessage(stdout)
  }

  private resumeArgs(resumeExternalSessionId: string | undefined): string[] {
    return resumeExternalSessionId ? ['-r', resumeExternalSessionId] : []
  }
}

export function createDefaultRuntimeAdapters(): RuntimeAdapter[] {
  return [
    new CustomCliRuntimeAdapter(),
    new ClaudeCodeCliRuntimeAdapter(),
    new CodexCliRuntimeAdapter(),
    new GeminiCliRuntimeAdapter()
  ]
}

function withMissingOptions(args: string[], options: string[][]): string[] {
  const nextArgs = [...args]
  for (const option of options) {
    const [name] = option
    if (!nextArgs.some((arg) => arg === name || arg.startsWith(`${name}=`))) {
      nextArgs.push(...option)
    }
  }
  return nextArgs
}

function parseJsonStream(stdout: string): unknown[] {
  const lines = stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)

  const values = lines
    .map((line) => parseJsonValue(line))
    .filter((value): value is unknown => value !== undefined)

  return values.length > 0 ? values : [parseJsonValue(stdout)].filter(Boolean)
}

function parseJsonValue(value: string): unknown | undefined {
  try {
    return JSON.parse(value) as unknown
  } catch {
    return undefined
  }
}

function extractClaudeText(value: unknown): string | undefined {
  const object = asRecord(value)
  if (!object) {
    return undefined
  }

  if (object.type === 'result' && typeof object.result === 'string') {
    return object.result.trim() || undefined
  }

  const message = asRecord(object.message)
  if (object.type === 'assistant' && message) {
    return extractContentText(message.content)
  }

  return undefined
}

function extractCodexText(value: unknown): string | undefined {
  const object = asRecord(value)
  if (!object) {
    return undefined
  }

  if (object.type === 'AgentMessage' && typeof object.content === 'string') {
    return object.content.trim() || undefined
  }

  const msg = asRecord(object.msg)
  if (msg?.type === 'text' && typeof msg.content === 'string') {
    return msg.content.trim() || undefined
  }

  return undefined
}

function extractGeminiText(value: unknown): string | undefined {
  const object = asRecord(value)
  if (!object) {
    return undefined
  }

  if (typeof object.response === 'string') {
    return object.response.trim() || undefined
  }

  if (typeof object.text === 'string') {
    return object.text.trim() || undefined
  }

  return extractContentText(object.content)
}

function extractContentText(content: unknown): string | undefined {
  if (typeof content === 'string') {
    return content.trim() || undefined
  }

  if (!Array.isArray(content)) {
    return undefined
  }

  const text = content
    .map((item) => {
      const object = asRecord(item)
      return object?.type === 'text' && typeof object.text === 'string' ? object.text : undefined
    })
    .filter(Boolean)
    .join('\n')
    .trim()

  return text || undefined
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined
}
