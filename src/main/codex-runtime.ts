import { spawn } from 'node:child_process'
import { basename, join, normalize, relative, resolve } from 'node:path'
import { readFile } from 'node:fs/promises'

import type { AgentRuntimeAdapter, RuntimeArtifact, RuntimeEvent, RuntimeExecutionContext, RuntimePreflightContext, RuntimePreflightResult } from '../shared/workflow-run'
import type { SkillManifest } from '../shared/workflow'

interface CodexJsonlResult {
  sessionId?: string
  events: RuntimeEvent[]
}

interface ProcessResult {
  stdout: string
  stderr: string
  code: number | null
}

interface CodexRuntimeDependencies {
  command?: string
  runProcess?: (command: string, args: string[], options: { cwd: string }) => Promise<ProcessResult>
  skillManifests?: SkillManifest[]
  skillPackagePath?: string
  readSkill?: (path: string, encoding: 'utf8') => Promise<string>
}

const QUESTION_PREFIX = 'QUESTION:'
const APPROVAL_PREFIX = 'APPROVAL_REQUIRED:'
const ARTIFACT_PREFIX = 'ARTIFACT:'

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

function isArtifactInsideWorkspace(artifact: RuntimeArtifact, workspacePath: string): boolean {
  if (!artifact.location) return false
  const workspace = resolve(workspacePath)
  const location = resolve(artifact.location)
  const relativeLocation = relative(workspace, location).replaceAll('\\', '/')
  if (relativeLocation.startsWith('../') || relativeLocation === '..' || relativeLocation.startsWith('/')) return false
  return relativeLocation === 'CONTEXT.md' || (relativeLocation.startsWith('docs/adr/') && relativeLocation.endsWith('.md'))
}

