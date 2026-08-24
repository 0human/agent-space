import { spawn } from 'node:child_process'
import { constants } from 'node:fs'
import { access, chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, delimiter, join, normalize, relative, resolve } from 'node:path'

import type { AgentRuntimeAdapter, RuntimeArtifact, RuntimeEvent, RuntimeExecutionContext, RuntimePreflightContext, RuntimePreflightResult } from '../shared/workflow-run'
import type { SkillManifest } from '../shared/workflow'
import { isCommandAllowed, isNetworkHostAllowed, isPathAllowed } from './permission-policy'

interface CodexJsonlResult {
  sessionId?: string
  events: RuntimeEvent[]
}

interface ProcessResult {
  stdout: string
  stderr: string
  code: number | null
}

interface ProcessOptions {
  cwd: string
  env?: NodeJS.ProcessEnv
}

interface CodexRuntimeDependencies {
  command?: string
  runProcess?: (command: string, args: string[], options: ProcessOptions) => Promise<ProcessResult>
  skillManifests?: SkillManifest[]
  getSkillManifests?: () => SkillManifest[]
  skillPackagePath?: string
  resolveSkillPackagePath?: (manifest: SkillManifest) => string | null
  readSkill?: (path: string, encoding: 'utf8') => Promise<string>
}

const QUESTION_PREFIX = 'QUESTION:'
const APPROVAL_PREFIX = 'APPROVAL_REQUIRED:'
const ARTIFACT_PREFIX = 'ARTIFACT:'
const VERIFICATION_ARTIFACT_TYPES = ['check-result', 'test-result', 'review-report', 'commit'] as const

const GIT_GUARD_SCRIPT = String.raw`#!/usr/bin/env node
const { spawnSync } = require('node:child_process')

const args = process.argv.slice(2)
const realGit = __AGENT_SPACE_REAL_GIT__
const originalPath = __AGENT_SPACE_ORIGINAL_PATH__
const defaultBranch = String(__AGENT_SPACE_DEFAULT_BRANCH__).replace(/^refs\/heads\//i, '')
const networkGithub = __AGENT_SPACE_NETWORK_GITHUB__

function reject(reason) {
  process.stderr.write('Permission Policy 阻止 ' + reason + '\n')
  process.exit(126)
}

function refDestination(value) {
  const refspec = value.replace(/^\+/, '')
  const separator = refspec.lastIndexOf(':')
  const destination = separator >= 0 ? refspec.slice(separator + 1) : refspec
  return destination.replace(/^refs\/heads\//, '')
}

function isDefaultBranch(value) {
  if (!defaultBranch || !value || value === '--') return false
  const destination = refDestination(value)
  const current = String(spawnSync(realGit, ['symbolic-ref', '--quiet', '--short', 'HEAD'], { encoding: 'utf8', env: { ...process.env, PATH: originalPath } }).stdout || '').trim()
  return destination === defaultBranch || destination === '' || (destination === 'HEAD' && current === defaultBranch)
}

if (!realGit) reject('Git 操作：无法定位 git 可执行文件。')

const pushIndex = args.findIndex((arg) => arg === 'push')
if (pushIndex >= 0) {
  const pushArgs = args.slice(pushIndex + 1)
  const force = pushArgs.some((arg) => arg.startsWith('+') || arg === '-f' || arg.startsWith('-f') && !arg.startsWith('--') || arg === '--force' || arg.startsWith('--force=') || arg.startsWith('--force-with-lease'))
  if (force) reject('force push。')
  if (pushArgs.includes('--all') || pushArgs.includes('--mirror')) reject('可能更新默认分支的批量 push。')
  if (!defaultBranch) reject('默认分支未知，无法验证 push 目标。')

  const remotesResult = spawnSync(realGit, ['remote'], { encoding: 'utf8', env: { ...process.env, PATH: originalPath } })
  const remotes = String(remotesResult.stdout || '').split(/\r?\n/).map((value) => value.trim()).filter(Boolean)
  const values = pushArgs.filter((arg) => arg !== '--' && !arg.startsWith('-'))
  const first = values[0]
  const refspecs = first && (remotes.includes(first) || first.includes('://') || first.includes('@') || first.endsWith('.git'))
    ? values.slice(1)
    : values
  if (refspecs.length === 0) {
    const branch = spawnSync(realGit, ['symbolic-ref', '--quiet', '--short', 'HEAD'], { encoding: 'utf8', env: { ...process.env, PATH: originalPath } })
    if (isDefaultBranch(String(branch.stdout || '').trim())) reject('直接更新默认分支。')
  } else if (refspecs.some(isDefaultBranch)) {
    reject('直接更新默认分支。')
  }
  if (!networkGithub) reject('network.github 权限。')
}

const child = spawnSync(realGit, args, { stdio: 'inherit', env: { ...process.env, PATH: originalPath } })
if (child.error) {
  process.stderr.write(String(child.error.message || child.error) + '\n')
  process.exit(1)
}
process.exit(child.status === null ? 1 : child.status)
`

