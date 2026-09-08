import type { PermissionPolicy } from '../shared/project'
import { runtimeItemIdentity, type RuntimeApprovalDecision, type RuntimeApprovalItem, type RuntimeErrorItem, type RuntimeFileChange, type RuntimeItem, type RuntimeItemStatus, type RuntimeLocator, type RuntimeQuestion, type RuntimeQuestionItem } from '../shared/workflow-run'
import type { JsonRpcNotification, JsonRpcServerRequest } from './codex-app-server-transport'
import { sanitizePermissionPolicy, sanitizeSensitivePath, sanitizeSensitiveText } from './sensitive-text'

const recognizedItemTypes = new Set(['agentMessage', 'commandExecution', 'fileChange', 'plan', 'mcpToolCall', 'dynamicToolCall', 'reasoning'])

export interface CodexItemProjectionScope {
  runId: string
  executionId: string
  runtimeLocator: RuntimeLocator
  permissionPolicy: PermissionPolicy
  source: string
}

export type CodexIgnoredItemReason = 'unsupported_item_type' | 'malformed_item'

export interface CodexIgnoredItem {
  runId: string
  executionId: string
  method: 'item/started' | 'item/completed'
  itemId: string | null
  itemType: string | null
  reason: CodexIgnoredItemReason
}

export interface CodexItemProjectionDependencies {
  publish?: (item: RuntimeItem) => void | Promise<void>
  onIgnoredItem?: (item: CodexIgnoredItem) => void | Promise<void>
}

export interface CodexItemProjection {
  handle(notification: JsonRpcNotification, scope: CodexItemProjectionScope): void
  handleRequest(request: JsonRpcServerRequest, scope: CodexItemProjectionScope): void
  completeRequest(request: JsonRpcServerRequest, response: unknown, scope: CodexItemProjectionScope): void
  completeTurn(status: 'completed' | 'interrupted' | 'failed', error: string | null, scope: CodexItemProjectionScope): void
  setInterrupt(status: 'in_progress' | 'completed', scope: CodexItemProjectionScope): void
  restore(history: unknown, scope: CodexItemProjectionScope): void
  list(executionId: string): RuntimeItem[]
  listIgnoredItems(executionId: string): CodexIgnoredItem[]
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  const object = record(value)
  if (object) return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${stableJson(object[key])}`).join(',')}}`
  return JSON.stringify(value)
}

/** Redact recognizable credential prefixes before they reach full token length. */
function sanitizeStreamingText(value: string): string {
  return sanitizeSensitiveText(value
    .replace(/\b(?:gh[pousr]_|github_pat_|sk-|xox[baprs]-)[A-Za-z0-9._~+\/-]*/gi, '<redacted>')
    .replace(/\bAKIA[0-9A-Z]*$/g, '<redacted>'))
}

function commandStatus(value: unknown): RuntimeItemStatus {
  if (value === 'completed' || value === 'failed' || value === 'declined') return value
  return 'in_progress'
}

function itemStatus(method: 'item/started' | 'item/completed', value: unknown): RuntimeItemStatus {
  if (method === 'item/completed') return value === 'failed' || value === 'declined' ? value : 'completed'
  return commandStatus(value)
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null
}

function errorCode(value: unknown): string {
  if (typeof value !== 'string' && typeof value !== 'number') return 'unknown'
  const safe = sanitizeSensitiveText(String(value))
  return /^[A-Za-z0-9._-]{1,64}$/.test(safe) && !/(?:token|secret|password|authorization|credential|key)/i.test(safe) ? safe : 'unknown'
}

function lineCounts(diff: string): { additions: number; deletions: number } {
  let additions = 0
  let deletions = 0
  for (const line of diff.split(/\r?\n/)) {
    if (line.startsWith('+++') || line.startsWith('---')) continue
    if (line.startsWith('+')) additions += 1
    if (line.startsWith('-')) deletions += 1
  }
  return { additions, deletions }
}

