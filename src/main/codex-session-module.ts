import { constants } from 'node:fs'
import { access } from 'node:fs/promises'
import { delimiter, join } from 'node:path'

import type { PermissionPolicy } from '../shared/project'
import type { RuntimeLocator } from '../shared/workflow-run'
import { createStdioCodexAppServerTransport, type CodexAppServerMessage, type CodexAppServerTransport, type JsonRpcServerRequest } from './codex-app-server-transport'

export interface CodexSessionTransport extends CodexAppServerTransport {
  nextMessage?(): Promise<CodexAppServerMessage | null>
  respond?(id: number | string, result: unknown): Promise<void>
}

export interface CodexRuntimeApprovalRequest extends JsonRpcServerRequest {}

export interface CodexSessionPreflightInput {
  cwd: string
  command: string
  env?: NodeJS.ProcessEnv
}

export interface CodexCapabilityNegotiation {
  compatible: boolean
  command: string
  version: string
  capabilities: Record<string, unknown>
  requiredCapabilities: string[]
  missingCapabilities: string[]
  reason: string | null
  suggestion: string
}

export interface CodexSessionModuleDependencies {
  createTransport?: (options: CodexSessionPreflightInput) => Promise<CodexSessionTransport> | CodexSessionTransport
  resolveCommand?: (command: string) => Promise<string | null>
  requiredCapabilities?: string[]
}

export interface CodexSessionTurnInput extends CodexSessionPreflightInput {
  workUnitKey: string
  input: string
  permissionPolicy?: PermissionPolicy
  sandbox?: 'read-only' | 'workspace-write' | string
  approvalPolicy?: string
  resumeLocator?: RuntimeLocator | null
  onLocator?: (locator: RuntimeLocator) => void | Promise<void>
  onNotification?: (message: CodexAppServerMessage, locator: RuntimeLocator) => void | Promise<void>
  onApproval?: (request: CodexRuntimeApprovalRequest) => unknown | Promise<unknown>
}

export interface CodexSessionTurnResult {
  locator: RuntimeLocator
  notifications: CodexAppServerMessage[]
  status: string
  error?: string | null
}

export interface CodexSessionModule {
  preflight(input: CodexSessionPreflightInput): Promise<CodexCapabilityNegotiation>
  runTurn(input: CodexSessionTurnInput): Promise<CodexSessionTurnResult>
  interrupt(locator: Pick<RuntimeLocator, 'threadId' | 'turnId'>): Promise<void>
  respondToApproval(request: CodexRuntimeApprovalRequest, result: unknown): Promise<void>
  readThread(input: CodexSessionPreflightInput & { locator: Pick<RuntimeLocator, 'threadId'> }): Promise<unknown>
  close(): Promise<void>
}

export class CodexCapabilityNegotiationError extends Error {
  readonly negotiation: CodexCapabilityNegotiation

  constructor(negotiation: CodexCapabilityNegotiation) {
    super(negotiation.reason ?? 'Codex App Server 能力协商失败。')
    this.name = 'CodexCapabilityNegotiationError'
    this.negotiation = negotiation
  }
}

const DEFAULT_REQUIRED_CAPABILITIES = [
  'thread/start',
  'thread/resume',
  'thread/read',
  'turn/start',
  'turn/interrupt',
  'events:item/started',
  'events:item/completed',
  'events:turn/completed'
]

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null
}

function versionOf(response: unknown): string {
  const value = stringValue(record(response)?.userAgent) ?? 'unknown'
  return value.match(/\d+\.\d+\.\d+(?:[-+][A-Za-z0-9.-]+)?/)?.[0] ?? value
}

async function defaultResolveCommand(command: string): Promise<string | null> {
  if (command.includes('/') || command.includes('\\')) {
    try {
      await access(command, constants.X_OK)
      return command
    } catch {
      return null
    }
  }
  for (const directory of (process.env.PATH ?? '').split(delimiter).filter(Boolean)) {
    const candidate = join(directory, command)
    try {
      await access(candidate, constants.X_OK)
      return candidate
    } catch {
      // Continue searching PATH entries.
    }
  }
  return null
}

function capabilitiesFrom(response: unknown): Record<string, unknown> {
  const responseRecord = record(response)
  const value = record(responseRecord?.capabilities)
  const topLevelCapabilities = responseRecord
    ? Object.fromEntries(['methods', 'events', 'notifications'].filter((key) => key in responseRecord).map((key) => [key, responseRecord[key]]))
    : null
  // A missing capability description cannot be treated as compatible: the
  // caller must be able to explain exactly why this App Server is supported.
  return value ?? (Object.keys(topLevelCapabilities ?? {}).length > 0 ? (topLevelCapabilities ?? {}) : {})
}