const GITHUB_GUARD_SCRIPT = String.raw`#!/usr/bin/env node
const { spawnSync } = require('node:child_process')

const args = process.argv.slice(2)
const realGh = __AGENT_SPACE_REAL_GH__
const originalPath = __AGENT_SPACE_ORIGINAL_PATH__
const defaultBranch = String(__AGENT_SPACE_DEFAULT_BRANCH__).replace(/^refs\/heads\//i, '')
const networkGithub = __AGENT_SPACE_NETWORK_GITHUB__

function reject(reason) {
  process.stderr.write('Permission Policy 阻止 ' + reason + '\n')
  process.exit(126)
}

if (!realGh) reject('GitHub 操作：无法定位 gh 可执行文件。')
if (!networkGithub) reject('network.github 权限。')

const pullRequestIndex = args.findIndex((arg) => arg === 'pr')
const apiIndex = args.findIndex((arg) => arg === 'api')
const apiArgs = apiIndex >= 0 ? args.slice(apiIndex + 1) : []
const apiMethodIndex = apiArgs.findIndex((arg) => /^(?:-X|--method)$/.test(arg))
const apiMethod = apiMethodIndex >= 0 ? (apiArgs[apiMethodIndex + 1] || '').toUpperCase() : ''
const apiTarget = apiArgs.map((arg) => { try { return decodeURIComponent(arg) } catch { return arg } }).join(' ').toLowerCase()
const apiMutatesDefaultBranch = Boolean(defaultBranch && apiTarget.includes('/git/refs/heads/' + defaultBranch.toLowerCase()) && (apiMethod ? apiMethod !== 'GET' : apiArgs.some((arg) => /^-[fF](?:$|=)/.test(arg))))
const isPullRequestMutation = pullRequestIndex >= 0 && ['create', 'edit', 'merge'].includes(args[pullRequestIndex + 1])
const isMergeApi = apiIndex >= 0 && (
  apiArgs.some((arg) => /\/merge(?:\?|$)/i.test(arg)) ||
  (apiArgs[0] === 'graphql' && apiArgs.some((arg) => /mergePullRequest|enablePullRequestAutoMerge|mutation/i.test(arg))) ||
  (apiArgs.some((arg) => /^(?:-X|--method)$/.test(arg)) && apiArgs.some((arg) => /(?:^|\/)pulls(?:\/|$)/i.test(arg))) ||
  apiMutatesDefaultBranch
)
if (isPullRequestMutation || isMergeApi) reject('绕过 Merge Gate 的 GitHub Pull Request 操作。')
if (!networkGithub) reject('network.github 权限。')

const child = spawnSync(realGh, args, { stdio: 'inherit', env: { ...process.env, PATH: originalPath } })
if (child.error) {
  process.stderr.write(String(child.error.message || child.error) + '\n')
  process.exit(1)
}
process.exit(child.status === null ? 1 : child.status)
`

export function sanitizeSensitiveText(value: string): string {
  return value
    .replace(/(https?:\/\/)([^/@\s]+)@/gi, '$1<redacted>@')
    .replace(/(bearer\s+)[A-Za-z0-9._~+\/-]+/gi, '$1<redacted>')
    .replace(/((?:token|secret|password|authorization)[=:]\s*)[^\s,;]+/gi, '$1<redacted>')
}

