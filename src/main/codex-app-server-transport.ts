import { spawn } from 'node:child_process'
import { createInterface } from 'node:readline'

export interface JsonRpcNotification {
  method: string
  params?: Record<string, unknown>
}

export interface JsonRpcServerRequest extends JsonRpcNotification {
  id: number | string
}

export type CodexAppServerMessage = JsonRpcNotification | JsonRpcServerRequest

export interface CodexAppServerTransport {
  request(method: string, params: Record<string, unknown>): Promise<unknown>
  notify(method: string, params: Record<string, unknown>): Promise<void>
  nextNotification(): Promise<JsonRpcNotification | null>
  nextMessage?(): Promise<CodexAppServerMessage | null>
  nextRequest?(): Promise<JsonRpcServerRequest | null>
  respond?(id: number | string, result: unknown): Promise<void>
  close(): Promise<void>
}

interface StdioTransportOptions {
  command: string
  cwd: string
  env?: NodeJS.ProcessEnv
}

interface PendingRequest {
  resolve: (value: unknown) => void
  reject: (error: Error) => void
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

export function createStdioCodexAppServerTransport(options: StdioTransportOptions): CodexAppServerTransport {
  const child = spawn(options.command, ['app-server', '--stdio'], {
    cwd: options.cwd,
    env: options.env,
    stdio: ['pipe', 'pipe', 'pipe']
  })
  const pending = new Map<number, PendingRequest>()
  const messages: CodexAppServerMessage[] = []
  const messageWaiters: Array<(message: CodexAppServerMessage | null) => void> = []
  const notificationWaiters: Array<(notification: JsonRpcNotification | null) => void> = []
  const requestWaiters: Array<(request: JsonRpcServerRequest | null) => void> = []
  let nextId = 1
  let closed = false
  let stderr = ''

  function finish(error?: Error): void {
    if (closed) return
    closed = true
    const failure = error ?? new Error(stderr.trim() || 'Codex App Server transport 已关闭。')
    for (const request of pending.values()) request.reject(failure)
    pending.clear()
    for (const resolve of messageWaiters.splice(0)) resolve(null)
    for (const resolve of notificationWaiters.splice(0)) resolve(null)
    for (const resolve of requestWaiters.splice(0)) resolve(null)
  }

  child.stderr.setEncoding('utf8').on('data', (chunk: string) => { stderr += chunk })
  child.on('error', (error) => finish(error))
  child.on('close', (code) => finish(code === 0 ? undefined : new Error(stderr.trim() || `Codex App Server 退出码 ${String(code)}。`)))

  const lines = createInterface({ input: child.stdout })
  lines.on('line', (line) => {
    let message: Record<string, unknown> | null = null
    try {
      message = record(JSON.parse(line))
    } catch {
      return
    }
    if (!message) return
    if (typeof message.id === 'number' && !('method' in message)) {
      const request = pending.get(message.id)
      if (!request) return
      pending.delete(message.id)
      const error = record(message.error)
      if (error) request.reject(new Error(typeof error.message === 'string' ? error.message : 'Codex App Server request 失败。'))
      else request.resolve(message.result)
      return
    }
    if (typeof message.method !== 'string') return
    if (typeof message.id === 'number' || typeof message.id === 'string') {
      const request = { id: message.id, method: message.method, ...(record(message.params) ? { params: record(message.params)! } : {}) }
      const requestWaiter = requestWaiters.shift()
      if (requestWaiter) requestWaiter(request)
      else {
        const waiter = messageWaiters.shift()
        if (waiter) waiter(request)
        else messages.push(request)
      }
      return
    }
    const notification = { method: message.method, ...(record(message.params) ? { params: record(message.params)! } : {}) }
    const waiter = messageWaiters.shift()
    if (waiter) waiter(notification)
    else {
      const notificationWaiter = notificationWaiters.shift()
      if (notificationWaiter) notificationWaiter(notification)
      else messages.push(notification)
    }
  })

  return {
    request(method, params) {
      if (closed) return Promise.reject(new Error(stderr.trim() || 'Codex App Server transport 已关闭。'))
      const id = nextId++
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject })
        child.stdin.write(`${JSON.stringify({ method, id, params })}\n`, (error) => {
          if (!error) return
          pending.delete(id)
          reject(error)
        })
      })
    },
    async notify(method, params) {
      if (closed) throw new Error(stderr.trim() || 'Codex App Server transport 已关闭。')
      await new Promise<void>((resolve, reject) => {
        child.stdin.write(`${JSON.stringify({ method, params })}\n`, (error) => error ? reject(error) : resolve())
      })
    },
    async nextNotification() {
      const index = messages.findIndex((message): message is JsonRpcNotification => !('id' in message))
      if (index >= 0) return messages.splice(index, 1)[0] as JsonRpcNotification
      if (closed) return null
      return new Promise((resolve) => notificationWaiters.push(resolve))
    },
    async nextMessage() {
      const message = messages.shift()
      if (message) return message
      if (closed) return null
      return new Promise((resolve) => messageWaiters.push(resolve))
    },
    async nextRequest() {
      const index = messages.findIndex((message): message is JsonRpcServerRequest => 'id' in message)
      if (index >= 0) return messages.splice(index, 1)[0] as JsonRpcServerRequest
      if (closed) return null
      return new Promise((resolve) => requestWaiters.push(resolve))
    },
    async respond(id, result) {
      if (closed) throw new Error(stderr.trim() || 'Codex App Server transport 已关闭。')
      await new Promise<void>((resolve, reject) => {
        child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, result })}\n`, (error) => error ? reject(error) : resolve())
      })
    },
    async close() {
      lines.close()
      if (!child.stdin.destroyed) child.stdin.end()
      if (child.exitCode === null && !child.killed) child.kill()
      finish()
    }
  }
}