function capabilitySet(capabilities: Record<string, unknown>): Set<string> {
  const result = new Set<string>()
  for (const key of ['methods', 'events', 'notifications', 'capabilities']) {
    const values = capabilities[key]
    if (Array.isArray(values)) for (const value of values) if (typeof value === 'string') result.add(['events', 'notifications'].includes(key) ? `events:${value}` : value)
    else if (record(values)) for (const value of Object.keys(values)) result.add(['events', 'notifications'].includes(key) ? `events:${value}` : value)
  }
  for (const [key, value] of Object.entries(capabilities)) if (value === true) result.add(key)
  return result
}

function capabilityReason(result: Pick<CodexCapabilityNegotiation, 'command' | 'version' | 'missingCapabilities'>): string {
  return `Codex App Server 能力协商失败（路径：${result.command}；版本：${result.version}；缺失能力：${result.missingCapabilities.join(', ')}）。请更新本机 Codex CLI 后重试。`
}

export function createCodexSessionModule(dependencies: CodexSessionModuleDependencies = {}): CodexSessionModule {
  const createTransport = dependencies.createTransport ?? ((options: CodexSessionPreflightInput) => createStdioCodexAppServerTransport(options))
  const resolveCommand = dependencies.resolveCommand ?? defaultResolveCommand
  const requiredCapabilities = [...(dependencies.requiredCapabilities ?? DEFAULT_REQUIRED_CAPABILITIES)]
  const workUnits = new Map<string, { threadId: string; runtimeVersion: string }>()
  const activeTransports = new Map<string, CodexSessionTransport>()
  const allTransports = new Set<CodexSessionTransport>()
  const approvalTransports = new WeakMap<CodexRuntimeApprovalRequest, CodexSessionTransport>()

  async function initialize(input: CodexSessionPreflightInput): Promise<{ transport: CodexSessionTransport; negotiation: CodexCapabilityNegotiation }> {
    const command = await resolveCommand(input.command) ?? input.command
    const transport = await createTransport({ ...input, command })
    allTransports.add(transport)
    try {
      const initialized = await transport.request('initialize', { clientInfo: { name: 'agent_space', title: 'Agent Space', version: '0.1.0' }, capabilities: null })
      await transport.notify('initialized', {})
      const capabilities = capabilitiesFrom(initialized)
      const available = capabilitySet(capabilities)
      const missingCapabilities = requiredCapabilities.filter((capability) => !available.has(capability))
      const negotiation: CodexCapabilityNegotiation = {
        compatible: missingCapabilities.length === 0,
        command,
        version: versionOf(initialized),
        capabilities,
        requiredCapabilities,
        missingCapabilities,
        reason: missingCapabilities.length ? capabilityReason({ command, version: versionOf(initialized), missingCapabilities }) : null,
        suggestion: '请安装或更新 Codex CLI，使其支持所需的 App Server 方法和事件。'
      }
      if (!negotiation.compatible) {
        await closeTransport(transport)
        throw new CodexCapabilityNegotiationError(negotiation)
      }
      return { transport, negotiation }
    } catch (error) {
      if ([...allTransports].includes(transport)) await closeTransport(transport)
      throw error
    }
  }

  async function closeTransport(transport: CodexSessionTransport): Promise<void> {
    allTransports.delete(transport)
    for (const [key, value] of activeTransports) if (value === transport) activeTransports.delete(key)
    await transport.close().catch(() => undefined)
  }

  async function respondToApproval(request: CodexRuntimeApprovalRequest, result: unknown): Promise<void> {
    const knownTransport = approvalTransports.get(request)
    const candidates = knownTransport ? [knownTransport, ...[...allTransports].filter((transport) => transport !== knownTransport)] : [...allTransports]
    for (const transport of candidates) {
      if (!transport.respond) continue
      try {
        await transport.respond(request.id, result)
        approvalTransports.delete(request)
        return
      } catch {
        // Try another active transport if the first one closed concurrently.
      }
    }
    throw new Error('Runtime Approval 请求已失效，无法响应原始请求。')
  }

  return {
    async preflight(input) {
      try {
        const { transport, negotiation } = await initialize(input)
        await closeTransport(transport)
        return negotiation
      } catch (error) {
        const command = await resolveCommand(input.command) ?? input.command
        const result: CodexCapabilityNegotiation = error instanceof CodexCapabilityNegotiationError ? error.negotiation : {
          compatible: false,
          command,
          version: 'unknown',
          capabilities: {},
          requiredCapabilities,
          missingCapabilities: requiredCapabilities,
          reason: error instanceof Error ? error.message : String(error),
          suggestion: '请确认本机已安装并登录 Codex CLI，然后更新到支持 App Server 的版本。'
        }
        return { ...result, compatible: false, reason: result.reason ?? (error instanceof Error ? error.message : String(error)) }
      }
    },
    async runTurn(input) {
      let transport: CodexSessionTransport | null = null
      let retainTransport = false
      try {
        const initialized = await initialize(input)
        transport = initialized.transport
        const negotiation = initialized.negotiation
        if (!negotiation.compatible) throw new CodexCapabilityNegotiationError(negotiation)
        const previous = workUnits.get(input.workUnitKey)
        const priorThreadId = previous?.threadId ?? input.resumeLocator?.threadId
        const sandbox = input.sandbox ?? (input.permissionPolicy?.grantedPermissions.includes('workspace.write') ? 'workspace-write' : 'read-only')
        const threadResponse = await transport.request(priorThreadId ? 'thread/resume' : 'thread/start', priorThreadId
          ? { threadId: priorThreadId, cwd: input.cwd, approvalPolicy: input.approvalPolicy ?? 'never', sandbox }
          : { cwd: input.cwd, approvalPolicy: input.approvalPolicy ?? 'never', sandbox, serviceName: 'agent_space' })
        const threadId = stringValue(record(record(threadResponse)?.thread)?.id)
        if (!threadId) throw new Error('Codex App Server 未返回 Thread ID。')
        const turnResponse = await transport.request('turn/start', { threadId, input: [{ type: 'text', text: input.input, text_elements: [] }] })
        const turnId = stringValue(record(record(turnResponse)?.turn)?.id)
        if (!turnId) throw new Error('Codex App Server 未返回 Turn ID。')
        const runtimeVersion = negotiation.version
        const locator: RuntimeLocator = { runtimeProvider: 'codex', threadId, turnId, runtimeVersion }
        workUnits.set(input.workUnitKey, { threadId, runtimeVersion })
        const activeKey = `${threadId}:${turnId}`
        activeTransports.set(activeKey, transport)
        await input.onLocator?.(locator)
        const notifications: CodexAppServerMessage[] = []
      try {
        while (true) {
          const message = transport.nextMessage ? await transport.nextMessage() : await transport.nextNotification()
          if (!message) throw new Error('Codex App Server 在 Turn 完成前关闭。')
          notifications.push(message)
          await input.onNotification?.(message, locator)
          if ('id' in message) {
            const request = message as CodexRuntimeApprovalRequest
            approvalTransports.set(request, transport)
            const approvalResult = await input.onApproval?.(message as CodexRuntimeApprovalRequest)
            if (approvalResult !== undefined) {
              await respondToApproval(request, approvalResult)
              continue
            }
            // The Workflow Engine must persist waiting before a user decision is
            // available. Keep the original request and transport addressable.
            retainTransport = true
            return { locator, notifications, status: 'waiting', error: null }
          }
          if (message.method !== 'turn/completed' || message.params?.threadId !== threadId) continue
          const turn = record(message.params.turn)
          if (turn?.id !== turnId) continue
          const turnError = record(turn.error)
          return { locator, notifications, status: stringValue(turn.status) ?? 'failed', error: stringValue(turnError?.message) }
        }
      } finally {
        activeTransports.delete(activeKey)
        if (!retainTransport) await closeTransport(transport)
      }
      } finally {
        if (transport && !retainTransport && [...allTransports].includes(transport)) await closeTransport(transport)
      }
    },
    async interrupt(locator) {
      const transport = activeTransports.get(`${locator.threadId}:${locator.turnId}`)
      if (!transport) throw new Error('当前 Runtime Turn 不可中断。')
      await transport.request('turn/interrupt', { threadId: locator.threadId, turnId: locator.turnId })
    },
    respondToApproval,
    async readThread(input) {
      const { transport } = await initialize(input)
      try {
        return await transport.request('thread/read', { threadId: input.locator.threadId, includeTurns: true })
      } finally {
        await closeTransport(transport)
      }
    },
    async close() {
      await Promise.all([...allTransports].map((transport) => closeTransport(transport)))
      workUnits.clear()
      // WeakMap entries disappear with their original request objects.
    }
  }
}