function parseAgentMessage(text: string, sessionId?: string): RuntimeEvent {
  if (text.startsWith(QUESTION_PREFIX)) return { type: 'question', question: text.slice(QUESTION_PREFIX.length).trim(), ...(sessionId ? { sessionId } : {}) }
  if (text.startsWith(APPROVAL_PREFIX)) return { type: 'approval_required', approval: text.slice(APPROVAL_PREFIX.length).trim(), ...(sessionId ? { sessionId } : {}) }
  if (text.startsWith(ARTIFACT_PREFIX)) {
    try {
      const artifact = JSON.parse(text.slice(ARTIFACT_PREFIX.length).trim()) as RuntimeArtifact
      if (artifact && typeof artifact === 'object' && typeof artifact.name === 'string' && typeof artifact.type === 'string' && isDiscoveryArtifact(artifact)) {
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

function defaultRunProcess(command: string, args: string[], options: { cwd: string }): Promise<ProcessResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: options.cwd, stdio: ['pipe', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    child.stdout.setEncoding('utf8').on('data', (chunk: string) => { stdout += chunk })
    child.stderr.setEncoding('utf8').on('data', (chunk: string) => { stderr += chunk })
    child.stdin.end()
    child.on('error', reject)
    child.on('close', (code) => resolve({ stdout, stderr, code }))
  })
}

function promptFor(context: RuntimeExecutionContext, skillInstructions: string): string {
  return [
    `执行固定 Skill ${context.skill?.name ?? 'unknown'}@${context.skill?.version ?? 'unknown'}。`,
    '这是一次可恢复的 Discovery Phase 执行。只使用下面提供的上下文和输入，不要创建隐藏的 Workflow 状态。',
    `Idea: ${context.idea}`,
    `Phase: ${context.workflow.phases[context.phaseIndex]?.id ?? 'unknown'}`,
    `Workspace: ${context.workspace.path}`,
    `Phase Context: ${context.phaseContext?.content ?? '(empty)'}`,
    `Input Artifacts: ${JSON.stringify(context.inputArtifacts)}`,
    `Decision Records: ${JSON.stringify(context.decisionRecords)}`,
    `Permission Policy: ${JSON.stringify(context.permissionPolicy)}`,
    'Fixed Skill instructions:',
    skillInstructions,
    '需要用户回答时，最后一条消息必须以 QUESTION: 开头；需要审批时以 APPROVAL_REQUIRED: 开头。',
    '确认写入 CONTEXT.md 或 docs/adr/*.md 后，输出 ARTIFACT: 后跟 JSON 对象。普通聊天、日志和临时文件不要标记为 Artifact。'
  ].join('\n')
}

export function createCodexRuntimeAdapter(dependencies: CodexRuntimeDependencies = {}): AgentRuntimeAdapter {
  const runProcess = dependencies.runProcess ?? defaultRunProcess
  const command = dependencies.command ?? 'codex'
  const manifests = dependencies.skillManifests ?? []
  const readSkill = dependencies.readSkill ?? ((path: string, encoding: 'utf8') => readFile(path, encoding))

  async function loadSkillInstructions(manifest: SkillManifest, packagePath: string, visited = new Set<string>()): Promise<string> {
    const key = `${manifest.name}@${manifest.version}`
    if (visited.has(key)) return ''
    visited.add(key)
    const own = await readSkill(join(packagePath, manifest.entry), 'utf8')
    const dependenciesText: string[] = []
    for (const dependency of manifest.dependencies) {
      const dependencyManifest = manifests.find((candidate) => candidate.name === dependency)
      if (!dependencyManifest) throw new Error(`固定 Skill 依赖 ${dependency} 不可用。`)
      dependenciesText.push(await loadSkillInstructions(dependencyManifest, packagePath, visited))
    }
    return [own, ...dependenciesText].filter(Boolean).join('\n\n')
  }

  function enrichEvents(events: RuntimeEvent[], context: RuntimeExecutionContext): RuntimeEvent[] {
    return events.filter((event) => event.type !== 'artifact_produced' || isArtifactInsideWorkspace(event.artifact, context.workspace.path)).map((event) => ({
      ...event,
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
      const manifest = context.skill ? manifests.find((candidate) => candidate.name === context.skill?.name && candidate.version === context.skill?.version) : null
      if (!manifest) errors.push(`固定 Skill ${context.skill?.name ?? 'unknown'}@${context.skill?.version ?? 'unknown'} 不可用。`)
      else checks.push(`固定 Skill ${manifest.name}@${manifest.version} 可用。`)
      checks.push(`Data Transfer Notice：External Destination: Codex Agent Runtime；发送 Idea、Phase Context、Artifact、Decision Record；权限：${context.permissionPolicy.grantedPermissions.join(', ') || 'none'}；断网后从持久化 Step Execution 恢复。`)
      return { checks, errors }
    },
    async execute(context): Promise<RuntimeEvent[]> {
      const skillManifest = manifests.find((manifest) => manifest.name === context.skill?.name && manifest.version === context.skill?.version)
      if (dependencies.skillManifests && !skillManifest) return [{ type: 'error', error: `固定 Skill ${context.skill?.name ?? 'unknown'}@${context.skill?.version ?? 'unknown'} 不可用。` }]
      let skillInstructions = '(Skill instructions unavailable)'
      if (skillManifest && dependencies.skillPackagePath) {
        try {
          skillInstructions = await loadSkillInstructions(skillManifest, dependencies.skillPackagePath)
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
      try {
        result = await runProcess(command, args, { cwd: context.workspace.path })
      } catch (error) {
        return [{ type: 'error', error: error instanceof Error ? error.message : String(error) }]
      }
      const parsed = parseCodexJsonl(result.stdout)
      if (result.code !== 0) return [{ type: 'error', error: result.stderr.trim() || `Codex Runtime 退出码 ${String(result.code)}。`, provider: 'codex', source: 'codex exec --json', permissionPolicy: context.permissionPolicy }]
      const events = enrichEvents(parsed.events, context)
      return events.length > 0 ? events : [{ type: 'error', error: 'Codex Runtime 未返回有效事件。', provider: 'codex', source: 'codex exec --json', permissionPolicy: context.permissionPolicy }]
    }
  }
}