function isNetworkFailure(value: string): boolean {
  return /(?:network|offline|enotfound|eai_again|timeout|timed out|connection reset|connection refused|could not resolve)/i.test(value)
}

function skillDependencyReference(value: string): { name: string; version?: string } {
  const separator = value.lastIndexOf('@')
  return separator > 0 ? { name: value.slice(0, separator), version: value.slice(separator + 1) } : { name: value }
}

function parseJsonLine(line: string): Record<string, unknown> | null {
  try {
    const value: unknown = JSON.parse(line)
    return value && typeof value === 'object' ? value as Record<string, unknown> : null
  } catch {
    return null
  }
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null
}

function isDiscoveryArtifact(artifact: RuntimeArtifact): boolean {
  const location = artifact.location ? normalize(artifact.location).replaceAll('\\', '/') : ''
  const name = basename(location || artifact.name).toLowerCase()
  return name === 'context.md' || (location.toLowerCase().includes('/docs/adr/') && location.toLowerCase().endsWith('.md'))
}

function isPublishedWorkflowArtifact(artifact: RuntimeArtifact): boolean {
  return ['specification', 'ticket', 'tickets', 'decision-record'].includes(artifact.type) && /^https:\/\/github\.com\//i.test(artifact.location ?? '')
}

function isVerificationArtifact(artifact: RuntimeArtifact): boolean {
  return VERIFICATION_ARTIFACT_TYPES.includes(artifact.type as typeof VERIFICATION_ARTIFACT_TYPES[number])
}

function isArtifactInsideWorkspace(artifact: RuntimeArtifact, workspacePath: string): boolean {
  if (isPublishedWorkflowArtifact(artifact)) return true
  if (!artifact.location) return false
  const workspace = resolve(workspacePath)
  const location = resolve(artifact.location)
  const relativeLocation = relative(workspace, location).replaceAll('\\', '/')
  if (relativeLocation.startsWith('../') || relativeLocation === '..' || relativeLocation.startsWith('/')) return false
  if (relativeLocation === 'CONTEXT.md' || (relativeLocation.startsWith('docs/adr/') && relativeLocation.endsWith('.md'))) return true
  return isVerificationArtifact(artifact) && !relativeLocation.startsWith('../')
}

function parseAgentMessage(text: string, sessionId?: string): RuntimeEvent {
  if (text.startsWith(QUESTION_PREFIX)) return { type: 'question', question: text.slice(QUESTION_PREFIX.length).trim(), ...(sessionId ? { sessionId } : {}) }
  if (text.startsWith(APPROVAL_PREFIX)) return { type: 'approval_required', approval: text.slice(APPROVAL_PREFIX.length).trim(), ...(sessionId ? { sessionId } : {}) }
  if (text.startsWith(ARTIFACT_PREFIX)) {
    try {
      const artifact = JSON.parse(text.slice(ARTIFACT_PREFIX.length).trim()) as RuntimeArtifact
      if (artifact && typeof artifact === 'object' && typeof artifact.name === 'string' && typeof artifact.type === 'string' && (isDiscoveryArtifact(artifact) || isPublishedWorkflowArtifact(artifact) || isVerificationArtifact(artifact))) {
        return { type: 'artifact_produced', artifact, ...(sessionId ? { sessionId } : {}) }
      }
    } catch {
      return { type: 'text_delta', text, ...(sessionId ? { sessionId } : {}) }
    }
  }
  return { type: 'text_delta', text, ...(sessionId ? { sessionId } : {}) }
}