function fileChanges(value: unknown): RuntimeFileChange[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((entry) => {
    const change = record(entry)
    const path = typeof change?.path === 'string' ? change.path : null
    const diff = typeof change?.diff === 'string' ? change.diff : ''
    const kindValue = typeof change?.kind === 'string' ? change.kind : record(change?.kind)?.type
    if (!path || !['add', 'update', 'delete'].includes(String(kindValue))) return []
    const counts = lineCounts(diff)
    return [{ path: sanitizeSensitivePath(sanitizeSensitiveText(path)), kind: kindValue as RuntimeFileChange['kind'], ...counts }]
  })
}

function toolOutput(item: Record<string, unknown>): string | null {
  const error = record(item.error)
  if (typeof error?.message === 'string') return sanitizeSensitiveText(error.message)
  if (Array.isArray(item.contentItems)) {
    const text = item.contentItems.flatMap((entry) => {
      const contentItem = record(entry)
      return contentItem?.type === 'inputText' && typeof contentItem.text === 'string'
        ? [sanitizeSensitiveText(contentItem.text)]
        : []
    }).join('\n')
    if (text) return text
  }
  const result = record(item.result)
  const content = result?.content
  if (!Array.isArray(content)) return null
  const text = content.flatMap((entry) => {
    const value = record(entry)?.text
    return typeof value === 'string' ? [sanitizeSensitiveText(value)] : []
  }).join('\n')
  return text || null
}

function planSteps(value: unknown): Array<{ step: string; status: string }> {
  if (!Array.isArray(value)) return []
  return value.flatMap((entry) => {
    const plan = record(entry)
    const step = typeof plan?.step === 'string' ? plan.step : typeof plan?.name === 'string' ? plan.name : null
    const status = typeof plan?.status === 'string' ? plan.status : null
    if (status !== 'pending' && status !== 'inProgress' && status !== 'completed') return []
    return step && status ? [{
      step: sanitizeSensitiveText(step),
      status: status === 'inProgress' ? 'in_progress' : sanitizeSensitiveText(status)
    }] : []
  })
}

function userInputQuestions(value: unknown): RuntimeQuestion[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((entry) => {
    const input = record(entry)
    const id = nonEmptyString(input?.id)
    const header = nonEmptyString(input?.header)
    const question = nonEmptyString(input?.question)
    if (!id || !header || !question) return []
    const options = Array.isArray(input?.options) ? input.options.flatMap((entry) => {
      const option = record(entry)
      const label = nonEmptyString(option?.label)
      const description = nonEmptyString(option?.description)
      return label && description ? [{ label: sanitizeSensitiveText(label), description: sanitizeSensitiveText(description) }] : []
    }) : []
    return [{
      id: sanitizeSensitiveText(id),
      header: sanitizeSensitiveText(header),
      question: sanitizeSensitiveText(question),
      options,
      isSecret: input?.isSecret === true
    }]
  })
}

const approvalKinds = new Map<string, RuntimeApprovalItem['kind']>([
  ['item/commandExecution/requestApproval', 'command'],
  ['item/fileChange/requestApproval', 'file_change'],
  ['item/permissions/requestApproval', 'permissions'],
  ['execCommandApproval', 'exec_command'],
  ['applyPatchApproval', 'apply_patch']
])

function approvalDecision(value: unknown): RuntimeApprovalDecision {
  const decision = record(value)?.decision
  if (decision === 'accept' || decision === 'acceptForSession' || decision === 'decline' || decision === 'cancel') return decision
  const decisionRecord = record(decision)
  if (decisionRecord?.acceptWithExecpolicyAmendment) return 'acceptWithExecpolicyAmendment'
  if (decisionRecord?.applyNetworkPolicyAmendment) return 'applyNetworkPolicyAmendment'
  return 'completed'
}

