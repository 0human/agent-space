import { spawn } from 'node:child_process'
import type { ChildProcessWithoutNullStreams } from 'node:child_process'

export interface ProcessRunResult {
  exitCode: number | null
  stdout: string
  stderr: string
  error?: NodeJS.ErrnoException
}

export interface ProcessRunOptions {
  timeoutMs?: number
  stdin?: string
  onStdoutChunk?: (chunk: string) => void
  onStderrChunk?: (chunk: string) => void
}

export interface RunningProcess {
  result: Promise<ProcessRunResult>
  stop: () => void
}

export interface ProcessRunner {
  start(command: string, args: string[], options?: ProcessRunOptions): RunningProcess
  run(command: string, args: string[], options?: ProcessRunOptions): Promise<ProcessRunResult>
}

export class NodeProcessRunner implements ProcessRunner {
  start(command: string, args: string[], options: ProcessRunOptions = {}): RunningProcess {
    const child = spawn(command, args, {
      shell: false,
      windowsHide: true
    })

    return createRunningProcess(child, options)
  }

  run(command: string, args: string[], options: ProcessRunOptions = {}): Promise<ProcessRunResult> {
    return this.start(command, args, options).result
  }
}

function createRunningProcess(
  child: ChildProcessWithoutNullStreams,
  options: ProcessRunOptions
): RunningProcess {
  const stdout: Buffer[] = []
  const stderr: Buffer[] = []
  let settled = false
  let stopRequested = false

  const result = new Promise<ProcessRunResult>((resolve) => {
    const timeout = setTimeout(() => {
      if (!settled) {
        stopRequested = true
        child.kill()
      }
    }, options.timeoutMs ?? 5000)

    child.stdout.on('data', (chunk: Buffer) => {
      stdout.push(chunk)
      options.onStdoutChunk?.(chunk.toString('utf8'))
    })

    child.stderr.on('data', (chunk: Buffer) => {
      stderr.push(chunk)
      options.onStderrChunk?.(chunk.toString('utf8'))
    })

    if (options.stdin !== undefined) {
      child.stdin.write(options.stdin)
      child.stdin.end()
    }

    child.on('error', (error: NodeJS.ErrnoException) => {
      if (settled) {
        return
      }

      settled = true
      clearTimeout(timeout)
      resolve({
        exitCode: null,
        stdout: Buffer.concat(stdout).toString('utf8'),
        stderr: Buffer.concat(stderr).toString('utf8'),
        error
      })
    })

    child.on('close', (exitCode) => {
      if (settled) {
        return
      }

      settled = true
      clearTimeout(timeout)
      resolve({
        exitCode,
        stdout: Buffer.concat(stdout).toString('utf8'),
        stderr: Buffer.concat(stderr).toString('utf8'),
        ...(stopRequested
          ? {
              error: Object.assign(new Error('Process stopped by user.'), {
                code: 'STOPPED'
              }) as NodeJS.ErrnoException
            }
          : {})
      })
    })
  })

  return {
    result,
    stop: () => {
      if (settled) {
        return
      }

      stopRequested = true
      child.kill()
    }
  }
}