export function parseCodexJsonl(output: string): CodexJsonlResult {
  let sessionId: string | undefined
  const events: RuntimeEvent[] = []
  let completed = false
  for (const line of output.split(/\r?\n/).map((value) => value.trim()).filter(Boolean)) {
    const record = parseJsonLine(line)
    if (!record) continue
    const type = asString(record.type)
    if (type === 'thread.started') {
      sessionId = asString(record.thread_id) ?? undefined
      continue
    }
    if (type === 'turn.completed') {
      completed = true
      continue
    }
    if (type === 'error') {
      events.push({ type: 'error', error: asString(record.message) ?? 'Codex Runtime 返回未知错误。', ...(sessionId ? { sessionId } : {}) })
      continue
    }
    if (type !== 'item.completed' || !record.item || typeof record.item !== 'object') continue
    const item = record.item as Record<string, unknown>
    const itemType = asString(item.type)
    if (itemType === 'agent_message') {
      const text = asString(item.text)
      if (text) events.push(parseAgentMessage(text, sessionId))
    } else if (itemType === 'command_execution') {
      const command = asString(item.command)
      if (command) events.push({ type: 'tool_call', name: command, input: typeof item.status === 'string' ? { status: item.status } : {}, ...(sessionId ? { sessionId } : {}) })
    }
  }
  if (completed && !events.some((event) => event.type === 'error' || event.type === 'question' || event.type === 'approval_required')) {
    events.push({ type: 'status_changed', status: 'completed', ...(sessionId ? { sessionId } : {}) })
  }
  return { sessionId, events }
}

function defaultRunProcess(command: string, args: string[], options: ProcessOptions): Promise<ProcessResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: options.cwd, env: options.env, stdio: ['pipe', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    child.stdout.setEncoding('utf8').on('data', (chunk: string) => { stdout += chunk })
    child.stderr.setEncoding('utf8').on('data', (chunk: string) => { stderr += chunk })
    child.stdin.end()
    child.on('error', reject)
    child.on('close', (code) => resolve({ stdout, stderr, code }))
  })
}

async function findExecutable(name: string, pathValue: string): Promise<string | null> {
  for (const directory of pathValue.split(delimiter).filter(Boolean)) {
    const candidates = process.platform === 'win32'
      ? [join(directory, name), join(directory, `${name}.exe`), join(directory, `${name}.cmd`)]
      : [join(directory, name)]
    for (const candidate of candidates) {
      try {
        await access(candidate, constants.X_OK)
        return candidate
      } catch {
        // Keep looking through PATH entries.
      }
    }
  }
  return null
}

interface GitGuard {
  env: NodeJS.ProcessEnv
  cleanup: () => Promise<void>
}

interface GuardScriptValues {
  realGit?: string
  realGh?: string
  originalPath: string
  defaultBranch: string | null | undefined
  networkGithub: boolean
}

function renderGuardScript(template: string, values: GuardScriptValues): string {
  return template
    .replace('__AGENT_SPACE_REAL_GIT__', JSON.stringify(values.realGit ?? null))
    .replace('__AGENT_SPACE_REAL_GH__', JSON.stringify(values.realGh ?? null))
    .replace('__AGENT_SPACE_ORIGINAL_PATH__', JSON.stringify(values.originalPath))
    .replace('__AGENT_SPACE_DEFAULT_BRANCH__', JSON.stringify(values.defaultBranch ?? ''))
    .replace('__AGENT_SPACE_NETWORK_GITHUB__', JSON.stringify(values.networkGithub))
}

