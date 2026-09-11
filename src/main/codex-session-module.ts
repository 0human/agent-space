import { constants } from 'node:fs'
import { spawn } from 'node:child_process'
import { access, mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { delimiter, join } from 'node:path'

import type { PermissionPolicy } from '../shared/project'
import type { RuntimeArtifact, RuntimeEventInput, RuntimeLocator } from '../shared/workflow-run'
import { zhCNMain } from '../shared/i18n/zh-CN'
import { createStdioCodexAppServerTransport, type CodexAppServerTransport, type JsonRpcServerRequest, type JsonRpcNotification } from './codex-app-server-transport'
import type { CodexItemProjection, CodexItemProjectionScope } from './codex-item-projection'
import { sanitizeSensitiveText } from './sensitive-text'
import { fileChanges } from './runtime-file-changes'
import { asRecord, asString } from './unknown-value'

export type CodexSessionTransport = CodexAppServerTransport

export interface CodexRuntimeApprovalRequest {
  readonly id: string
  readonly kind: 'question' | 'command' | 'file-change' | 'permissions' | 'exec-command' | 'apply-patch' | 'other'
  readonly summary: string
}

export interface CodexCapabilityInspectorInput extends CodexSessionPreflightInput {
  command: string
}

export type CodexCapabilityInspector = (input: CodexCapabilityInspectorInput) => Promise<Record<string, unknown> | null> | Record<string, unknown> | null

export interface CodexSessionPreflightInput {
  cwd: string
  command: string
  env?: NodeJS.ProcessEnv
}

export type CodexWorkUnit =
  | { kind: 'phase'; runId: string; phaseId: string }
  | { kind: 'implementation-ticket'; runId: string; ticketId: string }

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
  inspectCapabilities?: CodexCapabilityInspector
  requiredCapabilities?: string[]
  itemProjection?: Pick<CodexItemProjection, 'handle' | 'handleRequest' | 'completeRequest' | 'completeTurn' | 'setInterrupt' | 'restore'>
}

export interface CodexSessionTurnInput extends CodexSessionPreflightInput {
  executionId?: string
  workUnit: CodexWorkUnit
  input: string
  permissionPolicy?: PermissionPolicy
  sandbox?: 'read-only' | 'workspace-write' | string
  approvalPolicy?: string
  resumeLocator?: RuntimeLocator | null
  onLocator?: (locator: RuntimeLocator) => void | Promise<void>
  onApproval?: (request: CodexRuntimeApprovalRequest) => unknown | Promise<unknown>
  onTurnCompleted?: (result: CodexSessionTurnResult) => void | Promise<void>
}

export type CodexTurnStatus = 'completed' | 'interrupted' | 'waiting' | 'failed'

export interface CodexSessionTurnResult {
  locator: RuntimeLocator
  events: RuntimeEventInput[]
  status: CodexTurnStatus
  error?: string | null
}

export interface CodexSessionModule {
  preflight(input: CodexSessionPreflightInput): Promise<CodexCapabilityNegotiation>
  runTurn(input: CodexSessionTurnInput): Promise<CodexSessionTurnResult>
  interrupt(locator: Pick<RuntimeLocator, 'threadId' | 'turnId'>): Promise<boolean>
  respondToApproval(request: CodexRuntimeApprovalRequest, result: unknown): Promise<CodexSessionTurnResult>
  readThread(input: CodexSessionPreflightInput & {
    locator: Pick<RuntimeLocator, 'threadId'> & Partial<Omit<RuntimeLocator, 'threadId'>>
    projectionScope?: Omit<CodexItemProjectionScope, 'runtimeLocator'>
  }): Promise<unknown>
  close(): Promise<void>
}

export class CodexCapabilityNegotiationError extends Error {
  readonly negotiation: CodexCapabilityNegotiation

