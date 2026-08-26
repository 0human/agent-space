// @vitest-environment node

import { spawnSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'

import type { RuntimeExecutionContext } from '../shared/workflow-run'
import { createCodexRuntimeAdapter } from './codex-runtime'

interface Notification {
  method: string
  params?: Record<string, unknown>
}

function context(overrides: Partial<RuntimeExecutionContext> = {}): RuntimeExecutionContext {
  return {
    runId: 'run-1',
    project: { workspacePath: '/work/demo', defaultBranch: 'main' } as never,
    workspace: { path: '/work/demo' },
    idea: 'Execute the Workflow Step',
    workflow: { phases: [] } as never,
    phaseIndex: 0,
    stepIndex: 0,
    execution: { id: 'execution-1', runtimeLocator: null } as never,
    skill: null,
    phaseContext: null,
    inputArtifacts: [],
    decisionRecords: [],
    permissionPolicy: { grantedPermissions: ['workspace.read', 'workspace.write'] },
    events: [],
    ...overrides
  }
}

function appServerTransport(items: Array<Record<string, unknown>> = [], extraNotifications: Notification[] = []) {
  const incoming: Notification[] = [
    ...extraNotifications,
    ...items.map((item) => ({ method: 'item/completed', params: { threadId: 'thread-1', turnId: 'turn-1', item } })),
    { method: 'turn/completed', params: { threadId: 'thread-1', turn: { id: 'turn-1', status: 'completed', error: null } } }
  ]
  return {
    async request(method: string) {
      if (method === 'initialize') return { userAgent: 'codex-cli/0.144.3' }
      if (method === 'thread/start' || method === 'thread/resume') return { thread: { id: 'thread-1' } }
      if (method === 'turn/start') return { turn: { id: 'turn-1' } }
      throw new Error(`Unexpected request: ${method}`)
    },
    async notify() {},
    async nextNotification() { return incoming.shift() ?? null },
    async close() {}
  }
}

function appServerItems(items: Array<Record<string, unknown>>, dependencies: Record<string, unknown> = {}) {
  return createCodexRuntimeAdapter({
    ...dependencies,
    createTransport: async () => appServerTransport(items)
  })
}

describe('Codex Runtime Adapter policy contract', () => {
  it('keeps verification Artifacts inside the Run Workspace', async () => {
    const adapter = appServerItems([
      { type: 'agentMessage', id: 'item-1', text: 'ARTIFACT: ' + JSON.stringify({ type: 'test-result', name: 'typecheck', location: '/work/run-1/.agent-space/typecheck.json' }) }
    ], {
      skillManifests: [{ name: 'code-review', version: '1.0.0', entry: 'review.md', dependencies: [], supportedRuntimes: ['codex'], capabilities: ['review'], requiredPermissions: [] }],
      skillPackagePath: '/skills',
      readSkill: async () => 'review'
    })

    await expect(adapter.execute(context({
      workspace: { path: '/work/run-1' },
      skill: { name: 'code-review', version: '1.0.0' }
    }))).resolves.toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'artifact_produced', artifact: expect.objectContaining({ type: 'test-result' }) })
    ]))
  })

  it('does not convert chat, logs, temporary files, or external files into Artifacts', async () => {
    const temporaryArtifact = { type: 'log', name: 'session.log', location: '/work/demo/.tmp/session.log' }
    const externalArtifact = { type: 'domain-context', name: 'CONTEXT.md', location: '/tmp/CONTEXT.md' }
    const adapter = appServerItems([
      { type: 'agentMessage', id: 'item-1', text: 'ordinary chat' },
      { type: 'agentMessage', id: 'item-2', text: `ARTIFACT: ${JSON.stringify(temporaryArtifact)}` },
      { type: 'agentMessage', id: 'item-3', text: `ARTIFACT: ${JSON.stringify(externalArtifact)}` }
    ])

    const events = await adapter.execute(context())

    expect(events.filter((event) => event.type === 'artifact_produced')).toEqual([])
    expect(events).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'text_delta', text: 'ordinary chat' }),
      expect.objectContaining({ type: 'status_changed', status: 'completed' })
    ]))
  })

  it('accepts published GitHub specification and ticket Artifacts while rejecting other external URLs', async () => {
    const adapter = appServerItems([
      { type: 'agentMessage', id: 'item-1', text: 'ARTIFACT: ' + JSON.stringify({ type: 'specification', name: 'specification', status: 'ready', location: 'https://github.com/example/project/issues/42' }) },
      { type: 'agentMessage', id: 'item-2', text: 'ARTIFACT: ' + JSON.stringify({ type: 'ticket', name: 'ticket', location: 'https://evil.example/issues/1' }) }
    ])

    await expect(adapter.execute(context({ permissionPolicy: { grantedPermissions: ['workspace.read', 'network.github'] } }))).resolves.toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'artifact_produced', artifact: expect.objectContaining({ runId: 'run-1', location: 'https://github.com/example/project/issues/42' }) })
    ]))
  })

  it.each([
    ['git push --force origin feature/run-1', 'Permission Policy 阻止 force push。'],
    ['git -C /work/demo push origin HEAD:refs/heads/main', 'Permission Policy 阻止直接更新默认分支。'],
    ['/usr/bin/gh pr merge 42 --repo example/demo', 'Permission Policy 阻止绕过 Merge Gate 的 GitHub Pull Request 操作。'],
    ['gh --repo example/demo pr merge 42', 'Permission Policy 阻止绕过 Merge Gate 的 GitHub Pull Request 操作。']
  ])('blocks a forbidden command reported by the Runtime: %s', async (command, error) => {
    const adapter = appServerItems([{ type: 'commandExecution', id: 'item-1', command, status: 'completed' }])

    await expect(adapter.execute(context())).resolves.toEqual([
      expect.objectContaining({
        type: 'error',
        error,
        runtimeLocator: { runtimeProvider: 'codex', threadId: 'thread-1', turnId: 'turn-1', runtimeVersion: '0.144.3' }
      })
    ])
  })

  it.skipIf(process.platform === 'win32')('rejects forbidden Git pushes before invoking the real Git executable', async () => {
    const attempts: Array<{ status: number | null; stderr: string }> = []
    const adapter = createCodexRuntimeAdapter({
      createTransport: async (options) => {
        for (const gitArgs of [['push', '--force', 'origin', 'feature/run-1'], ['push', 'origin', 'main']]) {
          const result = spawnSync('git', gitArgs, { cwd: process.cwd(), env: options.env, encoding: 'utf8' })
          attempts.push({ status: result.status, stderr: result.stderr })
        }
        return appServerTransport()
      }
    })

    await adapter.execute(context({
      project: { workspacePath: process.cwd(), defaultBranch: 'main' } as never,
      workspace: { path: process.cwd() }
    }))

    expect(attempts).toHaveLength(2)
    expect(attempts.every((attempt) => attempt.status === 126 && attempt.stderr.includes('Permission Policy 阻止'))).toBe(true)
  })

  it.skipIf(process.platform === 'win32')('rejects pushes when the Project default branch is unknown', async () => {
    const attempts: Array<{ status: number | null; stderr: string }> = []
    const adapter = createCodexRuntimeAdapter({
      createTransport: async (options) => {
        const result = spawnSync('git', ['push', 'origin', 'feature/run-1'], { cwd: process.cwd(), env: options.env, encoding: 'utf8' })
        attempts.push({ status: result.status, stderr: result.stderr })
        return appServerTransport()
      }
    })

    await adapter.execute(context({
      project: { workspacePath: process.cwd(), defaultBranch: null } as never,
      workspace: { path: process.cwd() }
    }))

    expect(attempts).toEqual([expect.objectContaining({ status: 126 })])
    expect(attempts[0]?.stderr).toContain('默认分支未知')
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

  it('loads an Installed Skill from its fixed package path instead of the built-in package', async () => {
    const readPaths: string[] = []
    const manifest = { name: 'external', version: '1.0.0', entry: 'skills/external/SKILL.md', dependencies: [], supportedRuntimes: ['codex'], capabilities: [], requiredPermissions: [] }
    const adapter = createCodexRuntimeAdapter({
      getSkillManifests: () => [manifest],
      resolveSkillPackagePath: () => '/installed/external@1.0.0',
      readSkill: async (path) => { readPaths.push(path); return '# external' },
      createTransport: async () => appServerTransport()
    })

    await adapter.execute(context({ skill: { name: 'external', version: '1.0.0' } }))

    expect(readPaths.map((path) => path.replaceAll('\\', '/'))).toEqual(['/installed/external@1.0.0/skills/external/SKILL.md'])
  })

  it.skipIf(process.env.RUN_CODEX_CLI_TEST !== '1')('reaches the installed Codex App Server boundary when explicitly enabled', async () => {
    const adapter = createCodexRuntimeAdapter()
    const events = await adapter.execute(context({
      runId: 'app-server-boundary',
      project: { workspacePath: process.cwd(), defaultBranch: null } as never,
      workspace: { path: process.cwd() },
      idea: 'Return a short answer without using tools.',
      permissionPolicy: { grantedPermissions: ['workspace.read'] }
    }))
    expect(events.some((event) => event.type === 'status_changed' || event.type === 'error')).toBe(true)
  }, 30000)
})