async function createGitGuard(defaultBranch: string | null | undefined, networkGithub: boolean): Promise<GitGuard> {
  const originalPath = process.env.PATH ?? ''
  const gitExecutable = await findExecutable('git', originalPath)
  if (!gitExecutable) throw new Error('Permission Policy 无法建立 Git guard：找不到 git 可执行文件。')
  const ghExecutable = await findExecutable('gh', originalPath)
  const directory = await mkdtemp(join(tmpdir(), 'agent-space-git-guard-'))
  try {
    const scriptPath = join(directory, 'git-guard.js')
    await writeFile(scriptPath, renderGuardScript(GIT_GUARD_SCRIPT, { realGit: gitExecutable, originalPath, defaultBranch, networkGithub }), { encoding: 'utf8' })
    await chmod(scriptPath, 0o755)
    if (process.platform === 'win32') {
      await writeFile(join(directory, 'git.cmd'), `@"${process.execPath.replace(/"/g, '""')}" "%~dp0git-guard.js" %*\r\n`, { encoding: 'utf8' })
    } else {
      await writeFile(join(directory, 'git'), `#!/bin/sh\nexec "${process.execPath.replace(/"/g, '\\"')}" "${scriptPath.replace(/"/g, '\\"')}" "$@"\n`, { encoding: 'utf8' })
      await chmod(join(directory, 'git'), 0o755)
    }
    if (ghExecutable) {
      const ghScriptPath = join(directory, 'gh-guard.js')
      await writeFile(ghScriptPath, renderGuardScript(GITHUB_GUARD_SCRIPT, { realGh: ghExecutable, originalPath, defaultBranch, networkGithub }), { encoding: 'utf8' })
      await chmod(ghScriptPath, 0o755)
      if (process.platform === 'win32') {
        await writeFile(join(directory, 'gh.cmd'), `@"${process.execPath.replace(/"/g, '""')}" "%~dp0gh-guard.js" %*\r\n`, { encoding: 'utf8' })
      } else {
        await writeFile(join(directory, 'gh'), `#!/bin/sh\nexec "${process.execPath.replace(/"/g, '\\"')}" "${ghScriptPath.replace(/"/g, '\\"')}" "$@"\n`, { encoding: 'utf8' })
        await chmod(join(directory, 'gh'), 0o755)
      }
    }
    return {
      env: {
        ...process.env,
        PATH: `${directory}${delimiter}${originalPath}`,
        AGENT_SPACE_GIT_EXECUTABLE: gitExecutable,
        ...(ghExecutable ? { AGENT_SPACE_GH_EXECUTABLE: ghExecutable } : {}),
        AGENT_SPACE_GIT_ORIGINAL_PATH: originalPath,
        AGENT_SPACE_DEFAULT_BRANCH: defaultBranch ?? ''
      },
      cleanup: () => rm(directory, { recursive: true, force: true })
    }
  } catch (error) {
    await rm(directory, { recursive: true, force: true }).catch(() => undefined)
    throw error
  }
}

function promptFor(context: RuntimeExecutionContext, skillInstructions: string): string {
  return [
    `执行固定 Skill ${context.skill?.name ?? 'unknown'}@${context.skill?.version ?? 'unknown'}。`,
    '这是一次可恢复的 Workflow Phase 执行。只使用下面提供的上下文和输入，不要创建隐藏的 Workflow 状态。',
    `Workflow Run ID: ${context.runId}（所有 GitHub spec、ticket、Decision Record 和 URL 必须在正文或 Artifact 元数据中关联此 Run ID。）`,
    `Idea: ${context.idea}`,
    `Phase: ${context.workflow.phases[context.phaseIndex]?.id ?? 'unknown'}`,
    `Workspace: ${context.workspace.path}`,
    `Phase Context: ${context.phaseContext?.content ?? '(empty)'}`,
    `Input Artifacts: ${JSON.stringify(context.inputArtifacts)}`,
    `Decision Records: ${JSON.stringify(context.decisionRecords)}`,
    `Permission Policy: ${JSON.stringify(context.permissionPolicy)}`,
    'Permission Policy hard rules: never run git push --force/--force-with-lease, never push to the Project default branch, never merge or publish a Pull Request; GitHub delivery and merge are Tool Steps controlled by the Workflow Engine and Merge Gate.',
    'Fixed Skill instructions:',
    skillInstructions,
    '需要用户回答时，最后一条消息必须以 QUESTION: 开头；需要审批时以 APPROVAL_REQUIRED: 开头。',
    '确认写入 CONTEXT.md 或 docs/adr/*.md，或已获批准发布 GitHub spec/ticket 后，输出 ARTIFACT: 后跟 JSON 对象。GitHub URL 仅允许 https://github.com/；普通聊天、日志和临时文件不要标记为 Artifact。implement 和 code-review 完成时必须将 typecheck、相关测试、全量测试和 review 结果写入 Workspace，并分别输出 type 为 check-result、test-result、review-report 的 Artifact。code-review 发现问题时必须先在当前 Workspace 修复，再重新运行相关检查和 review，直到结果通过后才报告 completed。'
  ].join('\n')
}