  constructor(negotiation: CodexCapabilityNegotiation) {
    super(negotiation.reason ?? zhCNMain.codexSession.capabilityNegotiationFailed(negotiation.command, negotiation.version, negotiation.missingCapabilities.join(', ')))
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

function versionOf(response: unknown): string {
  const value = asString(asRecord(response)?.userAgent) ?? 'unknown'
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
  const responseRecord = asRecord(response)
  const value = asRecord(responseRecord?.capabilities)
  const topLevelCapabilities = responseRecord
    ? Object.fromEntries(['methods', 'events', 'notifications'].filter((key) => key in responseRecord).map((key) => [key, responseRecord[key]]))
    : null
  return value ?? (Object.keys(topLevelCapabilities ?? {}).length > 0 ? (topLevelCapabilities ?? {}) : {})
}

function schemaValues(value: unknown, property: 'method'): string[] {
  const result: string[] = []
  if (Array.isArray(value)) {
    for (const item of value) result.push(...schemaValues(item, property))
    return result
  }
  const object = asRecord(value)
  if (!object) return result
  const properties = asRecord(object.properties)
  const method = asRecord(properties?.[property])
  const values = method?.enum
  if (Array.isArray(values)) for (const item of values) if (typeof item === 'string') result.push(item)
  for (const child of Object.values(object)) result.push(...schemaValues(child, property))
  return result
}

async function runProcess(command: string, args: string[], input: CodexCapabilityInspectorInput): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: input.cwd, env: input.env, stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    child.stdout.setEncoding('utf8').on('data', (chunk: string) => { stdout += chunk })
    child.stderr.setEncoding('utf8').on('data', (chunk: string) => { stderr += chunk })
    child.once('error', reject)
    child.once('close', (code) => resolve({ code, stdout, stderr }))
  })
}

async function inspectCapabilitiesFromSchema(input: CodexCapabilityInspectorInput): Promise<Record<string, unknown> | null> {
  const directory = await mkdtemp(join(tmpdir(), 'agent-space-codex-schema-'))
  try {
    const result = await runProcess(input.command, ['app-server', 'generate-json-schema', '--out', directory], input)
    if (result.code !== 0) return null
    const [client, notification] = await Promise.all([
      readFile(join(directory, 'ClientRequest.json'), 'utf8').catch(() => ''),
      readFile(join(directory, 'ServerNotification.json'), 'utf8').catch(() => '')
    ])
    const methods = client ? schemaValues(JSON.parse(client), 'method') : []
    const events = notification ? schemaValues(JSON.parse(notification), 'method') : []
    if (!methods.length && !events.length) return null
    return { methods: [...new Set(methods)], events: [...new Set(events)] }
  } catch {
    return null
  } finally {
    await rm(directory, { recursive: true, force: true }).catch(() => undefined)
  }
}

function capabilitySet(capabilities: Record<string, unknown>): Set<string> {
  const result = new Set<string>()
  for (const key of ['methods', 'events', 'notifications', 'capabilities']) {
    const values = capabilities[key]
    if (Array.isArray(values)) for (const value of values) if (typeof value === 'string') result.add(['events', 'notifications'].includes(key) ? `events:${value}` : value)
    else if (asRecord(values)) for (const value of Object.keys(values)) result.add(['events', 'notifications'].includes(key) ? `events:${value}` : value)
  }
  for (const [key, value] of Object.entries(capabilities)) if (value === true) result.add(key)
  return result
}

function capabilityReason(result: Pick<CodexCapabilityNegotiation, 'command' | 'version' | 'missingCapabilities'>): string {
  return zhCNMain.codexSession.capabilityNegotiationFailed(result.command, result.version, result.missingCapabilities.join(', '))
}

const QUESTION_PREFIX = 'QUESTION:'
const APPROVAL_PREFIX = 'APPROVAL_REQUIRED:'
const ARTIFACT_PREFIX = 'ARTIFACT:'
const TICKET_PROGRESS_PREFIX = 'TICKET_PROGRESS:'