function requestItemId(request: JsonRpcServerRequest, itemId: string): string {
  return request.method === 'item/tool/requestUserInput'
    ? `question:${itemId}`
    : `approval:${itemId}`
}

function safeRuntimeLocator(locator: RuntimeLocator): RuntimeLocator {
  return {
    runtimeProvider: sanitizeSensitiveText(locator.runtimeProvider),
    threadId: sanitizeSensitiveText(locator.threadId),
    turnId: sanitizeSensitiveText(locator.turnId),
    runtimeVersion: sanitizeSensitiveText(locator.runtimeVersion)
  }
}

function projectionMetadata(scope: CodexItemProjectionScope) {
  return {
    runId: sanitizeSensitiveText(scope.runId),
    executionId: sanitizeSensitiveText(scope.executionId),
    provider: sanitizeSensitiveText(scope.runtimeLocator.runtimeProvider),
    source: sanitizeSensitiveText(scope.source),
    permissionPolicy: sanitizePermissionPolicy(scope.permissionPolicy),
    runtimeLocator: safeRuntimeLocator(scope.runtimeLocator)
  }
}

export function createCodexItemProjection(dependencies: CodexItemProjectionDependencies = {}): CodexItemProjection {
  const itemsByExecution = new Map<string, Map<string, RuntimeItem>>()
  const ignoredItemsByExecution = new Map<string, Map<string, CodexIgnoredItem>>()
  const completedItemsByExecution = new Map<string, Set<string>>()
  const seenDeltas = new Set<string>()
  // Raw text stays inside this module and is discarded when its Item completes.
  const rawTextStreams = new Map<string, string>()
  const pendingTextDeltas = new Map<string, string>()
  const pendingFileChanges = new Map<string, RuntimeFileChange[]>()

  const scopedIdentity = (scope: CodexItemProjectionScope, itemId: string): string => runtimeItemIdentity({
    id: sanitizeSensitiveText(itemId),
    provider: sanitizeSensitiveText(scope.runtimeLocator.runtimeProvider),
    runtimeLocator: safeRuntimeLocator(scope.runtimeLocator)
  })

  const markCompleted = (executionId: string, identity: string): void => {
    let completed = completedItemsByExecution.get(executionId)
    if (!completed) {
      completed = new Set()
      completedItemsByExecution.set(executionId, completed)
    }
    completed.add(identity)
  }

  const streamKey = (scope: CodexItemProjectionScope, itemId: string, method: string): string =>
    `${scope.executionId}:${scopedIdentity(scope, itemId)}:${method}`

  const startText = (scope: CodexItemProjectionScope, itemId: string, method: string, initial: string): string => {
    const key = streamKey(scope, itemId, method)
    const pending = pendingTextDeltas.get(key) ?? ''
    pendingTextDeltas.delete(key)
    const text = initial + pending
    rawTextStreams.set(key, text)
    return text
  }

  const clearPending = (scope: CodexItemProjectionScope, itemId: string): void => {
    for (const method of ['item/agentMessage/delta', 'item/plan/delta', 'item/commandExecution/outputDelta']) {
      pendingTextDeltas.delete(streamKey(scope, itemId, method))
      rawTextStreams.delete(streamKey(scope, itemId, method))
    }
    pendingFileChanges.delete(streamKey(scope, itemId, 'item/fileChange/patchUpdated'))
    const prefix = `${scope.executionId}:${scopedIdentity(scope, itemId)}:`
    for (const fingerprint of seenDeltas) {
      if (fingerprint.startsWith(prefix)) seenDeltas.delete(fingerprint)
    }
  }

  const update = (scope: CodexItemProjectionScope, item: RuntimeItem): void => {
    let executionItems = itemsByExecution.get(scope.executionId)
    if (!executionItems) {
      executionItems = new Map()
      itemsByExecution.set(scope.executionId, executionItems)
    }
    const identity = runtimeItemIdentity(item)
    const previous = executionItems.get(identity)
    if (previous && JSON.stringify(previous) === JSON.stringify(item)) return
    executionItems.set(identity, item)

    try {
      const published = dependencies.publish?.(item)
      if (published !== undefined) void Promise.resolve(published).catch(() => undefined)
    } catch {
      // Projection publication is observational and must not affect the active Turn.
    }
  }

  const observeIgnored = (
    scope: CodexItemProjectionScope,
    method: 'item/started' | 'item/completed',
    itemId: string | null,
    itemType: string | null,
    reason: CodexIgnoredItemReason
  ): void => {
    let executionItems = ignoredItemsByExecution.get(scope.executionId)
    if (!executionItems) {
      executionItems = new Map()
      ignoredItemsByExecution.set(scope.executionId, executionItems)
    }
    const item: CodexIgnoredItem = {
      runId: sanitizeSensitiveText(scope.runId),
      executionId: sanitizeSensitiveText(scope.executionId),
      method,
      itemId: itemId ? sanitizeSensitiveText(itemId) : null,
      itemType: itemType ? sanitizeSensitiveText(itemType) : null,
      reason
    }
    const key = stableJson(item)
    if (executionItems.has(key)) return
    executionItems.set(key, item)

    try {
      const observed = dependencies.onIgnoredItem?.(item)
      if (observed !== undefined) void Promise.resolve(observed).catch(() => undefined)
    } catch {
      // Ignored Item diagnostics are observational and must not affect the active Turn.
    }
  }

  const projection: CodexItemProjection = {
    handle(notification, scope) {
      if (notification.params?.threadId !== scope.runtimeLocator.threadId || notification.params?.turnId !== scope.runtimeLocator.turnId) return
      if (!notification.params) return

      const metadata = projectionMetadata(scope)

      if (notification.method === 'turn/plan/updated') {
        const steps = planSteps(notification.params.plan)
        const itemId = `plan:${scope.runtimeLocator.turnId}`
        const identity = scopedIdentity(scope, itemId)
        if (completedItemsByExecution.get(scope.executionId)?.has(identity)) return
        update(scope, {
          id: sanitizeSensitiveText(itemId),
          ...metadata,
          type: 'plan',
          status: 'in_progress',
          text: typeof notification.params.explanation === 'string' ? sanitizeSensitiveText(notification.params.explanation) : '',
          ...(steps.length > 0 ? { steps } : {})
        })
        return
      }

      if (notification.method === 'item/started' || notification.method === 'item/completed') {
        const method = notification.method
        const item = record(notification.params.item)
        const itemId = nonEmptyString(item?.id)
        const itemType = nonEmptyString(item?.type)
        if (!item || !itemId) {
          observeIgnored(scope, method, itemId, itemType, 'malformed_item')
          return
        }
        const identity = scopedIdentity(scope, itemId)
        if (completedItemsByExecution.get(scope.executionId)?.has(identity)) return
        if (method === 'item/started' && itemsByExecution.get(scope.executionId)?.has(identity)) return
        const project = (projected: RuntimeItem): void => {
          update(scope, projected)
          if (method !== 'item/completed') return
          clearPending(scope, itemId)
          markCompleted(scope.executionId, identity)
        }
        if (item.type === 'agentMessage' && typeof item.text === 'string') {
          const text = method === 'item/started' ? startText(scope, itemId, 'item/agentMessage/delta', item.text) : item.text
          project({
            id: sanitizeSensitiveText(itemId),
            ...metadata,
            type: item.phase === 'final_answer' ? 'final_response' : 'agent_message',
            status: method === 'item/completed' ? 'completed' : 'in_progress',
            text: sanitizeStreamingText(text)
          })
        } else if (item.type === 'commandExecution' && typeof item.command === 'string') {
          const initial = typeof item.aggregatedOutput === 'string' ? item.aggregatedOutput : ''
          const text = method === 'item/started' ? startText(scope, itemId, 'item/commandExecution/outputDelta', initial) : initial
          project({
            id: sanitizeSensitiveText(itemId),
            ...metadata,
            type: 'command',
            status: itemStatus(method, item.status),
            command: sanitizeSensitiveText(item.command),
            output: sanitizeStreamingText(text),
            exitCode: typeof item.exitCode === 'number' ? item.exitCode : null,
            durationMs: typeof item.durationMs === 'number' ? item.durationMs : null
          })
        } else if (item.type === 'fileChange') {
          if (!Array.isArray(item.changes)) {
            observeIgnored(scope, method, itemId, itemType, 'malformed_item')
            return
          }
          const pending = method === 'item/started' ? pendingFileChanges.get(streamKey(scope, itemId, 'item/fileChange/patchUpdated')) : undefined
          if (pending) pendingFileChanges.delete(streamKey(scope, itemId, 'item/fileChange/patchUpdated'))
          const changes = pending ?? fileChanges(item.changes)
          project({
            id: sanitizeSensitiveText(itemId),
            ...metadata,
            type: 'file_change',
            status: itemStatus(method, item.status),
            changes,
            additions: changes.reduce((total, change) => total + change.additions, 0),
            deletions: changes.reduce((total, change) => total + change.deletions, 0)
          })
        } else if (item.type === 'plan') {
          if (typeof item.text !== 'string' && !Array.isArray(item.plan)) {
            observeIgnored(scope, method, itemId, itemType, 'malformed_item')
            return
          }
          const steps = planSteps(item.plan)
          const initial = typeof item.text === 'string' ? item.text : ''
          const text = method === 'item/started' ? startText(scope, itemId, 'item/plan/delta', initial) : initial
          project({
            id: sanitizeSensitiveText(itemId),
            ...metadata,
            type: 'plan',
            status: itemStatus(method, item.status),
            text: sanitizeStreamingText(text),
            ...(steps.length > 0 ? { steps } : {})
          })
        } else if (item.type === 'mcpToolCall' || item.type === 'dynamicToolCall') {
          const name = item.type === 'mcpToolCall'
            ? (nonEmptyString(item.server) && nonEmptyString(item.tool) ? `${item.server}.${item.tool}` : null)
            : (nonEmptyString(item.tool) ? `${typeof item.namespace === 'string' && item.namespace.trim() ? `${item.namespace}.` : ''}${item.tool}` : null)
          if (!name) {
            observeIgnored(scope, method, itemId, itemType, 'malformed_item')
            return
          }
          project({
            id: sanitizeSensitiveText(itemId),
            ...metadata,
            type: 'tool',
            name: sanitizeSensitiveText(name),
            status: item.type === 'dynamicToolCall' && method === 'item/completed' && item.success === false
              ? 'failed'
              : itemStatus(method, item.status),
            durationMs: typeof item.durationMs === 'number' ? item.durationMs : null,
            output: toolOutput(item)
          })
        } else if (itemType !== 'reasoning') {
          observeIgnored(scope, method, itemId, itemType, itemType && recognizedItemTypes.has(itemType) ? 'malformed_item' : itemType ? 'unsupported_item_type' : 'malformed_item')
        }
        return
      }

      if (notification.method === 'error') {
        const error = record(notification.params.error)
        const message = typeof error?.message === 'string' ? error.message : typeof notification.params.message === 'string' ? notification.params.message : null
        if (!message) return
        const item: RuntimeErrorItem = { id: sanitizeSensitiveText(`error:${scope.runtimeLocator.turnId}:${errorCode(notification.params.code)}`), ...metadata, type: 'error', status: 'failed', error: sanitizeSensitiveText(message) }
        const identity = runtimeItemIdentity(item)
        if (completedItemsByExecution.get(scope.executionId)?.has(identity)) return
        update(scope, item)
        markCompleted(scope.executionId, identity)
        return
      }

      if (typeof notification.params.itemId !== 'string') return
      const itemId = notification.params.itemId
      const identity = scopedIdentity(scope, itemId)
      if (completedItemsByExecution.get(scope.executionId)?.has(identity)) return
      const current = itemsByExecution.get(scope.executionId)?.get(identity)
      if (notification.method === 'item/fileChange/patchUpdated') {
        const changes = fileChanges(notification.params.changes)
        const fingerprint = `${streamKey(scope, itemId, notification.method)}:${stableJson(changes)}`
        if (seenDeltas.has(fingerprint)) return
        seenDeltas.add(fingerprint)
        if (current?.type !== 'file_change') {
          pendingFileChanges.set(streamKey(scope, itemId, notification.method), changes)
          return
        }
        update(scope, {
          ...current,
          changes,
          additions: changes.reduce((total, change) => total + change.additions, 0),
          deletions: changes.reduce((total, change) => total + change.deletions, 0)
        })
        return
      }
      if (typeof notification.params.delta !== 'string') return
      if (!['item/agentMessage/delta', 'item/plan/delta', 'item/commandExecution/outputDelta'].includes(notification.method)) return
      // Text deltas have no event ID: equal payloads can be legitimate repeated text.
      // Lifecycle snapshots are idempotent; completion authoritatively reconciles text.
      if (!current) {
        const key = streamKey(scope, itemId, notification.method)
        pendingTextDeltas.set(key, (pendingTextDeltas.get(key) ?? '') + notification.params.delta)
        return
      }
      const textItem = (notification.method === 'item/agentMessage/delta' && (current.type === 'agent_message' || current.type === 'final_response')) ||
        (notification.method === 'item/plan/delta' && current.type === 'plan')
      const commandItem = notification.method === 'item/commandExecution/outputDelta' && current.type === 'command'
      if (!textItem && !commandItem) return
      const key = streamKey(scope, itemId, notification.method)
      const raw = (rawTextStreams.get(key) ?? '') + notification.params.delta
      rawTextStreams.set(key, raw)
      const safe = sanitizeStreamingText(raw)
      if (textItem && 'text' in current) update(scope, { ...current, text: safe })
      else if (current.type === 'command') update(scope, { ...current, output: safe })
    },
    handleRequest(request, scope) {
      if (request.params?.threadId !== scope.runtimeLocator.threadId || request.params?.turnId !== scope.runtimeLocator.turnId) return
      const itemId = nonEmptyString(request.params.itemId)
      const projectedId = itemId ? requestItemId(request, itemId) : null
      if (projectedId && completedItemsByExecution.get(scope.executionId)?.has(scopedIdentity(scope, projectedId))) return
      if (request.method !== 'item/tool/requestUserInput') {
        const kind = approvalKinds.get(request.method)
        if (!kind || !itemId) return
        const command = nonEmptyString(request.params.command)
        const reason = nonEmptyString(request.params.reason)
        update(scope, {
          id: sanitizeSensitiveText(projectedId!),
          ...projectionMetadata(scope),
          type: 'approval',
          status: 'in_progress',
          kind,
          summary: sanitizeSensitiveText(command ?? reason ?? request.method),
          decision: null
        })
        return
      }
      const questions = userInputQuestions(request.params.questions)
      if (!itemId || questions.length === 0) return
      update(scope, {
        id: sanitizeSensitiveText(projectedId!),
        ...projectionMetadata(scope),
        type: 'question',
        status: 'in_progress',
        questions,
        answers: {}
      })
    },
    completeRequest(request, response, scope) {
      const itemId = nonEmptyString(request.params?.itemId)
      if (!itemId) return
      const projectedId = requestItemId(request, itemId)
      const identity = scopedIdentity(scope, projectedId)
      if (completedItemsByExecution.get(scope.executionId)?.has(identity)) return
      const current = itemsByExecution.get(scope.executionId)?.get(identity)
      if (current?.type === 'approval') {
        const decision = approvalDecision(response)
        update(scope, { ...current, status: decision === 'decline' || decision === 'cancel' ? 'declined' : 'completed', decision })
        markCompleted(scope.executionId, identity)
        return
      }
      if (request.method !== 'item/tool/requestUserInput') return
      if (current?.type !== 'question') return
      const responseAnswers = record(response)?.answers
      const answerRecord = record(responseAnswers)
      const answers = Object.fromEntries(current.questions.map((question) => {
        const values = record(answerRecord?.[question.id])?.answers
        const safeValues = Array.isArray(values) ? values.flatMap((value) => typeof value === 'string'
          ? [question.isSecret ? '<redacted>' : sanitizeSensitiveText(value)]
          : []) : []
        return [question.id, safeValues]
      }))
      const item: RuntimeQuestionItem = { ...current, status: 'completed', answers }
      update(scope, item)
      markCompleted(scope.executionId, identity)
    },
    completeTurn(status, error, scope) {
      const planId = `plan:${scope.runtimeLocator.turnId}`
      const planIdentity = scopedIdentity(scope, planId)
      const plan = itemsByExecution.get(scope.executionId)?.get(planIdentity)
      if (plan?.type === 'plan' && !completedItemsByExecution.get(scope.executionId)?.has(planIdentity)) {
        update(scope, { ...plan, status: status === 'failed' ? 'failed' : 'completed' })
        markCompleted(scope.executionId, planIdentity)
      }
      if (status === 'interrupted') {
        projection.setInterrupt('completed', scope)
        return
      }
      if (status !== 'failed' || !error) return
      const itemId = `error:${scope.runtimeLocator.turnId}`
      const identity = scopedIdentity(scope, itemId)
      if (completedItemsByExecution.get(scope.executionId)?.has(identity)) return
      const item: RuntimeErrorItem = {
        id: sanitizeSensitiveText(itemId),
        ...projectionMetadata(scope),
        type: 'error',
        status: 'failed',
        error: sanitizeSensitiveText(error)
      }
      update(scope, item)
      markCompleted(scope.executionId, identity)
    },
    setInterrupt(status, scope) {
      const itemId = `interrupt:${scope.runtimeLocator.turnId}`
      const identity = scopedIdentity(scope, itemId)
      if (status === 'in_progress' && completedItemsByExecution.get(scope.executionId)?.has(identity)) return
      update(scope, {
        id: sanitizeSensitiveText(itemId),
        ...projectionMetadata(scope),
        type: 'interrupt',
        status
      })
      if (status === 'completed') markCompleted(scope.executionId, identity)
    },
    restore(history, scope) {
      const thread = record(record(history)?.thread)
      if (thread?.id !== scope.runtimeLocator.threadId || !Array.isArray(thread.turns)) return
      const turn = thread.turns.map(record).find((candidate) => candidate?.id === scope.runtimeLocator.turnId)
      if (!turn || !Array.isArray(turn.items)) return
      for (const item of turn.items) {
        const status = record(item)?.status
        const active = turn.status === 'inProgress' && status !== 'completed' && status !== 'failed' && status !== 'declined'
        projection.handle({
          method: active ? 'item/started' : 'item/completed',
          params: {
            threadId: scope.runtimeLocator.threadId,
            turnId: scope.runtimeLocator.turnId,
            item
          }
        }, scope)
      }
      const status = turn.status
      if (status === 'completed' || status === 'interrupted' || status === 'failed') {
        const error = record(turn.error)
        projection.completeTurn(status, typeof error?.message === 'string' ? error.message : null, scope)
      }
    },
    list(executionId) {
      return [...(itemsByExecution.get(executionId)?.values() ?? [])]
    },
    listIgnoredItems(executionId) {
      return [...(ignoredItemsByExecution.get(executionId)?.values() ?? [])]
    }
  }
  return projection
}
