import type { PermissionPolicy } from '../shared/project'
import type { RuntimeAgentMessageItem, RuntimeCommandItem, RuntimeErrorItem, RuntimeFileChange, RuntimeItem, RuntimeItemStatus, RuntimeLocator } from '../shared/workflow-run'
import type { JsonRpcNotification } from './codex-app-server-transport'
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
    return step && status ? [{ step: sanitizeSensitiveText(step), status: sanitizeSensitiveText(status) }] : []
  })
}

export function createCodexItemProjection(dependencies: CodexItemProjectionDependencies = {}): CodexItemProjection {
  const itemsByExecution = new Map<string, Map<string, RuntimeItem>>()
  const ignoredItemsByExecution = new Map<string, Map<string, CodexIgnoredItem>>()
  const completedItemsByExecution = new Map<string, Set<string>>()
  const seenNotifications = new Set<string>()

  const update = (scope: CodexItemProjectionScope, item: RuntimeItem): void => {
    let executionItems = itemsByExecution.get(scope.executionId)
    if (!executionItems) {
      executionItems = new Map()
      itemsByExecution.set(scope.executionId, executionItems)
    }
    const previous = executionItems.get(item.id)
    if (previous && JSON.stringify(previous) === JSON.stringify(item)) return
    executionItems.set(item.id, item)

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
      runId: scope.runId,
      executionId: scope.executionId,
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

  return {
    handle(notification, scope) {
      if (notification.params?.threadId !== scope.runtimeLocator.threadId || notification.params?.turnId !== scope.runtimeLocator.turnId) return
      if (!notification.params) return
      const notificationKey = `${scope.executionId}:${stableJson(notification)}`
      if (seenNotifications.has(notificationKey)) return
      seenNotifications.add(notificationKey)

      const metadata = {
        runId: scope.runId,
        executionId: scope.executionId,
        provider: scope.runtimeLocator.runtimeProvider,
        source: scope.source,
        permissionPolicy: sanitizePermissionPolicy(scope.permissionPolicy),
        runtimeLocator: scope.runtimeLocator
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
        if (method === 'item/started' && completedItemsByExecution.get(scope.executionId)?.has(itemId)) return
        const project = (projected: RuntimeItem): void => {
          update(scope, projected)
          if (method !== 'item/completed') return
          let completed = completedItemsByExecution.get(scope.executionId)
          if (!completed) {
            completed = new Set()
            completedItemsByExecution.set(scope.executionId, completed)
          }
          completed.add(itemId)
        }
        if (item.type === 'agentMessage' && typeof item.text === 'string') {
          project({
            id: itemId,
            ...metadata,
            type: 'agent_message',
            status: method === 'item/completed' ? 'completed' : 'in_progress',
            text: sanitizeSensitiveText(item.text)
          })
        } else if (item.type === 'commandExecution' && typeof item.command === 'string') {
          project({
            id: itemId,
            ...metadata,
            type: 'command',
            status: itemStatus(method, item.status),
            command: sanitizeSensitiveText(item.command),
            output: typeof item.aggregatedOutput === 'string' ? sanitizeSensitiveText(item.aggregatedOutput) : '',
            exitCode: typeof item.exitCode === 'number' ? item.exitCode : null,
            durationMs: typeof item.durationMs === 'number' ? item.durationMs : null
          })
        } else if (item.type === 'fileChange') {
          if (!Array.isArray(item.changes)) {
            observeIgnored(scope, method, itemId, itemType, 'malformed_item')
            return
          }
          const changes = fileChanges(item.changes)
          project({
            id: itemId,
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
          project({
            id: itemId,
            ...metadata,
            type: 'plan',
            status: itemStatus(method, item.status),
            text: typeof item.text === 'string' ? sanitizeSensitiveText(item.text) : '',
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
            id: itemId,
            ...metadata,
            type: 'tool',
            name: sanitizeSensitiveText(name),
            status: itemStatus(method, item.status),
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
        const item: RuntimeErrorItem = { id: `error:${scope.runtimeLocator.turnId}:${errorCode(notification.params.code)}`, ...metadata, type: 'error', status: 'failed', error: sanitizeSensitiveText(message) }
        update(scope, item)
        return
      }

      if (typeof notification.params.itemId !== 'string' || typeof notification.params.delta !== 'string') return
      if (completedItemsByExecution.get(scope.executionId)?.has(notification.params.itemId)) return
      const current = itemsByExecution.get(scope.executionId)?.get(notification.params.itemId)
      if (notification.method === 'item/agentMessage/delta' && current?.type === 'agent_message') {
        const item: RuntimeAgentMessageItem = { ...current, text: sanitizeSensitiveText(current.text + notification.params.delta) }
        update(scope, item)
      } else if (notification.method === 'item/commandExecution/outputDelta' && current?.type === 'command') {
        const item: RuntimeCommandItem = { ...current, output: sanitizeSensitiveText(current.output + notification.params.delta) }
        update(scope, item)
      }
    },
    list(executionId) {
      return [...(itemsByExecution.get(executionId)?.values() ?? [])]
    },
    listIgnoredItems(executionId) {
      return [...(ignoredItemsByExecution.get(executionId)?.values() ?? [])]
    }
  }
}
