import { execFile as execFileCallback } from 'node:child_process'
import { access, constants } from 'node:fs/promises'
import { isAbsolute, relative, resolve } from 'node:path'
import { promisify } from 'node:util'

import type { PermissionPolicy, Project, ProjectReleaseStep, ReleaseOperation, ReleasePlatform } from '../shared/project'
import type { RuntimeEvent } from '../shared/workflow-run'

const execFile = promisify(execFileCallback)

export interface ReleaseManagerContext {
  project: Project
  workspacePath: string
  platform: ReleasePlatform
  operation: ReleaseOperation
  step: ProjectReleaseStep
  permissionPolicy: PermissionPolicy
}

export interface ReleaseManager {
  preflight: (context: ReleaseManagerContext) => Promise<{ checks: string[]; errors: string[] }>
  execute: (context: ReleaseManagerContext) => Promise<RuntimeEvent[]>
}

export function resolveProjectReleaseStep(project: Project, platform: ReleasePlatform, operation: ReleaseOperation): ProjectReleaseStep | null {
  const platforms = project.release?.platforms
  if (!platforms || typeof platforms !== 'object') return null
  const configured = platforms[platform]?.[operation]
  if (!configured || typeof configured !== 'object') return null
  return configured
}

function workingDirectory(context: ReleaseManagerContext): string {
  const candidate = context.step.cwd ? (isAbsolute(context.step.cwd) ? context.step.cwd : resolve(context.workspacePath, context.step.cwd)) : context.workspacePath
  const relativePath = relative(context.workspacePath, candidate)
  if (relativePath.startsWith('..') || isAbsolute(relativePath)) throw new Error('Release 命令 cwd 必须位于 Run Workspace 内。')
  return candidate
}

async function commandAvailable(command: string): Promise<boolean> {
  if (isAbsolute(command)) {
    try {
      await access(command, constants.X_OK)
      return true
    } catch {
      return false
    }
  }
  const lookup = process.platform === 'win32' ? 'where' : 'which'
  try {
    await execFile(lookup, [command])
    return true
  } catch {
    return false
  }
}

function platformName(platform: ReleasePlatform): string {
  return platform === 'darwin' ? 'macOS' : platform === 'win32' ? 'Windows' : 'Linux'
}

function transferNotice(context: ReleaseManagerContext): string | null {
  return `Data Transfer Notice：External Destination: ${context.step.targetEnvironment ?? context.project.release?.targetEnvironment ?? '当前 Release Workspace'}；操作：${context.operation}；数据：${context.step.dataTransfer ?? 'Release command output'}；权限：${context.step.requiredPermissions?.join(', ') || 'none'}；断网后从持久化 Release Artifact 恢复。`
}

export function createDefaultReleaseManager(): ReleaseManager {
  return {
    async preflight(context) {
      const checks: string[] = []
      const errors: string[] = []
      const target = context.step.targetEnvironment ?? context.project.release?.targetEnvironment ?? '当前 Release Workspace'
      checks.push(`Release 配置：${platformName(context.platform)} / ${context.operation}；命令：${context.step.kind === 'tool' ? [context.step.command ?? '', ...(context.step.args ?? [])].join(' ').trim() : 'Human Step'}；目标环境：${target}；权限：${context.step.requiredPermissions?.join(', ') || 'none'}。`)
      if (context.step.kind === 'human') {
        checks.push(`${platformName(context.platform)} 当前 ${context.operation} 使用 Human Step。`)
      } else if (!context.step.command?.trim()) {
        errors.push(`Release Preflight 失败：${platformName(context.platform)} 的 ${context.operation} Tool Step 缺少 command。`)
      } else if (await commandAvailable(context.step.command.trim())) {
        checks.push(`${platformName(context.platform)} ${context.operation} command 可用：${context.step.command.trim()}。`)
      } else {
        errors.push(`Release Preflight 失败：${platformName(context.platform)} 找不到 ${context.step.command.trim()}。`)
      }
      const missingPermissions = (context.step.requiredPermissions ?? []).filter((permission) => !context.permissionPolicy.grantedPermissions.includes(permission))
      if (missingPermissions.length > 0) errors.push(`Release Preflight 失败：${context.operation} 权限校验失败，缺少 ${missingPermissions.join(', ')}。`)
      const notice = transferNotice(context)
      if (notice) checks.push(notice)
      if (context.step.targetEnvironment ?? context.project.release?.targetEnvironment) checks.push(`Release 目标环境：${context.step.targetEnvironment ?? context.project.release?.targetEnvironment}。`)
      return { checks, errors }
    },

    async execute(context) {
      if (context.step.kind === 'human') {
        return [{ type: 'approval_required', approval: context.step.instructions ?? `请完成 ${context.operation} Human Step。` }]
      }
      const command = context.step.command?.trim()
      if (!command) return [{ type: 'error', error: `Release ${context.operation} command 缺失。` }]
      try {
        const cwd = workingDirectory(context)
        const result = await execFile(command, context.step.args ?? [], { cwd, windowsHide: true, env: process.env })
        const location = context.step.targetEnvironment ?? context.project.release?.targetEnvironment ?? cwd
        return [
          { type: 'tool_call', name: command, input: { args: context.step.args ?? [], cwd, operation: context.operation } },
          ...(result.stdout.trim() ? [{ type: 'text_delta' as const, text: result.stdout.trim() }] : []),
          { type: 'artifact_produced', artifact: { type: context.operation === 'validation' ? 'validation-report' : context.operation, name: context.operation, location, status: context.operation === 'validation' ? 'passed' : context.operation === 'release' ? 'published' : 'available' } },
          { type: 'status_changed', status: 'completed' }
        ]
      } catch (error) {
        return [{ type: 'error', error: `Release ${context.operation} 执行失败：${error instanceof Error ? error.message : String(error)}` }]
      }
    }
  }
}