function approvalKind(method: string): CodexRuntimeApprovalRequest['kind'] {
  if (method === 'item/tool/requestUserInput') return 'question'
  if (method === 'item/commandExecution/requestApproval') return 'command'
  if (method === 'item/fileChange/requestApproval') return 'file-change'
  if (method === 'item/permissions/requestApproval') return 'permissions'
  if (method === 'execCommandApproval') return 'exec-command'
  if (method === 'applyPatchApproval') return 'apply-patch'
  return 'other'
}

function approvalSummary(request: JsonRpcServerRequest): string {
  if (request.method === 'item/tool/requestUserInput' && Array.isArray(request.params?.questions)) {
    const questions = request.params.questions.flatMap((value) => {
      const question = asString(asRecord(value)?.question)
      return question ? [question] : []
    })
    if (questions.length > 0) return sanitizeSensitiveText(questions.join('\n'))
  }
  const command = asString(request.params?.command)
  const reason = asString(request.params?.reason)
  return sanitizeSensitiveText(zhCNMain.codexRuntime.runtimeApproval(command ?? reason ?? '', request.method))
}

function normalizeApprovalResult(request: JsonRpcServerRequest, result: unknown): unknown {
  let value = asRecord(result)
  if (typeof value?.answer === 'string' && request.method === 'item/tool/requestUserInput') {
    const answer = value.answer
    const questions = Array.isArray(request.params?.questions) ? request.params.questions : []
    value = { answers: Object.fromEntries(questions.flatMap((question) => {
      const id = asString(asRecord(question)?.id)
      return id ? [[id, { answers: [answer] }]] : []
    })) }
  }
  if (typeof value?.approved === 'boolean') {
    const approved = value.approved
    if (request.method === 'item/permissions/requestApproval') {
      // Only echo the explicit requested permissions; never widen their scope.
      value = { permissions: approved ? asRecord(request.params?.permissions) ?? {} : {}, scope: 'turn' }
    } else if (request.method === 'execCommandApproval' || request.method === 'applyPatchApproval') {
      value = { decision: approved ? 'approved' : 'denied' }
    } else if (request.method === 'mcpServer/elicitation/request') {
      value = { action: approved ? 'accept' : 'decline' }
    } else {
      value = { decision: approved ? 'accept' : 'decline' }
    }
  }
  const decision = value && 'decision' in value ? value.decision : result
  if (request.method === 'item/permissions/requestApproval') {
    if (value && 'permissions' in value) return value
    throw new Error(zhCNMain.codexSession.invalidApprovalDecision(request.method))
  }
  if (request.method === 'mcpServer/elicitation/request') {
    if (value && 'action' in value) return value
    throw new Error(zhCNMain.codexSession.invalidApprovalDecision(request.method))
  }
  if (request.method === 'item/tool/requestUserInput') {
    if (value && 'answers' in value) return value
    throw new Error(zhCNMain.codexSession.invalidApprovalDecision(request.method))
  }
  if (request.method === 'item/tool/call') {
    if (value && 'success' in value && 'contentItems' in value) return value
    throw new Error(zhCNMain.codexSession.invalidApprovalDecision(request.method))
  }
  if (request.method === 'account/chatgptAuthTokens/refresh' || request.method === 'attestation/generate') {
    if (value) return value
    throw new Error(zhCNMain.codexSession.invalidApprovalDecision(request.method))
  }
  const validDecision = typeof decision === 'string' || (decision !== null && typeof decision === 'object')
  if (validDecision) return { decision }
  throw new Error(zhCNMain.codexSession.invalidApprovalDecision(request.method))
}

