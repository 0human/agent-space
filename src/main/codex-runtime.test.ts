// @vitest-environment node

import { describe, expect, it } from 'vitest'

import { createCodexRuntimeAdapter, parseCodexJsonl } from './codex-runtime'

describe('Codex Runtime Adapter recorded contract', () => {
  it('converts Codex JSONL lifecycle items into provider-neutral Runtime Events', () => {
    const result = parseCodexJsonl([
      '{"type":"thread.started","thread_id":"thread-42"}',
      '{"type":"turn.started"}',
      '{"type":"item.completed","item":{"type":"agent_message","text":"先确认目标用户。"}}',
      '{"type":"item.completed","item":{"type":"command_execution","command":"cat CONTEXT.md","status":"completed"}}',
      '{"type":"item.completed","item":{"type":"agent_message","text":"QUESTION: 首个目标用户是谁？"}}',
      JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', text: 'ARTIFACT: ' + JSON.stringify({ type: 'domain-context', name: 'CONTEXT.md', location: '/work/demo/CONTEXT.md' }) } }),
      '{"type":"turn.completed"}'
    ].join('\n'))

    expect(result).toEqual({
      sessionId: 'thread-42',
      events: [
        { type: 'text_delta', text: '先确认目标用户。', sessionId: 'thread-42' },
        { type: 'tool_call', name: 'cat CONTEXT.md', input: { status: 'completed' }, sessionId: 'thread-42' },
        { type: 'question', question: '首个目标用户是谁？', sessionId: 'thread-42' },
        { type: 'artifact_produced', artifact: { type: 'domain-context', name: 'CONTEXT.md', location: '/work/demo/CONTEXT.md' }, sessionId: 'thread-42' }
      ]
    })
  })

  it('preserves structured provider errors without exposing raw transcript parsing to the engine', () => {
    const result = parseCodexJsonl('{"type":"error","message":"authentication required"}')

    expect(result.events).toEqual([{ type: 'error', error: 'authentication required' }])
  })

  it('does not convert chat, logs, or temporary files into Artifacts', () => {
    const temporaryArtifact = JSON.stringify({ type: 'log', name: 'session.log', location: '/work/demo/.tmp/session.log' })
    const result = parseCodexJsonl([
      '{"type":"thread.started","thread_id":"thread-43"}',
      JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', text: 'ordinary chat' } }),
      JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', text: `ARTIFACT: ${temporaryArtifact}` } }),
      '{"type":"turn.completed"}'
    ].join('\n'))

    expect(result.events.filter((event) => event.type === 'artifact_produced')).toEqual([])
    expect(result.events).toEqual(expect.arrayContaining([
      { type: 'text_delta', text: 'ordinary chat', sessionId: 'thread-43' },
      { type: 'text_delta', text: `ARTIFACT: ${temporaryArtifact}`, sessionId: 'thread-43' },
      { type: 'status_changed', status: 'completed', sessionId: 'thread-43' }
    ]))
  })

  it('accepts published GitHub specification and ticket Artifacts while rejecting other external URLs', async () => {
    const adapter = createCodexRuntimeAdapter({
      runProcess: async () => ({ code: 0, stderr: '', stdout: [
        '{"type":"thread.started","thread_id":"thread-publish"}',
        JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', text: 'ARTIFACT: ' + JSON.stringify({ type: 'specification', name: 'specification', status: 'ready', location: 'https://github.com/example/project/issues/42' }) } }),
        JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', text: 'ARTIFACT: ' + JSON.stringify({ type: 'ticket', name: 'ticket', location: 'https://evil.example/issues/1' }) } }),
        '{"type":"turn.completed"}'
      ].join('\n') })
    })

    await expect(adapter.execute({
      runId: 'run-1', project: { workspacePath: '/work/demo' } as never, workspace: { path: '/work/demo' }, idea: 'Publish a spec',
      workflow: { phases: [] } as never, phaseIndex: 0, stepIndex: 0,
      execution: { id: 'execution-1', runtimeSessionId: null } as never, skill: { name: 'to-spec', version: '1.0.0' },
      phaseContext: null, inputArtifacts: [], decisionRecords: [], permissionPolicy: { grantedPermissions: ['workspace.read', 'network.github'] }, events: []
    })).resolves.toEqual(expect.arrayContaining([expect.objectContaining({ type: 'artifact_produced', artifact: expect.objectContaining({ location: 'https://github.com/example/project/issues/42' }) })]))
  })

  it('starts a new Codex session and resumes the persisted session in the same workspace', async () => {
    const calls: Array<{ command: string; args: string[]; cwd: string }> = []
    const adapter = createCodexRuntimeAdapter({
      runProcess: async (command, args, options) => {
        calls.push({ command, args, cwd: options.cwd })
        return { code: 0, stderr: '', stdout: '{"type":"thread.started","thread_id":"thread-99"}\n{"type":"turn.completed"}' }
      }
    })
    const context = {
      runId: 'run-1',
      project: { workspacePath: '/work/demo' } as never,
      workspace: { path: '/work/demo' },
      idea: 'Clarify the idea',
      workflow: { phases: [{ id: 'discovery', name: 'Discovery', goal: 'Clarify', steps: [] }] } as never,
      phaseIndex: 0,
      stepIndex: 0,
      execution: { id: 'execution-1', runtimeSessionId: null } as never,
      skill: { name: 'grill-with-docs', version: '1.0.0' },
      phaseContext: null,
      inputArtifacts: [],
      decisionRecords: [],
      permissionPolicy: { grantedPermissions: ['workspace.read', 'workspace.write'] },
      events: []
    }

    await adapter.execute(context)
    await adapter.execute({ ...context, execution: { id: 'execution-2', runtimeSessionId: 'thread-99' } as never })

    expect(calls[0]).toMatchObject({ command: 'codex', cwd: '/work/demo', args: expect.arrayContaining(['exec', '--json', '--cd', '/work/demo', '--sandbox', 'workspace-write']) })
    expect(calls[1]).toMatchObject({ command: 'codex', cwd: '/work/demo', args: expect.arrayContaining(['exec', 'resume', 'thread-99', '--json']) })
  })

  it('rejects non-zero CLI exits and artifacts outside the isolated Workspace', async () => {
    const adapter = createCodexRuntimeAdapter({
      runProcess: async () => ({ code: 2, stdout: JSON.stringify({ type: 'thread.started', thread_id: 'thread-100' }) + '\n{"type":"turn.completed"}', stderr: 'permission denied' })
    })
    const events = await adapter.execute({
      runId: 'run-1', project: { workspacePath: '/work/demo' } as never, workspace: { path: '/work/demo' }, idea: 'Idea',
      workflow: { phases: [] } as never, phaseIndex: 0, stepIndex: 0,
      execution: { id: 'execution-1', runtimeSessionId: null } as never, skill: null,
      phaseContext: null, inputArtifacts: [], decisionRecords: [], permissionPolicy: { grantedPermissions: ['workspace.read'] }, events: []
    })
    expect(events).toEqual([expect.objectContaining({ type: 'error', error: 'permission denied' })])

    const filtered = createCodexRuntimeAdapter({
      runProcess: async () => ({ code: 0, stderr: '', stdout: [
        '{"type":"thread.started","thread_id":"thread-101"}',
        JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', text: 'ARTIFACT: ' + JSON.stringify({ type: 'domain-context', name: 'CONTEXT.md', location: '/tmp/CONTEXT.md' }) } }),
        '{"type":"turn.completed"}'
      ].join('\n') })
    })
    await expect(filtered.execute({
      runId: 'run-1', project: { workspacePath: '/work/demo' } as never, workspace: { path: '/work/demo' }, idea: 'Idea',
      workflow: { phases: [] } as never, phaseIndex: 0, stepIndex: 0,
      execution: { id: 'execution-1', runtimeSessionId: null } as never, skill: null,
      phaseContext: null, inputArtifacts: [], decisionRecords: [], permissionPolicy: { grantedPermissions: ['workspace.read'] }, events: []
    })).resolves.toEqual([expect.objectContaining({ type: 'status_changed', status: 'completed' })])
  })

  it('preflights the CLI, credentials, fixed Skill, and Data Transfer Notice before execution', async () => {
    const adapter = createCodexRuntimeAdapter({
      skillManifests: [{ name: 'grill-with-docs', version: '1.0.0', entry: 'skills/grill-with-docs/SKILL.md', dependencies: [], supportedRuntimes: ['codex'], capabilities: ['question'], requiredPermissions: ['workspace.read'] }],
      skillPackagePath: '/package',
      readSkill: async () => '# grill-with-docs',
      runProcess: async (_command, args) => ({ code: 0, stdout: args.includes('--version') ? 'codex-cli 0.144.3' : 'Logged in', stderr: '' })
    })

    await expect(adapter.preflight?.({
      workspace: { path: '/work/demo' },
      skill: { name: 'grill-with-docs', version: '1.0.0' },
      permissionPolicy: { grantedPermissions: ['workspace.read'] }
    })).resolves.toEqual({
      checks: [
        'Codex CLI 可用。',
        'Codex 凭据可用。',
        '固定 Skill grill-with-docs@1.0.0 可用。',
        expect.stringContaining('External Destination: Codex Agent Runtime')
      ],
      errors: []
    })
  })

  it.skipIf(process.env.RUN_CODEX_CLI_TEST !== '1')('reaches the installed Codex CLI JSONL boundary when explicitly enabled', async () => {
    const adapter = createCodexRuntimeAdapter()
    const events = await adapter.execute({
      runId: 'cli-boundary',
      project: { workspacePath: process.cwd() } as never,
      workspace: { path: process.cwd() },
      idea: 'Return a short answer without using tools.',
      workflow: { phases: [{ id: 'discovery', name: 'Discovery', goal: 'Clarify', steps: [] }] } as never,
      phaseIndex: 0,
      stepIndex: 0,
      execution: { id: 'execution-1', runtimeSessionId: null } as never,
      skill: { name: 'grill-with-docs', version: '1.0.0' },
      phaseContext: null,
      inputArtifacts: [],
      decisionRecords: [],
      permissionPolicy: { grantedPermissions: ['workspace.read'] },
      events: []
    })
    expect(events.some((event) => event.type === 'status_changed' || event.type === 'error')).toBe(true)
  }, 30000)
})
