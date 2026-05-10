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

function normalizeVersion(output: string): string | undefined {
  const firstLine = output
    .split('\n')
    .map((line) => line.trim())
    .find(Boolean)

  return firstLine
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

export class RuntimeTester {
  constructor(private readonly processRunner: ProcessRunner) {}

  async test(input: RuntimeTestInput): Promise<RuntimeTestResult> {
    const provider = input.provider ?? 'custom_cli'
    const executablePath = input.executablePath || DEFAULT_COMMANDS[provider]
    const args = provider === 'custom_cli' ? (input.defaultArgs ?? []) : versionArgsFor(provider)
    const testedAt = new Date().toISOString()

    if (!executablePath) {
      return {
        status: 'command_not_found',
        message: 'Executable path is required.',
        authenticated: false,
        testedAt
      }
    }

    const result = await this.processRunner.run(executablePath, args, { timeoutMs: 5000 })

    if (result.error?.code === 'ENOENT') {
      return {
        status: 'command_not_found',
        message: messageFor('command_not_found', executablePath),
        authenticated: false,
        testedAt
      }
    }

    if (result.error) {
      return {
        status: 'unknown_error',
        message: result.error.message || messageFor('unknown_error', executablePath),
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
        authenticated: false,
        testedAt
      }
    }

    const version = normalizeVersion(result.stdout) ?? normalizeVersion(result.stderr)

    return {
      status: 'success',
      message: version
        ? `Runtime command is available: ${version}`
        : messageFor('success', executablePath),
      version,
      authenticated: true,
      testedAt
    }
  }
}
