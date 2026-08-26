import { spawn } from 'node:child_process'
import { createInterface } from 'node:readline'

export interface JsonRpcNotification {
  method: string
  params?: Record<string, unknown>
}

export interface CodexAppServerTransport {
  request(method: string, params: Record<string, unknown>): Promise<unknown>
  notify(method: string, params: Record<string, unknown>): Promise<void>
  nextNotification(): Promise<JsonRpcNotification | null>
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
  const notifications: JsonRpcNotification[] = []
  const notificationWaiters: Array<(notification: JsonRpcNotification | null) => void> = []
  let nextId = 1
  let closed = false
  let stderr = ''

  function finish(error?: Error): void {
    if (closed) return
    closed = true
    const failure = error ?? new Error(stderr.trim() || 'Codex App Server transport 已关闭。')
    for (const request of pending.values()) request.reject(failure)
    pending.clear()
    for (const resolve of notificationWaiters.splice(0)) resolve(null)
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
    if (typeof message.method !== 'string' || typeof message.id === 'number') return
    const notification = { method: message.method, ...(record(message.params) ? { params: record(message.params)! } : {}) }
    const waiter = notificationWaiters.shift()
    if (waiter) waiter(notification)
    else notifications.push(notification)
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
      const notification = notifications.shift()
      if (notification) return notification
      if (closed) return null
      return new Promise((resolve) => notificationWaiters.push(resolve))
    },
    async close() {
      lines.close()
      if (!child.stdin.destroyed) child.stdin.end()
      if (child.exitCode === null && !child.killed) child.kill()
      finish()
    }
  }
}
