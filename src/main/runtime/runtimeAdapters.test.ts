import { describe, expect, it } from 'vitest'
import type { AiRuntimeConfig, WorkSession } from '../db/schema'
import {
  ClaudeCodeCliRuntimeAdapter,
  CodexCliRuntimeAdapter,
  CustomCliRuntimeAdapter,
  GeminiCliRuntimeAdapter,
  RuntimeRegistryService
} from './runtimeAdapters'

function runtime(overrides: Partial<AiRuntimeConfig>): AiRuntimeConfig {
  return {
    id: 'runtime-1',
    name: 'Runtime',
    runtimeType: 'cli_agent',
    provider: 'custom_cli',
    agentProfileId: null,
    source: 'manual',
    sourceRef: null,
    model: null,
    executablePath: '/usr/local/bin/runtime',
    defaultArgsJson: null,
    defaultCwdMode: 'project_root',
    customCwd: null,
    systemPrompt: null,
    streamEnabled: 1,
    permissionPreset: null,
    isDefault: 0,
    enabled: 1,
    notes: null,
    lastTestStatus: null,
    lastTestMessage: null,
    lastTestedAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    lastUsedAt: null,
    ...overrides
  }
}

function session(overrides: Partial<WorkSession> = {}): WorkSession {
  return {
    id: 'session-1',
    projectId: 'project-1',
    title: 'Build feature',
    goal: 'Ship the feature',
    status: 'idle',
    aiTeamId: null,
    aiTeamMemberId: null,
    aiRuntimeConfigId: 'runtime-1',
    agentProfileId: null,
    assignmentMode: 'runtime',
    activeAssigneeType: 'runtime',
    parentWorkSessionId: null,
    externalSessionId: null,
    latestRunId: null,
    summary: null,
    resolvedConfigSnapshotJson: null,
    archivedAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    lastMessageAt: null,
    ...overrides
  }
}

describe('RuntimeAdapter start plans', () => {
  it('creates a custom CLI JSON stdin envelope and preserves default args', () => {
    const adapter = new CustomCliRuntimeAdapter()
    const plan = adapter.createStartPlan({
      runtime: runtime({
        provider: 'custom_cli',
        defaultArgsJson: JSON.stringify(['--mode', 'text'])
      }),
      session: session(),
      projectLocalPath: '/workspace/project',
      prompt: 'Hello'
    })

    expect(plan).toEqual(
      expect.objectContaining({
        command: '/usr/local/bin/runtime',
        args: ['--mode', 'text'],
        cwd: '/workspace/project',
        supportsExternalSessionResume: false
      })
    )
    expect(JSON.parse(plan.stdin ?? '{}')).toEqual(
      expect.objectContaining({
        provider: 'custom_cli',
        workSessionId: 'session-1',
        prompt: 'Hello'
      })
    )
  })

  it('creates a Claude Code print-mode plan with stream JSON output and resume', () => {
    const adapter = new ClaudeCodeCliRuntimeAdapter()
    const plan = adapter.createStartPlan({
      runtime: runtime({
        provider: 'claude_code_cli',
        executablePath: 'claude',
        defaultArgsJson: JSON.stringify(['--permission-mode', 'plan'])
      }),
      session: session(),
      projectLocalPath: '/workspace/project',
      prompt: 'Review this change',
      resumeExternalSessionId: 'claude-session'
    })

    expect(plan.args).toEqual([
      '-r',
      'claude-session',
      '-p',
      'Review this change',
      '--permission-mode',
      'plan',
      '--output-format',
      'stream-json',
      '--verbose'
    ])
    expect(plan.stdin).toBeUndefined()
    expect(plan.inputEnvelope.resumeExternalSessionId).toBe('claude-session')
  })

  it('extracts Claude Code assistant text from stream JSON', () => {
    const adapter = new ClaudeCodeCliRuntimeAdapter()
    const stdout = [
      JSON.stringify({
        type: 'assistant',
        message: { content: [{ type: 'text', text: 'Intermediate answer' }] }
      }),
      JSON.stringify({ type: 'result', result: 'Final answer' })
    ].join('\n')

    expect(adapter.extractAssistantMessage(stdout)).toBe('Final answer')
  })

  it('creates a Codex exec plan using stdin and JSON events', () => {
    const adapter = new CodexCliRuntimeAdapter()
    const plan = adapter.createStartPlan({
      runtime: runtime({
        provider: 'codex_cli',
        executablePath: 'codex',
        defaultArgsJson: JSON.stringify(['--sandbox', 'workspace-write'])
      }),
      session: session(),
      projectLocalPath: '/workspace/project',
      prompt: 'Implement tests'
    })

    expect(plan.args).toEqual(['exec', '--sandbox', 'workspace-write', '--json'])
    expect(plan.stdin).toBe('Implement tests')
  })

  it('extracts Codex assistant text from JSONL events', () => {
    const adapter = new CodexCliRuntimeAdapter()
    const stdout = [
      JSON.stringify({ type: 'AgentMessage', content: 'First paragraph' }),
      JSON.stringify({ msg: { type: 'text', content: 'Second paragraph' } })
    ].join('\n')

    expect(adapter.extractAssistantMessage(stdout)).toBe('First paragraph\nSecond paragraph')
  })

  it('creates a Gemini prompt plan with stream JSON output and custom cwd', () => {
    const adapter = new GeminiCliRuntimeAdapter()
    const plan = adapter.createStartPlan({
      runtime: runtime({
        provider: 'gemini_cli',
        executablePath: 'gemini',
        defaultCwdMode: 'custom_path',
        customCwd: '/workspace/other',
        defaultArgsJson: JSON.stringify(['--model', 'gemini-2.5-pro'])
      }),
      session: session(),
      projectLocalPath: '/workspace/project',
      prompt: 'Summarize',
      resumeExternalSessionId: 'latest'
    })

    expect(plan.args).toEqual([
      '-r',
      'latest',
      '-p',
      'Summarize',
      '--model',
      'gemini-2.5-pro',
      '--output-format',
      'stream-json'
    ])
    expect(plan.cwd).toBe('/workspace/other')
  })

  it('extracts Gemini assistant text from JSON output', () => {
    const adapter = new GeminiCliRuntimeAdapter()

    expect(adapter.extractAssistantMessage(JSON.stringify({ response: 'Gemini answer' }))).toBe(
      'Gemini answer'
    )
    expect(adapter.extractAssistantMessage(JSON.stringify({ text: 'Text answer' }))).toBe(
      'Text answer'
    )
  })

  it('resolves all default adapters from the registry', () => {
    const registry = new RuntimeRegistryService()

    expect(registry.get('custom_cli')).toBeInstanceOf(CustomCliRuntimeAdapter)
    expect(registry.get('claude_code_cli')).toBeInstanceOf(ClaudeCodeCliRuntimeAdapter)
    expect(registry.get('codex_cli')).toBeInstanceOf(CodexCliRuntimeAdapter)
    expect(registry.get('gemini_cli')).toBeInstanceOf(GeminiCliRuntimeAdapter)
  })
})