function parseAgentMessage(text: string): RuntimeEventInput {
  if (text.startsWith(QUESTION_PREFIX)) return { type: 'question', question: text.slice(QUESTION_PREFIX.length).trim() }
  if (text.startsWith(APPROVAL_PREFIX)) return { type: 'approval_required', approval: text.slice(APPROVAL_PREFIX.length).trim() }
  if (text.startsWith(TICKET_PROGRESS_PREFIX)) {
    try {
      const progress = JSON.parse(text.slice(TICKET_PROGRESS_PREFIX.length).trim()) as Record<string, unknown>
      if (['implementation', 'testing', 'review', 'commit'].includes(String(progress.stage)) && ['pending', 'running', 'completed', 'failed', 'skipped'].includes(String(progress.status))) {
        return {
          type: 'ticket_progress',
          stage: progress.stage as Extract<RuntimeEventInput, { type: 'ticket_progress' }>['stage'],
          status: progress.status as Extract<RuntimeEventInput, { type: 'ticket_progress' }>['status']
        }
      }
    } catch {
      // Preserve malformed protocol messages as displayable text.
    }
    return { type: 'text_delta', text }
  }
  if (text.startsWith(ARTIFACT_PREFIX)) {
    try {
      const artifact = JSON.parse(text.slice(ARTIFACT_PREFIX.length).trim()) as RuntimeArtifact
      if (artifact && typeof artifact === 'object' && typeof artifact.name === 'string' && typeof artifact.type === 'string') return { type: 'artifact_produced', artifact }
    } catch {
      return { type: 'text_delta', text }
    }
  }
  return { type: 'text_delta', text }
}

function runtimeEventForNotification(notification: JsonRpcNotification): RuntimeEventInput | null {
  if (notification.method === 'item/completed') {
    const item = asRecord(notification.params?.item)
    if (!item) return null
    const type = asString(item.type)
    if (type === 'agentMessage') {
      const text = asString(item.text)
      return text ? parseAgentMessage(text) : null
    }
    if (type === 'fileChange' && item.status !== 'failed' && item.status !== 'declined') {
      return { type: 'file_changes', changes: fileChanges(item.changes), idempotencyKey: `file-changes:${notification.params?.threadId}:${notification.params?.turnId}:${item.id}` }
    }
    if (type === 'commandExecution') {
      const command = asString(item.command)
      if (!command) return null
      return { type: 'tool_call', name: command, input: { ...(typeof item.status === 'string' ? { status: item.status } : {}), ...(typeof item.exitCode === 'number' ? { exitCode: item.exitCode } : {}), ...(typeof item.durationMs === 'number' ? { durationMs: item.durationMs } : {}) } }
    }
  }
  if (notification.method === 'error') {
    const error = asRecord(notification.params?.error)
    const message = asString(error?.message) ?? asString(notification.params?.message)
    return message ? { type: 'error', error: message } : null
  }
  return null
}

function effectiveSandbox(input: CodexSessionTurnInput): string {
  const canWrite = input.permissionPolicy?.grantedPermissions.includes('workspace.write') ?? true
  const requested = input.sandbox
  const supported = ['read-only', 'workspace-write', 'readOnly', 'workspaceWrite']
  if (!canWrite) return 'read-only'
  return requested && supported.includes(requested) ? requested : 'workspace-write'
}

function effectiveApprovalPolicy(input: CodexSessionTurnInput): string {
  const requested = input.approvalPolicy ?? 'on-request'
  // A project policy must be able to observe and deny side effects. Never let
  // an explicitly requested "never" policy bypass that boundary.
  return input.permissionPolicy && requested === 'never' ? 'on-request' : requested
}

function sandboxPolicyParams(input: CodexSessionTurnInput, sandbox: string): Record<string, unknown> {
  const policy = input.permissionPolicy
  if (!policy) return {}
  const allowedPaths = policy.allowedPaths?.filter((path) => path.trim())
  const networkAccess = policy.grantedPermissions.includes('network.github')
  if (sandbox === 'read-only' || sandbox === 'readOnly') {
    return { sandboxPolicy: { type: 'readOnly', networkAccess } }
  }
  return { sandboxPolicy: { type: 'workspaceWrite', ...(allowedPaths?.length ? { writableRoots: [...allowedPaths] } : {}), networkAccess } }
}

