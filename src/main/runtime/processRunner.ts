import { spawn } from 'node:child_process'

export interface ProcessRunResult {
  exitCode: number | null
  stdout: string
  stderr: string
  error?: NodeJS.ErrnoException
}

export interface ProcessRunner {
  run(command: string, args: string[], options?: { timeoutMs?: number }): Promise<ProcessRunResult>
}

export class NodeProcessRunner implements ProcessRunner {
  run(
    command: string,
    args: string[],
    options: { timeoutMs?: number } = {}
  ): Promise<ProcessRunResult> {
    return new Promise((resolve) => {
      const child = spawn(command, args, {
        shell: false,
        windowsHide: true
      })
      const stdout: Buffer[] = []
      const stderr: Buffer[] = []
      let settled = false

      const timeout = setTimeout(() => {
        if (!settled) {
          child.kill()
        }
      }, options.timeoutMs ?? 5000)

      child.stdout?.on('data', (chunk: Buffer) => stdout.push(chunk))
      child.stderr?.on('data', (chunk: Buffer) => stderr.push(chunk))

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
          stderr: Buffer.concat(stderr).toString('utf8')
        })
      })
    })
  }
}
