import type {
  RuntimeProvider,
  RuntimeTestInput,
  RuntimeTestResult,
  RuntimeTestStatus
} from '../../shared/api'
import type { ProcessRunner } from './processRunner'

const DEFAULT_COMMANDS: Record<RuntimeProvider, string> = {
  claude_code_cli: 'claude',
  codex_cli: 'codex',
  gemini_cli: 'gemini',
  custom_cli: ''
}

function versionArgsFor(provider: RuntimeProvider): string[] {
  switch (provider) {
    case 'claude_code_cli':
    case 'codex_cli':
    case 'gemini_cli':
      return ['--version']
    case 'custom_cli':
      return []
  }
}

function connectivityProbeFor(
  provider: RuntimeProvider,
  defaultArgs: string[]
): { args: string[]; stdin?: string } | undefined {
  const prompt = 'Reply with exactly: OK'

  switch (provider) {
    case 'claude_code_cli':
      return {
        args: ['-p', prompt, ...withMissingOptions(defaultArgs, [['--output-format', 'text']])]
      }
    case 'codex_cli':
      return {
        args: ['exec', ...defaultArgs],
        stdin: prompt
      }
    case 'gemini_cli':
      return {
        args: ['-p', prompt, ...defaultArgs]
      }
    case 'custom_cli':
      return undefined
  }
}

function normalizeVersion(output: string): string | undefined {
  const firstLine = output
    .split('\n')
    .map((line) => line.trim())
    .find(Boolean)

  return firstLine
}

function normalizeError(output: string): string | undefined {
  return normalizeVersion(output)
}

function isAuthOrConnectivityError(result: { stdout: string; stderr: string }): boolean {
  const output = `${result.stdout}\n${result.stderr}`.toLowerCase()
  return [
    'auth',
    'api key',
    'apikey',
    'login',
    'unauthorized',
    'forbidden',
    'credential',
    'network',
    'timeout',
    'timed out',
    'connection',
    'econn',
    'enotfound'
  ].some((needle) => output.includes(needle))
}

function messageFor(status: RuntimeTestStatus, executablePath: string): string {
  switch (status) {
    case 'success':
      return 'Runtime command is available.'
    case 'command_not_found':
      return `Command not found: ${executablePath}`
    case 'startup_failed':
      return `Command started but exited with an error: ${executablePath}`
    case 'version_incompatible':
      return 'Runtime version is incompatible.'
    case 'auth_unavailable':
      return 'Runtime authentication is unavailable.'
    case 'unknown_error':
      return 'Runtime test failed.'
  }
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

export class RuntimeTester {
  constructor(private readonly processRunner: ProcessRunner) {}

  async test(input: RuntimeTestInput): Promise<RuntimeTestResult> {
    const provider = input.provider ?? 'custom_cli'
    const executablePath = input.executablePath || DEFAULT_COMMANDS[provider]
    const defaultArgs = input.defaultArgs ?? []
    const args = provider === 'custom_cli' ? defaultArgs : versionArgsFor(provider)
    const testedAt = new Date().toISOString()

    if (!executablePath) {
      return {
        status: 'command_not_found',
        message: 'Executable path is required.',
        installed: false,
        connected: false,
        authenticated: false,
        testedAt
      }
    }

    const result = await this.processRunner.run(executablePath, args, { timeoutMs: 5000 })

    if (result.error?.code === 'ENOENT') {
      return {
        status: 'command_not_found',
        message: messageFor('command_not_found', executablePath),
        installed: false,
        connected: false,
        authenticated: false,
        testedAt
      }
    }

    if (result.error) {
      return {
        status: 'unknown_error',
        message: result.error.message || messageFor('unknown_error', executablePath),
        installed: false,
        connected: false,
        authenticated: false,
        testedAt
      }
    }

    if (result.exitCode !== 0) {
      const message =
        normalizeVersion(result.stderr) ?? messageFor('startup_failed', executablePath)
      return {
        status: 'startup_failed',
        message,
        installed: true,
        connected: false,
        authenticated: false,
        testedAt
      }
    }

    const version = normalizeVersion(result.stdout) ?? normalizeVersion(result.stderr)
    const probe = connectivityProbeFor(provider, defaultArgs)
    let connectivityChecked = false

    if (probe) {
      const connectivityResult = await this.processRunner.run(executablePath, probe.args, {
        stdin: probe.stdin,
        timeoutMs: 15000
      })
      connectivityChecked = true

      if (connectivityResult.error) {
        return {
          status:
            connectivityResult.error.code === 'STOPPED' ||
            connectivityResult.error.code === 'ETIMEDOUT'
              ? 'auth_unavailable'
              : 'unknown_error',
          message:
            connectivityResult.error.message ||
            'Runtime command is available, but connectivity test failed.',
          version,
          installed: true,
          connected: false,
          authenticated: false,
          testedAt
        }
      }

      if (connectivityResult.exitCode !== 0) {
        const message =
          normalizeError(connectivityResult.stderr) ??
          normalizeError(connectivityResult.stdout) ??
          'Runtime command is available, but connectivity test failed.'

        return {
          status: isAuthOrConnectivityError(connectivityResult)
            ? 'auth_unavailable'
            : 'startup_failed',
          message,
          version,
          installed: true,
          connected: false,
          authenticated: false,
          testedAt
        }
      }
    }

    return {
      status: 'success',
      message: connectivityChecked
        ? version
          ? `Runtime command and connectivity are available: ${version}`
          : 'Runtime command and connectivity are available.'
        : version
          ? `Runtime command is available: ${version}`
          : messageFor('success', executablePath),
      version,
      installed: true,
      connected: connectivityChecked ? true : undefined,
      authenticated: true,
      testedAt
    }
  }
}