function forbiddenGitCommand(command: string, defaultBranch: string | null | undefined, networkGithub = true): string | null {
  const tokens = command.match(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\S+/g)?.map((token) => token.replace(/^("|')|("|')$/g, '')) ?? []
  const pushIndex = tokens.findIndex((token) => token === 'push')
  if (pushIndex < 0 || !tokens.slice(0, pushIndex).some((token) => token === 'git' || token.endsWith('/git') || token.endsWith('\\git'))) return null
  const pushArgs = tokens.slice(pushIndex + 1)
  if (pushArgs.some((arg) => arg.startsWith('+') || arg === '-f' || arg.startsWith('-f') && !arg.startsWith('--') || arg === '--force' || arg.startsWith('--force=') || arg.startsWith('--force-with-lease'))) return 'Permission Policy 阻止 force push。'
  if (pushArgs.includes('--all') || pushArgs.includes('--mirror')) return 'Permission Policy 阻止可能更新默认分支的批量 push。'
  const normalizedDefaultBranch = defaultBranch?.trim().replace(/^refs\/heads\//i, '')
  if (!normalizedDefaultBranch) return 'Permission Policy 阻止 push：默认分支未知，无法验证目标。'
  const destinations = pushArgs
    .filter((arg) => arg !== '--' && !arg.startsWith('-'))
    .map((arg) => arg.replace(/^\+/, '').split(':').at(-1)?.replace(/^refs\/heads\//i, '') ?? '')
  if (destinations.some((destination) => destination === normalizedDefaultBranch || destination === '')) return 'Permission Policy 阻止直接更新默认分支。'
  if (!networkGithub) return 'Permission Policy 阻止 push：缺少 network.github 权限。'
  return null
}

function forbiddenGitHubCommand(command: string, defaultBranch: string | null | undefined, networkGithub = true): string | null {
  const tokens = command.match(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\S+/g)?.map((token) => token.replace(/^("|')|("|')$/g, '')) ?? []
  const ghIndex = tokens.findIndex((token) => token === 'gh' || token.endsWith('/gh') || token.endsWith('\\gh'))
  if (ghIndex < 0) return null
  const args = tokens.slice(ghIndex + 1)
  const pullRequestIndex = args.findIndex((arg) => arg === 'pr')
  const apiIndex = args.findIndex((arg) => arg === 'api')
  const apiArgs = apiIndex >= 0 ? args.slice(apiIndex + 1) : []
  const isPullRequestMutation = pullRequestIndex >= 0 && ['create', 'edit', 'merge'].includes(args[pullRequestIndex + 1] ?? '')
  const normalizedDefaultBranch = defaultBranch?.trim().replace(/^refs\/heads\//i, '')
  const apiMethodIndex = apiArgs.findIndex((arg) => /^(?:-X|--method)$/.test(arg))
  const apiMethod = apiMethodIndex >= 0 ? (apiArgs[apiMethodIndex + 1] || '').toUpperCase() : ''
  const apiTarget = apiArgs.map((arg) => { try { return decodeURIComponent(arg) } catch { return arg } }).join(' ').toLowerCase()
  const apiMutatesDefaultBranch = Boolean(normalizedDefaultBranch && apiTarget.includes('/git/refs/heads/' + normalizedDefaultBranch.toLowerCase()) && (apiMethod ? apiMethod !== 'GET' : apiArgs.some((arg) => /^-[fF](?:$|=)/.test(arg))))
  const isMergeApi = apiIndex >= 0 && (
    apiArgs.some((arg) => /\/merge(?:\?|$)/i.test(arg)) ||
    (apiArgs[0] === 'graphql' && apiArgs.some((arg) => /mergePullRequest|enablePullRequestAutoMerge|mutation/i.test(arg))) ||
    (apiArgs.some((arg) => /^(?:-X|--method)$/.test(arg)) && apiArgs.some((arg) => /(?:^|\/)pulls(?:\/|$)/i.test(arg))) ||
    apiMutatesDefaultBranch
  )
  if (isPullRequestMutation || isMergeApi) return 'Permission Policy 阻止绕过 Merge Gate 的 GitHub Pull Request 操作。'
  return networkGithub ? null : 'Permission Policy 阻止 GitHub 操作：缺少 network.github 权限。'
}

function forbiddenScopedCommand(command: string, context: RuntimeExecutionContext): string | null {
  if (!isCommandAllowed(command.trim().split(/\s+/, 1)[0]?.split(/[\\/]/).at(-1) ?? '', context.permissionPolicy.allowedCommands)) return 'Permission Policy 阻止执行未允许的 command。'
  if (!isPathAllowed(context.workspace.path, context.permissionPolicy.allowedPaths)) return 'Permission Policy 阻止访问未允许的 Workspace 目录。'
  if (context.permissionPolicy.allowedNetworkHosts?.length) {
    for (const value of command.match(/https?:\/\/[^\s'"`]+/gi) ?? []) {
      try {
        if (!isNetworkHostAllowed(new URL(value).hostname, context.permissionPolicy.allowedNetworkHosts)) return 'Permission Policy 阻止访问未允许的网络目标。'
      } catch {
        return 'Permission Policy 阻止访问无效的网络目标。'
      }
    }
  }
  return null
}

export function createCodexRuntimeAdapter(dependencies: CodexRuntimeDependencies = {}): AgentRuntimeAdapter {
  const runProcess = dependencies.runProcess ?? defaultRunProcess
  const command = dependencies.command ?? 'codex'
  const getManifests = dependencies.getSkillManifests ?? (() => dependencies.skillManifests ?? [])
  const readSkill = dependencies.readSkill ?? ((path: string, encoding: 'utf8') => readFile(path, encoding))

  async function loadSkillInstructions(manifest: SkillManifest, packagePath: string, visited = new Set<string>()): Promise<string> {
    const key = `${manifest.name}@${manifest.version}`
    if (visited.has(key)) return ''
    visited.add(key)
    const own = await readSkill(join(packagePath, manifest.entry), 'utf8')
    const dependenciesText: string[] = []
    for (const dependency of manifest.dependencies) {
      const reference = skillDependencyReference(dependency)
      const candidates = getManifests().filter((candidate) => candidate.name === reference.name)
      const dependencyManifest = reference.version
        ? candidates.find((candidate) => candidate.version === reference.version)
        : candidates.length === 1 ? candidates[0] : undefined
      if (!dependencyManifest) throw new Error(`固定 Skill 依赖 ${dependency} 不可用。`)
      const dependencyPackagePath = dependencies.resolveSkillPackagePath?.(dependencyManifest) ?? packagePath
      dependenciesText.push(await loadSkillInstructions(dependencyManifest, dependencyPackagePath, visited))
    }
    return [own, ...dependenciesText].filter(Boolean).join('\n\n')
  }

  function enrichEvents(events: RuntimeEvent[], context: RuntimeExecutionContext): RuntimeEvent[] {
    const networkGithub = context.permissionPolicy.grantedPermissions.includes('network.github')
    const forbidden = events.find((event) => event.type === 'tool_call' ? forbiddenScopedCommand(event.name, context) ?? forbiddenGitCommand(event.name, context.project.defaultBranch, networkGithub) ?? forbiddenGitHubCommand(event.name, context.project.defaultBranch, networkGithub) : null)
    if (forbidden && forbidden.type === 'tool_call') return [{ type: 'error', error: forbiddenScopedCommand(forbidden.name, context) ?? forbiddenGitCommand(forbidden.name, context.project.defaultBranch, networkGithub) ?? forbiddenGitHubCommand(forbidden.name, context.project.defaultBranch, networkGithub) ?? 'Permission Policy 阻止 Git 操作。', provider: 'codex', source: 'permission-policy', permissionPolicy: context.permissionPolicy }]
    return events.filter((event) => event.type !== 'artifact_produced' || isArtifactInsideWorkspace(event.artifact, context.workspace.path)).map((event) => ({
      ...event,
      ...(event.type === 'artifact_produced' && isPublishedWorkflowArtifact(event.artifact) ? { artifact: { ...event.artifact, runId: context.runId } } : {}),
      ...(event.type === 'error' ? { error: sanitizeSensitiveText(event.error) } : event.type === 'text_delta' ? { text: sanitizeSensitiveText(event.text) } : {}),
      provider: 'codex',
      source: 'codex exec --json',
      permissionPolicy: context.permissionPolicy
    }))
  }

  return {
    async preflight(context: RuntimePreflightContext): Promise<RuntimePreflightResult> {
      const checks: string[] = []
      const errors: string[] = []
      try {
        const version = await runProcess(command, ['--version'], { cwd: context.workspace.path })
        if (version.code === 0) checks.push('Codex CLI 可用。')
        else errors.push('Codex CLI 不可用。')
      } catch (error) {
        errors.push(`Codex CLI 不可用：${error instanceof Error ? error.message : String(error)}`)
      }
      try {
        const login = await runProcess(command, ['login', 'status'], { cwd: context.workspace.path })
        if (login.code === 0) checks.push('Codex 凭据可用。')
        else errors.push('Codex 凭据不可用。')
      } catch (error) {
        errors.push(`Codex 凭据不可用：${error instanceof Error ? error.message : String(error)}`)
      }
      const manifest = context.skill ? getManifests().find((candidate) => candidate.name === context.skill?.name && candidate.version === context.skill?.version) : null
      if (!manifest) errors.push(`固定 Skill ${context.skill?.name ?? 'unknown'}@${context.skill?.version ?? 'unknown'} 不可用。`)
      else checks.push(`固定 Skill ${manifest.name}@${manifest.version} 可用。`)
      checks.push(`Data Transfer Notice：External Destination: Codex Agent Runtime；发送 Idea、Phase Context、Artifact、Decision Record；权限：${context.permissionPolicy.grantedPermissions.join(', ') || 'none'}；断网后从持久化 Step Execution 恢复。`)
      return { checks, errors }
    },
    async execute(context): Promise<RuntimeEvent[]> {
      const skillManifest = getManifests().find((manifest) => manifest.name === context.skill?.name && manifest.version === context.skill?.version)
      if ((dependencies.skillManifests || dependencies.getSkillManifests) && !skillManifest) return [{ type: 'error', error: `固定 Skill ${context.skill?.name ?? 'unknown'}@${context.skill?.version ?? 'unknown'} 不可用。` }]
      let skillInstructions = '(Skill instructions unavailable)'
      const packagePath = skillManifest ? (dependencies.resolveSkillPackagePath?.(skillManifest) ?? dependencies.skillPackagePath) : null
      if (skillManifest && packagePath) {
        try {
          skillInstructions = await loadSkillInstructions(skillManifest, packagePath)
        } catch (error) {
          return [{ type: 'error', error: `无法读取固定 Skill：${error instanceof Error ? error.message : String(error)}` }]
        }
      }
      const sessionId = context.execution.runtimeSessionId
      const args = sessionId
        ? ['exec', 'resume', sessionId, '--json']
        : ['exec', '--json', '--cd', context.workspace.path, '--sandbox', context.permissionPolicy.grantedPermissions.includes('workspace.write') ? 'workspace-write' : 'read-only']
      if (!sessionId) args.push('--skip-git-repo-check')
      args.push(promptFor(context, skillInstructions))
      let result: ProcessResult
      let gitGuard: GitGuard | null = null
      try {
        gitGuard = await createGitGuard(context.project.defaultBranch, context.permissionPolicy.grantedPermissions.includes('network.github'))
        result = await runProcess(command, args, { cwd: context.workspace.path, env: gitGuard.env })
      } catch (error) {
        const message = sanitizeSensitiveText(error instanceof Error ? error.message : String(error))
        return isNetworkFailure(message) ? [{ type: 'status_changed', status: 'blocked', source: 'codex exec --json' }] : [{ type: 'error', error: message }]
      } finally {
        await gitGuard?.cleanup().catch(() => undefined)
      }
      const parsed = parseCodexJsonl(result.stdout)
      if (result.code !== 0) {
        const message = sanitizeSensitiveText(result.stderr.trim() || `Codex Runtime 退出码 ${String(result.code)}。`)
        if (isNetworkFailure(message)) return [{ type: 'status_changed', status: 'blocked', provider: 'codex', source: 'codex exec --json', permissionPolicy: context.permissionPolicy }]
        return [{ type: 'error', error: message, provider: 'codex', source: 'codex exec --json', permissionPolicy: context.permissionPolicy }]
      }
      const events = enrichEvents(parsed.events, context)
      return events.length > 0 ? events : [{ type: 'error', error: 'Codex Runtime 未返回有效事件。', provider: 'codex', source: 'codex exec --json', permissionPolicy: context.permissionPolicy }]
    }
  }
}