export function createCodexSessionModule(dependencies: CodexSessionModuleDependencies = {}): CodexSessionModule {
  const createTransport = dependencies.createTransport ?? ((options: CodexSessionPreflightInput) => createStdioCodexAppServerTransport(options))
  const resolveCommand = dependencies.resolveCommand ?? defaultResolveCommand
  const inspectCapabilities = dependencies.inspectCapabilities ?? inspectCapabilitiesFromSchema
  const itemProjection = dependencies.itemProjection
  const requiredCapabilities = [...(dependencies.requiredCapabilities ?? DEFAULT_REQUIRED_CAPABILITIES)]
  const workUnits = new Map<string, { threadId: string; runtimeVersion: string }>()
  const activeTransports = new Map<string, CodexSessionTransport>()
  const allTransports = new Set<CodexSessionTransport>()
  let nextApprovalId = 1
  type TurnState = {
    transport: CodexSessionTransport
    activeKey: string
    locator: RuntimeLocator
    events: RuntimeEventInput[]
    input: CodexSessionTurnInput
    waitingRequest: CodexRuntimeApprovalRequest | null
    waitingRawRequest: JsonRpcServerRequest | null
    processing: Promise<CodexSessionTurnResult> | null
  }
  const turnStates = new Map<string, TurnState>()

  function projectionScope(state: TurnState) {
    return {
      runId: state.input.workUnit.runId,
      executionId: state.input.executionId ?? '',
      runtimeLocator: state.locator,
      permissionPolicy: state.input.permissionPolicy ?? { grantedPermissions: [] },
      source: 'codex app-server'
    }
  }

  function observeProjection(action: () => void): void {
    try {
      action()
    } catch {
      // Display projection is observational and cannot affect an active Turn or history access.
    }
  }

  function workUnitKey(workUnit: CodexWorkUnit): string {
    return workUnit.kind === 'phase'
      ? `${workUnit.runId}:phase:${workUnit.phaseId}`
      : `implementation-ticket:${workUnit.runId}:${workUnit.ticketId}`
  }

  function publicApprovalRequest(request: JsonRpcServerRequest): CodexRuntimeApprovalRequest {
    return Object.freeze({ id: `runtime-approval-${nextApprovalId++}`, kind: approvalKind(request.method), summary: approvalSummary(request) })
  }

  async function initialize(input: CodexSessionPreflightInput): Promise<{ transport: CodexSessionTransport; negotiation: CodexCapabilityNegotiation }> {
    const command = await resolveCommand(input.command) ?? input.command
    const transport = await createTransport({ ...input, command })
    allTransports.add(transport)
    try {
      const initialized = await transport.request('initialize', { clientInfo: { name: 'agent_space', title: 'Agent Space', version: '0.1.0' }, capabilities: null })
      await transport.notify('initialized', {})
      let capabilities = capabilitiesFrom(initialized)
      if (Object.keys(capabilities).length === 0) capabilities = await inspectCapabilities({ ...input, command }) ?? {}
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
        suggestion: zhCNMain.codexSession.capabilitySuggestion
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

  async function respondToApproval(request: CodexRuntimeApprovalRequest, result: unknown): Promise<CodexSessionTurnResult> {
    const state = [...turnStates.values()].find((candidate) => candidate.waitingRequest?.id === request.id)
    const original = state?.waitingRawRequest ?? null
    if (!state || !original) throw new Error(zhCNMain.codexSession.approvalContinuationExpired)
    if (!state.transport.respond) throw new Error(zhCNMain.codexSession.approvalExpired)
    const normalized = normalizeApprovalResult(original, result)
    await state.transport.respond(original.id, normalized)
    if (state.input.executionId) {
      observeProjection(() => itemProjection?.completeRequest(original, normalized, projectionScope(state)))
    }
    state.waitingRequest = null
    state.waitingRawRequest = null
    state.events = []
    state.processing = consumeTurn(state)
    return state.processing
  }

  async function consumeTurn(state: TurnState): Promise<CodexSessionTurnResult> {
    try {
      while (true) {
        const message = state.transport.nextMessage ? await state.transport.nextMessage() : await state.transport.nextNotification()
        if (!message) throw new Error(zhCNMain.codexSession.turnClosed)
        if (!('id' in message)) {
          const belongsToTurn = message.params?.threadId === state.locator.threadId && message.params?.turnId === state.locator.turnId
          const event = belongsToTurn ? runtimeEventForNotification(message) : null
          if (event) state.events.push(event)
          if (state.input.executionId) {
            observeProjection(() => itemProjection?.handle(message, projectionScope(state)))
          }
        }
        if ('id' in message) {
          const request = message as JsonRpcServerRequest
          const publicRequest = publicApprovalRequest(request)
          if (state.input.executionId) {
            observeProjection(() => itemProjection?.handleRequest(request, projectionScope(state)))
          }
          if (publicRequest.kind === 'question') state.events.push({ type: 'question', question: publicRequest.summary })
          state.waitingRequest = publicRequest
          state.waitingRawRequest = request
          const approvalResult = await state.input.onApproval?.(publicRequest)
          if (approvalResult !== undefined) {
            if (!state.transport.respond) throw new Error(zhCNMain.codexSession.approvalExpired)
            const normalized = normalizeApprovalResult(request, approvalResult)
            await state.transport.respond(request.id, normalized)
            if (state.input.executionId) {
              observeProjection(() => itemProjection?.completeRequest(request, normalized, projectionScope(state)))
            }
            state.waitingRequest = null
            state.waitingRawRequest = null
            continue
          }
          return { locator: state.locator, events: state.events, status: 'waiting', error: null }
        }
        if (message.method !== 'turn/completed' || message.params?.threadId !== state.locator.threadId) continue
        const turn = asRecord(message.params.turn)
        if (turn?.id !== state.locator.turnId) continue
        const turnError = asRecord(turn.error)
        const status = asString(turn.status)
        const terminalStatus = status === 'completed' || status === 'interrupted' ? status : 'failed'
        const result: CodexSessionTurnResult = {
          locator: state.locator,
          events: state.events,
          status: terminalStatus,
          error: asString(turnError?.message)
        }
        if (state.input.executionId) {
          observeProjection(() => itemProjection?.completeTurn(terminalStatus, result.error ?? null, projectionScope(state)))
        }
        await state.input.onTurnCompleted?.(result)
        return result
      }
    } finally {
      // A waiting Turn remains addressable through turnStates until the user
      // responds. Completed or failed Turns release the transport here.
      if (!state.waitingRequest) {
        turnStates.delete(state.activeKey)
        activeTransports.delete(state.activeKey)
        await closeTransport(state.transport)
      }
    }
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
          suggestion: zhCNMain.codexSession.preflightSuggestion
        }
        return { ...result, compatible: false, reason: result.reason ?? (error instanceof Error ? error.message : String(error)) }
      }
    },
    async runTurn(input) {
      let transport: CodexSessionTransport | null = null
      try {
        const initialized = await initialize(input)
        transport = initialized.transport
        const negotiation = initialized.negotiation
        if (!negotiation.compatible) throw new CodexCapabilityNegotiationError(negotiation)
        const unitKey = workUnitKey(input.workUnit)
        const previous = workUnits.get(unitKey)
        const priorThreadId = previous?.threadId ?? input.resumeLocator?.threadId
        const sandbox = effectiveSandbox(input)
        const approvalPolicy = effectiveApprovalPolicy(input)
        const policyParams = sandboxPolicyParams(input, sandbox)
        const threadResponse = await transport.request(priorThreadId ? 'thread/resume' : 'thread/start', priorThreadId
          ? { threadId: priorThreadId, cwd: input.cwd, approvalPolicy, sandbox }
          : { cwd: input.cwd, approvalPolicy, sandbox, serviceName: 'agent_space' })
        const threadId = asString(asRecord(asRecord(threadResponse)?.thread)?.id)
        if (!threadId) throw new Error(zhCNMain.codexSession.missingThreadId)
        const turnResponse = await transport.request('turn/start', {
          threadId,
          input: [{ type: 'text', text: input.input, text_elements: [] }],
          cwd: input.cwd,
          approvalPolicy,
          sandboxPolicy: policyParams.sandboxPolicy ?? { type: sandbox === 'read-only' ? 'readOnly' : 'workspaceWrite' },
          ...policyParams
        })
        const turnId = asString(asRecord(asRecord(turnResponse)?.turn)?.id)
        if (!turnId) throw new Error(zhCNMain.codexSession.missingTurnId)
        const runtimeVersion = negotiation.version
        const locator: RuntimeLocator = { runtimeProvider: 'codex', threadId, turnId, runtimeVersion }
        workUnits.set(unitKey, { threadId, runtimeVersion })
        const activeKey = `${threadId}:${turnId}`
        activeTransports.set(activeKey, transport)
        await input.onLocator?.(locator)
        const state: TurnState = { transport, activeKey, locator, events: [], input, waitingRequest: null, waitingRawRequest: null, processing: null }
        turnStates.set(activeKey, state)
        state.processing = consumeTurn(state)
        return await state.processing
      } finally {
        // consumeTurn owns the transport once the Turn has been registered.
        if (transport && ![...turnStates.values()].some((state) => state.transport === transport) && [...allTransports].includes(transport)) await closeTransport(transport)
      }
    },
    async interrupt(locator) {
      const activeKey = `${locator.threadId}:${locator.turnId}`
      const transport = activeTransports.get(activeKey)
      if (!transport) return false
      await transport.request('turn/interrupt', { threadId: locator.threadId, turnId: locator.turnId })
      const state = turnStates.get(activeKey)
      if (state?.input.executionId) {
        observeProjection(() => itemProjection?.setInterrupt('in_progress', projectionScope(state)))
      }
      if (state?.waitingRequest) {
        state.waitingRequest = null
        state.waitingRawRequest = null
        state.events = []
        state.processing = consumeTurn(state)
        await state.processing
      }
      return true
    },
    respondToApproval,
    async readThread(input) {
      const { transport } = await initialize(input)
      try {
        const response = await transport.request('thread/read', { threadId: input.locator.threadId, includeTurns: true })
        const turnId = 'turnId' in input.locator ? input.locator.turnId : null
        if (!turnId) return response
        const responseRecord = asRecord(response)
        const thread = asRecord(responseRecord?.thread)
        if (!thread || !Array.isArray(thread.turns)) throw new Error(zhCNMain.codexSession.invalidThreadHistory)
        const turns = thread.turns.filter((turn) => asRecord(turn)?.id === turnId)
        if (turns.length === 0) throw new Error(zhCNMain.codexSession.missingTurnHistory)
        const selected = { ...responseRecord, thread: { ...thread, turns } }
        const runtimeProvider = input.locator.runtimeProvider
        const runtimeVersion = input.locator.runtimeVersion
        const historyScope = input.projectionScope
        if (historyScope && runtimeProvider && runtimeVersion) {
          observeProjection(() => itemProjection?.restore(selected, {
            ...historyScope,
            runtimeLocator: {
              runtimeProvider,
              threadId: input.locator.threadId,
              turnId,
              runtimeVersion
            }
          }))
        }
        return selected
      } finally {
        await closeTransport(transport)
      }
    },
    async close() {
      await Promise.all([...allTransports].map((transport) => closeTransport(transport)))
      turnStates.clear()
      workUnits.clear()
    }
  }
}
