// @vitest-environment node

import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type { Project } from '../shared/project'
import type { WorkflowView } from '../shared/workflow'
import type { AgentRuntimeAdapter, RuntimeEvent, RuntimeExecutionContext } from '../shared/workflow-run'
import { createWorkflowEngine, type WorkflowEngine } from './workflow-engine'
import { createFakeRuntimeAdapter } from './fake-runtime'

class FakeRuntime implements AgentRuntimeAdapter {
  readonly calls: string[] = []
  readonly contexts: RuntimeExecutionContext[] = []
  private pending: Array<(result: RuntimeEvent[]) => void> = []

  execute(context: RuntimeExecutionContext): Promise<RuntimeEvent[]> {
    this.calls.push(context.execution.id)
    this.contexts.push(context)
    return new Promise((resolve) => this.pending.push(resolve))
  }

  finish(result: RuntimeEvent[]): void {
    const resolve = this.pending.shift()
    if (!resolve) throw new Error('No pending runtime execution')
    resolve(result)
  }
}

const project: Project = {
  id: 'project-1',
  name: 'demo',
  workspacePath: '/work/demo',
  workspaceAvailable: true,
  remote: null,
  currentBranch: 'main',
  head: 'abc123',
  defaultBranch: 'main',
  isGreenfield: false,
  dirty: false,
  dirtySummary: { staged: 0, unstaged: 0, untracked: 0, files: [] },
  permissionPolicy: { grantedPermissions: ['workspace.read', 'workspace.write'] },
  updatedAt: '2026-08-18T00:00:00.000Z'
}

const workflow: WorkflowView = {
  definition: {
    schemaVersion: 1,
    id: 'project-workflow',
    name: 'Project Workflow',
    version: '1.0.0',
    phases: [{
      id: 'discovery',
      name: 'Discovery',
      goal: 'Clarify the idea',
      steps: [{ id: 'discover', name: 'Clarify Idea', kind: 'skill', skill: { name: 'grill-with-docs', version: '1.0.0' }, artifacts: ['domain-docs'] }]
    }]
  },
  source: 'project',
  path: '/work/demo/.agent-space/workflow.json',
  validation: { valid: true, errors: [], warnings: [] },
  canStart: true,
  skillManifests: []
}

const twoStepWorkflow: WorkflowView = {
  ...workflow,
  definition: {
    ...workflow.definition,
    phases: [{
      ...workflow.definition.phases[0],
      steps: [
        workflow.definition.phases[0].steps[0],
        { id: 'spec', name: 'Write specification', kind: 'skill' }
      ]
    }]
  }
}

describe('WorkflowEngine public API', () => {
  let directory: string
  let engine: WorkflowEngine

  afterEach(async () => {
    await engine?.close()
    if (directory) await rm(directory, { recursive: true, force: true })
  })

  it('preflights, persists a completed Run, and restores it after restart', async () => {
    directory = await mkdtemp(join(tmpdir(), 'agent-space-run-'))
    const runtime = new FakeRuntime()
    engine = createWorkflowEngine({ databasePath: join(directory, 'runs.sqlite'), runtime })

    const input = { project, workflow, idea: 'Build a durable workflow run' }
    await expect(engine.preflight(input)).resolves.toEqual({
      passed: true,
      checks: ['Project Workspace 可访问。', 'Project Workflow Validation 通过。', 'Idea 已填写。'],
      errors: []
    })

    const run = await engine.startRun({ ...input, preflight: await engine.preflight(input) })
    expect(run.status).toBe('running')
    expect(run.snapshot.nextAction).toBe('等待 Runtime 完成当前 Step。')
    expect(run.stepExecutions[0]).toMatchObject({ input: { idea: 'Build a durable workflow run' }, skill: { name: 'grill-with-docs', version: '1.0.0' } })
    expect(run.events.map((event) => event.type)).toEqual(['started', 'step_started'])

    await vi.waitFor(() => expect(runtime.calls).toHaveLength(1))
    runtime.finish([{ type: 'status_changed', status: 'completed' }, { type: 'artifact_produced', artifact: { type: 'document', name: 'domain-docs', location: '/work/demo/CONTEXT.md' } }])
    const completed = await engine.waitForIdle(run.id)
    expect(completed.status).toBe('completed')
    expect(completed.snapshot.nextAction).toBe('Workflow Run 已完成。')
    expect(completed.stepExecutions[0]).toMatchObject({ status: 'completed', attempt: 1 })
    expect(completed.artifacts).toHaveLength(1)
    expect(completed.events.map((event) => event.type)).toEqual(['started', 'step_started', 'step_completed', 'completed'])

    await engine.close()
    engine = createWorkflowEngine({ databasePath: join(directory, 'runs.sqlite'), runtime: new FakeRuntime() })
    await expect(engine.getRun(run.id)).resolves.toMatchObject({
      id: run.id,
      status: 'completed',
      snapshot: { nextAction: 'Workflow Run 已完成。' },
      artifacts: [expect.objectContaining({ name: 'domain-docs' })]
    })
  })

  it('selects the current platform release configuration during Preflight', async () => {
    directory = await mkdtemp(join(tmpdir(), 'agent-space-run-'))
    engine = createWorkflowEngine({ databasePath: join(directory, 'runs.sqlite'), runtime: new FakeRuntime(), platform: 'linux' })
    const releaseWorkflow: WorkflowView = {
      ...workflow,
      definition: {
        ...workflow.definition,
        phases: [{
          id: 'release', name: 'Release', goal: 'Publish', steps: [
            { id: 'build', name: 'Build', kind: 'tool', adapter: 'project.release', operation: 'build' },
            { id: 'release', name: 'Release', kind: 'tool', adapter: 'project.release', operation: 'release', approvalGate: '发布确认' },
            { id: 'validate', name: 'Validation', kind: 'tool', adapter: 'project.release', operation: 'validation' }
          ]
        }]
      }
    }
    const configuredProject: Project = {
      ...project,
      release: {
        enabled: true,
        platforms: {
          linux: {
            build: { kind: 'tool', command: 'npm', args: ['run', 'build'] },
            release: { kind: 'tool', command: 'deploy', args: ['--production'], targetEnvironment: 'https://staging.example.com', requiredPermissions: ['network.deploy'] },
            validation: { kind: 'tool', command: 'curl', args: ['--fail', 'https://staging.example.com/health'] }
          }
        }
      }
    }

    const result = await engine.preflight({ project: configuredProject, workflow: releaseWorkflow, idea: 'Release the app' })

    expect(result.passed).toBe(false)
    expect(result.errors).toEqual(expect.arrayContaining([
      expect.stringContaining('network.deploy'),
      expect.stringContaining('Release Preflight')
    ]))
    expect(result.checks).toEqual(expect.arrayContaining([
      expect.stringContaining('Linux'),
      expect.stringContaining('Data Transfer Notice')
    ]))
  })

  it('runs configured Release and Post-release Validation Tool Steps after approval', async () => {
    directory = await mkdtemp(join(tmpdir(), 'agent-space-run-'))
    const releaseWorkflow: WorkflowView = {
      ...workflow,
      definition: {
        ...workflow.definition,
        phases: [{
          id: 'release', name: 'Release', goal: 'Publish', steps: [
            { id: 'build', name: 'Build', kind: 'tool', adapter: 'project.release', operation: 'build' },
            { id: 'release', name: 'Release', kind: 'tool', adapter: 'project.release', operation: 'release', approvalGate: '发布确认' },
            { id: 'validate', name: 'Validation', kind: 'tool', adapter: 'project.release', operation: 'validation' }
          ]
        }]
      }
    }
    const configuredProject: Project = {
      ...project,
      release: {
        enabled: true,
        platforms: {
          linux: {
            build: { kind: 'tool', command: 'npm', args: ['run', 'build'] },
            release: { kind: 'tool', command: 'deploy', args: ['--production'], targetEnvironment: 'https://staging.example.com' },
            validation: { kind: 'tool', command: 'curl', args: ['--fail', 'https://staging.example.com/health'] }
          }
        }
      }
    }
    const releaseManager = {
      preflight: vi.fn().mockResolvedValue({ checks: ['release commands available'], errors: [] }),
      execute: vi.fn()
        .mockResolvedValueOnce([{ type: 'artifact_produced', artifact: { type: 'build', name: 'Build', status: 'available' } }, { type: 'status_changed', status: 'completed' }])
        .mockResolvedValueOnce([{ type: 'artifact_produced', artifact: { type: 'release', name: 'Release', location: 'https://staging.example.com', status: 'published' } }, { type: 'status_changed', status: 'completed' }])
        .mockResolvedValueOnce([{ type: 'artifact_produced', artifact: { type: 'validation-report', name: 'Validation', location: 'https://staging.example.com/health', status: 'passed' } }, { type: 'status_changed', status: 'completed' }])
    }
    engine = createWorkflowEngine({ databasePath: join(directory, 'runs.sqlite'), runtime: new FakeRuntime(), platform: 'linux', releaseManager })

    const run = await engine.startRun({ project: configuredProject, workflow: releaseWorkflow, idea: 'Release the app' })
    const waiting = await engine.waitForIdle(run.id)

    expect(waiting.status).toBe('waiting')
    expect(waiting.snapshot.pendingApproval).toBe('发布确认')
    expect(waiting.artifacts.map((artifact) => artifact.type)).toEqual(['build'])

    await engine.approve(run.id)
    const completed = await engine.waitForIdle(run.id)

    expect(completed.status).toBe('completed')
    expect(completed.artifacts.map((artifact) => artifact.type)).toEqual(['build', 'release', 'validation-report'])
    expect(releaseManager.execute).toHaveBeenCalledTimes(3)
  })

  it('starts a built-in Workflow and persists its source snapshot with the definition', async () => {
    directory = await mkdtemp(join(tmpdir(), 'agent-space-run-'))
    const runtime = new FakeRuntime()
    engine = createWorkflowEngine({ databasePath: join(directory, 'runs.sqlite'), runtime })
    const builtInWorkflow: WorkflowView = { ...workflow, definition: structuredClone(workflow.definition), source: 'built-in', path: null }

    const run = await engine.startRun({ project, workflow: builtInWorkflow, idea: 'Run the built-in workflow directly' })

    expect(run.workflowSource).toEqual({ source: 'built-in', id: workflow.definition.id, version: workflow.definition.version, path: null })
    builtInWorkflow.definition.name = 'Mutated after Run creation'
    await vi.waitFor(() => expect(runtime.calls).toHaveLength(1))
    runtime.finish([{ type: 'status_changed', status: 'completed' }])
    await engine.waitForIdle(run.id)
    await engine.close()
    engine = createWorkflowEngine({ databasePath: join(directory, 'runs.sqlite'), runtime: new FakeRuntime() })

    await expect(engine.getRun(run.id)).resolves.toMatchObject({
      workflowSource: { source: 'built-in', id: workflow.definition.id, version: workflow.definition.version, path: null },
      definition: expect.objectContaining({ name: 'Project Workflow' })
    })
  })

  it('runs multiple Runs for one Project in isolated workspaces', async () => {
    directory = await mkdtemp(join(tmpdir(), 'agent-space-run-'))
    const runtime = new FakeRuntime()
    const runWorkspaceManager = {
      prepare: vi.fn(async (_project: Project, runId: string) => ({
        workspacePath: `/work/demo-agent-space-${runId}`,
        baseCommit: 'abc123',
        branch: `main/agent-space/${runId}`
      }))
    }
    engine = createWorkflowEngine({ databasePath: join(directory, 'runs.sqlite'), runtime, runWorkspaceManager })

    const first = await engine.startRun({ project, workflow, idea: 'First parallel change #11' })
    const second = await engine.startRun({ project, workflow, idea: 'Second parallel change #11' })

    await vi.waitFor(() => expect(runtime.contexts).toHaveLength(2))
    expect(first.id).not.toBe(second.id)
    expect(first.workspacePath).not.toBe(second.workspacePath)
    expect(first.branch).not.toBe(second.branch)
    expect(runtime.contexts.map((context) => context.workspace.path)).toEqual(expect.arrayContaining([
      `/work/demo-agent-space-${first.id}`,
      `/work/demo-agent-space-${second.id}`
    ]))

    runtime.finish([{ type: 'status_changed', status: 'completed' }])
    runtime.finish([{ type: 'status_changed', status: 'completed' }])
    await Promise.all([engine.waitForIdle(first.id), engine.waitForIdle(second.id)])

    await expect(engine.listRuns(project.id)).resolves.toEqual(expect.arrayContaining([
      expect.objectContaining({ id: first.id, projectId: project.id, baseCommit: 'abc123', branch: `main/agent-space/${first.id}` }),
      expect.objectContaining({ id: second.id, projectId: project.id, baseCommit: 'abc123', branch: `main/agent-space/${second.id}` })
    ]))
  })

  it('blocks a Run when Runtime reports a merge conflict', async () => {
    directory = await mkdtemp(join(tmpdir(), 'agent-space-run-'))
    const runtime = new FakeRuntime()
    engine = createWorkflowEngine({ databasePath: join(directory, 'runs.sqlite'), runtime })

    const run = await engine.startRun({ project, workflow, idea: 'Resolve parallel conflict #11' })
    await vi.waitFor(() => expect(runtime.calls).toHaveLength(1))
    runtime.finish([{ type: 'error', error: 'Merge conflict detected while applying branch.' }])

    await expect(engine.waitForIdle(run.id)).resolves.toMatchObject({
      status: 'blocked',
      snapshot: { blockedBy: { reason: 'Merge conflict detected while applying branch.' } }
    })
  })

  it('runs Automatic Review before committing the isolated implementation workspace', async () => {
    directory = await mkdtemp(join(tmpdir(), 'agent-space-run-'))
    const runtime = new FakeRuntime()
    const commitAfterReview = vi.fn().mockResolvedValue({
      commit: 'commit-10',
      artifact: { type: 'commit', name: 'commit', runId: 'run-10', location: '/work/demo-agent-space/run-10@commit-10', versionHash: 'commit-10', status: 'available' }
    })
    engine = createWorkflowEngine({ databasePath: join(directory, 'runs.sqlite'), runtime, runWorkspaceManager: { prepare: vi.fn().mockResolvedValue({ workspacePath: '/work/demo-agent-space/run-10', baseCommit: 'abc123', branch: 'main/agent-space/run-10' }) }, gitDeliveryManager: { commitAfterReview } })
    const reviewWorkflow: WorkflowView = {
      ...workflow,
      definition: { ...workflow.definition, phases: [{ ...workflow.definition.phases[0], steps: [{ id: 'review', name: '自动 Review', kind: 'skill', skill: { name: 'code-review', version: '1.0.0' }, artifacts: ['review-report'] }] }] }
    }

    const run = await engine.startRun({ project, workflow: reviewWorkflow, idea: 'Implement issue #10' })
    await vi.waitFor(() => expect(runtime.calls).toHaveLength(1))
    runtime.finish([{ type: 'status_changed', status: 'completed' }, { type: 'artifact_produced', artifact: { type: 'review-report', name: 'review-report', location: '/work/demo-agent-space/run-10/review.md' } }])
    const completed = await engine.waitForIdle(run.id)

    expect(commitAfterReview).toHaveBeenCalledWith(expect.objectContaining({ workspacePath: '/work/demo-agent-space/run-10', runId: run.id, baseCommit: 'abc123' }))
    expect(completed.status).toBe('completed')
    expect(completed.artifacts).toEqual(expect.arrayContaining([expect.objectContaining({ type: 'commit', versionHash: 'commit-10', stepExecutionId: run.stepExecutions[0].id })]))
  })

  it('fails the Review Step when local Git delivery cannot commit', async () => {
    directory = await mkdtemp(join(tmpdir(), 'agent-space-run-'))
    const runtime = new FakeRuntime()
    engine = createWorkflowEngine({
      databasePath: join(directory, 'runs.sqlite'),
      runtime,
      gitDeliveryManager: { commitAfterReview: vi.fn().mockRejectedValue(new Error('Git commit 被拒绝。')) }
    })
    const reviewWorkflow: WorkflowView = {
      ...workflow,
      definition: { ...workflow.definition, phases: [{ ...workflow.definition.phases[0], steps: [{ id: 'review', name: '自动 Review', kind: 'skill', skill: { name: 'code-review', version: '1.0.0' } }] }] }
    }
    const run = await engine.startRun({ project, workflow: reviewWorkflow, idea: 'Review issue #10' })
    await vi.waitFor(() => expect(runtime.calls).toHaveLength(1))
    runtime.finish([{ type: 'status_changed', status: 'completed' }])
    await expect(engine.waitForIdle(run.id)).resolves.toMatchObject({ status: 'failed', error: 'Git commit 被拒绝。', snapshot: { nextAction: '当前 Step 失败，可重试。' } })
  })

  it('ends local Git delivery when the Project has no remote', async () => {
    directory = await mkdtemp(join(tmpdir(), 'agent-space-run-'))
    const runtime = new FakeRuntime()
    const commitAfterReview = vi.fn().mockResolvedValue({ commit: 'commit-local', artifact: { type: 'commit', name: 'commit', runId: 'run-local', location: '/work/demo@commit-local', versionHash: 'commit-local', status: 'available' } })
    engine = createWorkflowEngine({ databasePath: join(directory, 'runs.sqlite'), runtime, gitDeliveryManager: { commitAfterReview } })
    const localWorkflow: WorkflowView = { ...workflow, definition: { ...workflow.definition, phases: [{ ...workflow.definition.phases[0], steps: [{ id: 'review', name: '自动 Review', kind: 'skill', skill: { name: 'code-review', version: '1.0.0' } }] }, { id: 'delivery', name: '创建 PR', goal: 'delivery', steps: [{ id: 'delivery', name: '创建 PR', kind: 'tool', adapter: 'github.pull-request', condition: 'project.remote.present' }] }] } }
    const run = await engine.startRun({ project: { ...project, remote: null }, workflow: localWorkflow, idea: 'Local delivery #10' })
    await vi.waitFor(() => expect(runtime.calls).toHaveLength(1))
    runtime.finish([{ type: 'status_changed', status: 'completed' }])
    await expect(engine.waitForIdle(run.id)).resolves.toMatchObject({ status: 'completed', artifacts: [expect.objectContaining({ type: 'commit' })] })
    expect(runtime.calls).toHaveLength(1)
  })

  it('creates a PR before its Merge Gate and merges only after approval', async () => {
    directory = await mkdtemp(join(tmpdir(), 'agent-space-run-'))
    const runtime = new FakeRuntime()
    const remoteProject: Project = {
      ...project,
      remote: 'https://github.com/example/demo.git',
      permissionPolicy: { grantedPermissions: ['workspace.read', 'workspace.write', 'git.commit', 'network.github'] }
    }
    const deliveryWorkflow: WorkflowView = {
      ...workflow,
      definition: {
        ...workflow.definition,
        phases: [
          { ...workflow.definition.phases[0], steps: [{ id: 'review', name: '自动 Review', kind: 'skill', skill: { name: 'code-review', version: '1.0.0' } }] },
          { id: 'delivery', name: '提交、推送与 PR', goal: 'delivery', steps: [{ id: 'delivery', name: '创建 PR', kind: 'tool', adapter: 'github.pull-request', approvalGate: 'PR 合并确认' }] }
        ]
      }
    }
    const pullRequest = {
      number: 42,
      url: 'https://github.com/example/demo/pull/42',
      title: 'Agent Space: Implement issue #12',
      headBranch: 'main/agent-space/run-1',
      baseBranch: 'main',
      headCommit: 'commit-12',
      checks: [{ name: 'CI', status: 'COMPLETED', conclusion: 'SUCCESS' }],
      reviews: [{ author: 'reviewer', state: 'APPROVED' }],
      mergeable: 'MERGEABLE',
      merged: false,
      mergedAt: null,
      draft: false,
      gate: { checksSatisfied: true, reviewsSatisfied: true, mergeabilitySatisfied: true, canMerge: true, reason: null },
      updatedAt: '2026-08-24T00:00:00.000Z'
    }
    const mergedPullRequest = { ...pullRequest, merged: true, mergedAt: '2026-08-24T00:01:00.000Z', gate: { ...pullRequest.gate, canMerge: false, mergeabilitySatisfied: false, reason: 'Pull Request 已合并。' } }
    const commitAfterReview = vi.fn().mockResolvedValue({ commit: 'commit-12', artifact: { type: 'commit', name: 'commit', runId: 'run-12', location: '/work/demo@commit-12', versionHash: 'commit-12', status: 'available' } })
    const deliverPullRequest = vi.fn().mockResolvedValue({ pullRequest, artifact: { type: 'pull-request', name: 'PR #42', runId: 'run-12', location: pullRequest.url, versionHash: pullRequest.headCommit, status: 'ready' } })
    const mergePullRequest = vi.fn().mockResolvedValue({ pullRequest: mergedPullRequest, artifact: { type: 'pull-request', name: 'PR #42', runId: 'run-12', location: pullRequest.url, versionHash: pullRequest.headCommit, status: 'merged' } })
    engine = createWorkflowEngine({ databasePath: join(directory, 'runs.sqlite'), runtime, runWorkspaceManager: { prepare: vi.fn().mockResolvedValue({ workspacePath: '/work/demo-agent-space/run-12', baseCommit: 'abc123', branch: 'main/agent-space/run-12' }) }, gitDeliveryManager: { commitAfterReview, deliverPullRequest, mergePullRequest, refreshPullRequest: vi.fn().mockResolvedValue(pullRequest), preflightPullRequest: vi.fn().mockResolvedValue(undefined) } })

    const run = await engine.startRun({ project: remoteProject, workflow: deliveryWorkflow, idea: 'Implement issue #12' })
    await vi.waitFor(() => expect(runtime.calls).toHaveLength(1))
    runtime.finish([{ type: 'status_changed', status: 'completed' }])
    const waiting = await engine.waitForIdle(run.id)

    expect(waiting.status).toBe('waiting')
    expect(waiting.pullRequest).toMatchObject({ number: 42, url: pullRequest.url, gate: { canMerge: true } })
    expect(waiting.artifacts).toEqual(expect.arrayContaining([expect.objectContaining({ type: 'pull-request', location: pullRequest.url })]))
    expect(deliverPullRequest).toHaveBeenCalledWith(expect.objectContaining({ branch: 'main/agent-space/run-12', defaultBranch: 'main', remote: remoteProject.remote }))
    expect(mergePullRequest).not.toHaveBeenCalled()

    await engine.approve(run.id)
    const completed = await engine.waitForIdle(run.id)
    expect(mergePullRequest).toHaveBeenCalledWith(expect.objectContaining({ gateApproved: true, pullRequest: expect.objectContaining({ number: 42 }) }))
    expect(completed.status).toBe('completed')
    expect(completed.pullRequest).toMatchObject({ number: 42, merged: true })
  })

  it('keeps the Merge Gate blocked when checks or reviews are not ready', async () => {
    directory = await mkdtemp(join(tmpdir(), 'agent-space-run-'))
    const runtime = new FakeRuntime()
    const remoteProject: Project = {
      ...project,
      remote: 'https://github.com/example/demo.git',
      permissionPolicy: { grantedPermissions: ['workspace.read', 'workspace.write', 'git.commit', 'network.github'] }
    }
    const deliveryWorkflow: WorkflowView = {
      ...workflow,
      definition: { ...workflow.definition, phases: [{ ...workflow.definition.phases[0], steps: [{ id: 'delivery', name: '创建 PR', kind: 'tool', adapter: 'github.pull-request', approvalGate: 'PR 合并确认' }] }] }
    }
    const blockedPullRequest = {
      number: 43, url: 'https://github.com/example/demo/pull/43', title: 'Pending', headBranch: 'main/agent-space/run-2', baseBranch: 'main', headCommit: 'commit-13',
      checks: [{ name: 'CI', status: 'IN_PROGRESS', conclusion: null }], reviews: [], mergeable: 'UNKNOWN', merged: false, mergedAt: null, draft: false,
      gate: { checksSatisfied: false, reviewsSatisfied: false, mergeabilitySatisfied: false, canMerge: false, reason: 'checks 尚未全部通过。等待 1 个 approved review。Pull Request 当前不可合并。' }, updatedAt: '2026-08-24T00:00:00.000Z'
    }
    const deliverPullRequest = vi.fn().mockResolvedValue({ pullRequest: blockedPullRequest, artifact: { type: 'pull-request', name: 'PR #43', runId: 'run-13', location: blockedPullRequest.url, versionHash: blockedPullRequest.headCommit, status: 'pending' } })
    const mergePullRequest = vi.fn()
    engine = createWorkflowEngine({ databasePath: join(directory, 'runs.sqlite'), runtime, gitDeliveryManager: { commitAfterReview: vi.fn(), deliverPullRequest, mergePullRequest, refreshPullRequest: vi.fn().mockResolvedValue({ ...blockedPullRequest, headCommit: 'commit-13' }), preflightPullRequest: vi.fn().mockResolvedValue(undefined) } })

    const run = await engine.startRun({ project: remoteProject, workflow: deliveryWorkflow, idea: 'Wait for checks' })
    const waiting = await engine.waitForIdle(run.id)
    await expect(engine.approve(waiting.id)).rejects.toThrow('Merge Gate 不可批准')
    expect(mergePullRequest).not.toHaveBeenCalled()
    await expect(engine.getRun(run.id)).resolves.toMatchObject({ status: 'waiting', pullRequest: { gate: { canMerge: false } } })
  })

  it('refuses to approve when the remote Pull Request cannot be refreshed', async () => {
    directory = await mkdtemp(join(tmpdir(), 'agent-space-run-'))
    const remoteProject: Project = {
      ...project,
      remote: 'https://github.com/example/demo.git',
      permissionPolicy: { grantedPermissions: ['workspace.read', 'workspace.write', 'git.commit', 'network.github'] }
    }
    const deliveryWorkflow: WorkflowView = {
      ...workflow,
      definition: { ...workflow.definition, phases: [{ ...workflow.definition.phases[0], steps: [{ id: 'delivery', name: '创建 PR', kind: 'tool', adapter: 'github.pull-request', approvalGate: 'PR 合并确认' }] }] }
    }
    const pullRequest = {
      number: 50, url: 'https://github.com/example/demo/pull/50', title: 'Pending refresh', headBranch: 'main/agent-space/run-3', baseBranch: 'main', headCommit: 'commit-14',
      checks: [{ name: 'CI', status: 'COMPLETED', conclusion: 'SUCCESS' }], reviews: [{ author: 'reviewer', state: 'APPROVED' }], mergeable: 'MERGEABLE', merged: false, mergedAt: null, draft: false,
      gate: { checksSatisfied: true, reviewsSatisfied: true, mergeabilitySatisfied: true, canMerge: true, reason: null }, updatedAt: '2026-08-24T00:00:00.000Z'
    }
    const deliverPullRequest = vi.fn().mockResolvedValue({ pullRequest, artifact: { type: 'pull-request', name: 'PR #50', runId: 'run-14', location: pullRequest.url, versionHash: pullRequest.headCommit, status: 'ready' } })
    const refreshPullRequest = vi.fn().mockRejectedValue(new Error('GitHub network unavailable'))
    engine = createWorkflowEngine({ databasePath: join(directory, 'runs.sqlite'), runtime: new FakeRuntime(), gitDeliveryManager: { commitAfterReview: vi.fn(), deliverPullRequest, refreshPullRequest, preflightPullRequest: vi.fn().mockResolvedValue(undefined) } })

    const run = await engine.startRun({ project: remoteProject, workflow: deliveryWorkflow, idea: 'Approve only after refresh' })
    const waiting = await engine.waitForIdle(run.id)

    await expect(engine.approve(waiting.id)).rejects.toThrow('Merge Gate 状态刷新失败')
    expect(refreshPullRequest).toHaveBeenCalled()
  })

  it('fails delivery Preflight when the GitHub remote or CLI is unavailable', async () => {
    directory = await mkdtemp(join(tmpdir(), 'agent-space-run-'))
    const remoteProject: Project = {
      ...project,
      remote: 'git@invalid-alias:example/demo.git',
      permissionPolicy: { grantedPermissions: ['workspace.read', 'workspace.write', 'git.commit', 'network.github'] }
    }
    const deliveryWorkflow: WorkflowView = {
      ...workflow,
      definition: { ...workflow.definition, phases: [{ ...workflow.definition.phases[0], steps: [{ id: 'delivery', name: '创建 PR', kind: 'tool', adapter: 'github.pull-request', approvalGate: 'PR 合并确认' }] }] }
    }
    const preflightPullRequest = vi.fn().mockRejectedValue(new Error('Project remote 不是有效的 GitHub 仓库。'))
    engine = createWorkflowEngine({ databasePath: join(directory, 'runs.sqlite'), runtime: new FakeRuntime(), gitDeliveryManager: { commitAfterReview: vi.fn(), preflightPullRequest } })

    await expect(engine.preflight({ project: remoteProject, workflow: deliveryWorkflow, idea: 'Validate delivery before starting' })).resolves.toMatchObject({
      passed: false,
      errors: [expect.stringContaining('GitHub delivery Preflight 失败')]
    })
    expect(preflightPullRequest).toHaveBeenCalledWith(remoteProject.workspacePath, remoteProject.remote)
  })

  it('shows a GitHub Data Transfer Notice when a later Skill publishes external artifacts', async () => {
    directory = await mkdtemp(join(tmpdir(), 'agent-space-run-'))
    engine = createWorkflowEngine({ databasePath: join(directory, 'runs.sqlite'), runtime: new FakeRuntime() })
    const publishingWorkflow: WorkflowView = {
      ...workflow,
      skillManifests: [{ name: 'to-spec', version: '1.0.0', entry: 'skills/to-spec/SKILL.md', dependencies: [], supportedRuntimes: ['codex'], capabilities: ['artifact'], requiredPermissions: ['workspace.read', 'network.github'] }],
      definition: { ...workflow.definition, phases: [{ ...workflow.definition.phases[0], steps: [{ id: 'spec', name: '形成规格', kind: 'skill', skill: { name: 'to-spec', version: '1.0.0' } }] }] }
    }

    const result = await engine.preflight({ project, workflow: publishingWorkflow, idea: 'Publish a specification' })
    expect(result.checks.some((check) => check.includes('External Destination: GitHub'))).toBe(true)
  })

  it('pauses between Steps and resumes from the durable cursor after restart', async () => {
    directory = await mkdtemp(join(tmpdir(), 'agent-space-run-'))
    const databasePath = join(directory, 'runs.sqlite')
    const runtime = new FakeRuntime()
    engine = createWorkflowEngine({ databasePath, runtime })
    const input = { project, workflow: twoStepWorkflow, idea: 'Pause this Run safely' }
    const run = await engine.startRun(input)

    await vi.waitFor(() => expect(runtime.calls).toHaveLength(1))
    await engine.pauseRun(run.id)
    runtime.finish([{ type: 'status_changed', status: 'completed' }])
    const paused = await engine.waitForIdle(run.id)

    expect(paused.status).toBe('paused')
    expect(paused.snapshot).toMatchObject({ phaseIndex: 0, stepIndex: 1, currentStepExecutionId: null })
    expect(paused.stepExecutions).toHaveLength(1)
    expect(paused.events.map((event) => event.type)).toContain('paused')

    await engine.close()
    const resumedRuntime = new FakeRuntime()
    engine = createWorkflowEngine({ databasePath, runtime: resumedRuntime })
    const resumed = await engine.resumeRun(run.id)
    expect(resumed.status).toBe('running')
    expect(resumed.stepExecutions).toHaveLength(2)
    await vi.waitFor(() => expect(resumedRuntime.calls).toHaveLength(1))
    resumedRuntime.finish([{ type: 'status_changed', status: 'completed' }])
    await expect(engine.waitForIdle(run.id)).resolves.toMatchObject({ status: 'completed' })
  })

  it('restores waiting and blocked Runs, preserves failed attempts, and ignores cancelled results', async () => {
    directory = await mkdtemp(join(tmpdir(), 'agent-space-run-'))
    const databasePath = join(directory, 'runs.sqlite')
    const runtime = new FakeRuntime()
    engine = createWorkflowEngine({ databasePath, runtime })

    const waitingRun = await engine.startRun({ project, workflow, idea: 'Ask the user' })
    await vi.waitFor(() => expect(runtime.calls).toHaveLength(1))
    runtime.finish([{ type: 'question', question: 'Which direction?' }])
    await expect(engine.waitForIdle(waitingRun.id)).resolves.toMatchObject({ status: 'waiting', snapshot: { pendingQuestion: 'Which direction?' } })

    await engine.close()
    const recoveredRuntime = new FakeRuntime()
    engine = createWorkflowEngine({ databasePath, runtime: recoveredRuntime })
    await expect(engine.getRun(waitingRun.id)).resolves.toMatchObject({ status: 'waiting' })
    await engine.answerQuestion(waitingRun.id, 'Proceed')
    await vi.waitFor(() => expect(recoveredRuntime.calls).toHaveLength(1))
    recoveredRuntime.finish([{ type: 'status_changed', status: 'completed' }])
    await expect(engine.waitForIdle(waitingRun.id)).resolves.toMatchObject({ status: 'completed' })

    const blockedRun = await engine.startRun({ project, workflow, idea: 'Wait for a dependency' })
    await vi.waitFor(() => expect(recoveredRuntime.calls).toHaveLength(2))
    recoveredRuntime.finish([{ type: 'status_changed', status: 'blocked' }])
    await expect(engine.waitForIdle(blockedRun.id)).resolves.toMatchObject({ status: 'blocked' })

    const failedRun = await engine.startRun({ project, workflow, idea: 'Retry this Step' })
    await vi.waitFor(() => expect(recoveredRuntime.calls).toHaveLength(3))
    recoveredRuntime.finish([{ type: 'error', error: 'Transient runtime error' }])
    await expect(engine.waitForIdle(failedRun.id)).resolves.toMatchObject({ status: 'failed', stepExecutions: [expect.objectContaining({ attempt: 1, status: 'failed' })] })
    await engine.retryStep(failedRun.id)
    await vi.waitFor(() => expect(recoveredRuntime.calls).toHaveLength(4))
    recoveredRuntime.finish([{ type: 'status_changed', status: 'completed' }])
    await expect(engine.waitForIdle(failedRun.id)).resolves.toMatchObject({
      status: 'completed',
      stepExecutions: [expect.objectContaining({ attempt: 1, status: 'failed' }), expect.objectContaining({ attempt: 2, status: 'completed' })]
    })

    const cancelledRun = await engine.startRun({ project, workflow, idea: 'Cancel this Run' })
    await vi.waitFor(() => expect(recoveredRuntime.calls).toHaveLength(5))
    await engine.cancelRun(cancelledRun.id)
    recoveredRuntime.finish([{ type: 'status_changed', status: 'completed' }])
    await expect(engine.waitForIdle(cancelledRun.id)).resolves.toMatchObject({ status: 'cancelled', events: expect.arrayContaining([expect.objectContaining({ type: 'cancelled' })]) })
  })

  it('persists an approval gate separately from a user question', async () => {
    directory = await mkdtemp(join(tmpdir(), 'agent-space-run-'))
    const runtime = new FakeRuntime()
    engine = createWorkflowEngine({ databasePath: join(directory, 'runs.sqlite'), runtime })

    const run = await engine.startRun({ project, workflow, idea: 'Request approval' })
    await vi.waitFor(() => expect(runtime.calls).toHaveLength(1))
    runtime.finish([{ type: 'approval_required', approval: 'Publish the release?' }])

    await expect(engine.waitForIdle(run.id)).resolves.toMatchObject({
      status: 'waiting',
      snapshot: { pendingQuestion: null, pendingApproval: 'Publish the release?' },
      events: expect.arrayContaining([expect.objectContaining({ type: 'waiting', data: { approval: 'Publish the release?' } })])
    })
  })

  it('enforces an Approval Gate declared by the Workflow Definition', async () => {
    directory = await mkdtemp(join(tmpdir(), 'agent-space-run-'))
    const gatedWorkflow: WorkflowView = {
      ...workflow,
      definition: {
        ...workflow.definition,
        phases: [{
          ...workflow.definition.phases[0],
          steps: [{ ...workflow.definition.phases[0].steps[0], approvalGate: 'Publish the result?' }]
        }]
      }
    }
    engine = createWorkflowEngine({ databasePath: join(directory, 'runs.sqlite'), runtime: createFakeRuntimeAdapter(0) })

    const run = await engine.startRun({ project, workflow: gatedWorkflow, idea: 'Gate this side effect' })
    const waiting = await engine.waitForIdle(run.id)
    expect(waiting.status).toBe('waiting')
    expect(waiting.snapshot.pendingApproval).toBe('Publish the result?')

    await engine.approve(run.id)
    await expect(engine.waitForIdle(run.id)).resolves.toMatchObject({ status: 'completed' })
  })

  it('enforces a declared Approval Gate even when Runtime returns completed directly', async () => {
    directory = await mkdtemp(join(tmpdir(), 'agent-space-run-'))
    const runtime = new FakeRuntime()
    const gatedWorkflow: WorkflowView = {
      ...workflow,
      definition: {
        ...workflow.definition,
        phases: [{ ...workflow.definition.phases[0], steps: [{ ...workflow.definition.phases[0].steps[0], approvalGate: 'Publish the specification?' }] }]
      }
    }
    engine = createWorkflowEngine({ databasePath: join(directory, 'runs.sqlite'), runtime })
    const run = await engine.startRun({ project, workflow: gatedWorkflow, idea: 'Publish only after approval' })
    const waiting = await engine.waitForIdle(run.id)
    expect(waiting).toMatchObject({ status: 'waiting', snapshot: { pendingApproval: 'Publish the specification?' }, artifacts: [] })

    await engine.approve(run.id)
    await vi.waitFor(() => expect(runtime.calls).toHaveLength(1))
    runtime.finish([{ type: 'artifact_produced', artifact: { type: 'specification', name: 'specification', runId: run.id, location: 'https://github.com/example/project/issues/1' } }, { type: 'status_changed', status: 'completed' }])
    await expect(engine.waitForIdle(run.id)).resolves.toMatchObject({ status: 'completed', artifacts: [expect.objectContaining({ location: 'https://github.com/example/project/issues/1' })] })
  })

  it('answers a persisted question from its continuation and records the structured answer', async () => {
    directory = await mkdtemp(join(tmpdir(), 'agent-space-run-'))
    const runtime = new FakeRuntime()
    engine = createWorkflowEngine({ databasePath: join(directory, 'runs.sqlite'), runtime })

    const run = await engine.startRun({ project, workflow, idea: 'Need a decision' })
    await vi.waitFor(() => expect(runtime.calls).toHaveLength(1))
    runtime.finish([{ type: 'question', question: 'Which direction?' }])
    const waiting = await engine.waitForIdle(run.id)
    expect(waiting.snapshot.pendingQuestionDetails).toMatchObject({ question: 'Which direction?', answer: null, continuation: { executionId: waiting.snapshot.currentStepExecutionId } })

    const resumed = await engine.answerQuestion(run.id, 'Use the durable path')
    expect(resumed.status).toBe('running')
    expect(resumed.snapshot.pendingQuestion).toBeNull()
    expect(resumed.snapshot.pendingQuestionDetails).toMatchObject({ answer: 'Use the durable path' })
    expect(resumed.decisionRecords).toEqual(expect.arrayContaining([expect.objectContaining({
      question: 'Which direction?',
      answer: 'Use the durable path',
      executionId: waiting.snapshot.currentStepExecutionId
    })]))
    expect(resumed.events).toEqual(expect.arrayContaining([expect.objectContaining({ type: 'question_answered', data: expect.objectContaining({ answer: 'Use the durable path' }) })]))
    await vi.waitFor(() => expect(runtime.calls).toHaveLength(2))
    runtime.finish([{ type: 'status_changed', status: 'completed' }])
    await expect(engine.waitForIdle(run.id)).resolves.toMatchObject({ status: 'completed' })
  })

  it('passes the durable Discovery inputs to the Runtime Adapter', async () => {
    directory = await mkdtemp(join(tmpdir(), 'agent-space-run-'))
    const runtime = new FakeRuntime()
    engine = createWorkflowEngine({ databasePath: join(directory, 'runs.sqlite'), runtime })

    const run = await engine.startRun({ project, workflow, idea: 'Clarify the product direction' })
    await vi.waitFor(() => expect(runtime.contexts).toHaveLength(1))
    expect(runtime.contexts[0]).toMatchObject({
      workspace: { path: '/work/demo' },
      skill: { name: 'grill-with-docs', version: '1.0.0' },
      phaseContext: null,
      inputArtifacts: [],
      decisionRecords: [],
      permissionPolicy: { grantedPermissions: ['workspace.read', 'workspace.write'] }
    })

    runtime.finish([
      { type: 'text_delta', text: '用户希望优先验证本地工作流。', sessionId: 'thread-1' },
      { type: 'artifact_produced', artifact: { type: 'domain-context', name: 'CONTEXT.md', location: '/work/demo/CONTEXT.md' }, sessionId: 'thread-1' },
      { type: 'question', question: '首个目标用户是谁？', sessionId: 'thread-1' }
    ])
    await engine.waitForIdle(run.id)
    await engine.answerQuestion(run.id, '独立开发者')
    await vi.waitFor(() => expect(runtime.contexts).toHaveLength(2))

    expect(runtime.contexts[1]).toMatchObject({
      workspace: { path: '/work/demo' },
      execution: { runtimeSessionId: 'thread-1' },
      skill: { name: 'grill-with-docs', version: '1.0.0' },
      phaseContext: { phaseId: 'discovery', content: '用户希望优先验证本地工作流。' },
      inputArtifacts: [expect.objectContaining({ name: 'CONTEXT.md', location: '/work/demo/CONTEXT.md' })],
      decisionRecords: [expect.objectContaining({ question: '首个目标用户是谁？', answer: '独立开发者', stepId: 'discover' })],
      permissionPolicy: { grantedPermissions: ['workspace.read', 'workspace.write'] }
    })

    runtime.finish([
      { type: 'artifact_produced', artifact: { type: 'domain-context', name: 'CONTEXT.md', location: '/work/demo/CONTEXT.md' }, sessionId: 'thread-1' },
      { type: 'status_changed', status: 'completed', sessionId: 'thread-1' }
    ])
    await expect(engine.waitForIdle(run.id)).resolves.toMatchObject({ artifacts: [expect.objectContaining({ name: 'CONTEXT.md' })] })
  })

  it('carries Discovery context and decisions into the Requirements Phase', async () => {
    directory = await mkdtemp(join(tmpdir(), 'agent-space-run-'))
    const runtime = new FakeRuntime()
    const multiPhaseWorkflow: WorkflowView = {
      ...workflow,
      definition: {
        ...workflow.definition,
        phases: [
          workflow.definition.phases[0],
          { id: 'requirements', name: 'Requirements', goal: 'Write the specification', steps: [{ id: 'spec', name: 'Write specification', kind: 'skill', skill: { name: 'to-spec', version: '1.0.0' } }] }
        ]
      }
    }
    engine = createWorkflowEngine({ databasePath: join(directory, 'runs.sqlite'), runtime })
    const run = await engine.startRun({ project, workflow: multiPhaseWorkflow, idea: 'Use Discovery context' })
    await vi.waitFor(() => expect(runtime.calls).toHaveLength(1))
    runtime.finish([{ type: 'text_delta', text: '已确认目标用户是独立开发者。' }, { type: 'question', question: '是否保留本地优先？' }])
    const waiting = await engine.waitForIdle(run.id)
    await engine.answerQuestion(waiting.id, '保留本地优先')
    await vi.waitFor(() => expect(runtime.calls).toHaveLength(2))
    expect(runtime.contexts[1]).toMatchObject({ phaseContext: { content: expect.stringContaining('已确认目标用户是独立开发者。') }, decisionRecords: [expect.objectContaining({ answer: '保留本地优先' })] })
    runtime.finish([{ type: 'status_changed', status: 'completed' }])
    await vi.waitFor(() => expect(runtime.calls).toHaveLength(3))
    expect(runtime.contexts[2]).toMatchObject({ phaseContext: { content: expect.stringContaining('已确认目标用户是独立开发者。') }, decisionRecords: [expect.objectContaining({ answer: '保留本地优先' })] })
    runtime.finish([{ type: 'status_changed', status: 'completed' }])
    await expect(engine.waitForIdle(run.id)).resolves.toMatchObject({ status: 'completed' })
  })

  it('rejects an Approval Gate without running the pending Step', async () => {
    directory = await mkdtemp(join(tmpdir(), 'agent-space-run-'))
    const runtime = new FakeRuntime()
    engine = createWorkflowEngine({ databasePath: join(directory, 'runs.sqlite'), runtime })

    const run = await engine.startRun({ project, workflow, idea: 'Request approval' })
    await vi.waitFor(() => expect(runtime.calls).toHaveLength(1))
    runtime.finish([{ type: 'approval_required', approval: 'Publish the release?' }])
    const waiting = await engine.waitForIdle(run.id)
    const rejected = await engine.reject(waiting.id)
    expect(rejected.status).toBe('cancelled')
    expect(rejected.snapshot.pendingApproval).toBeNull()
    expect(rejected.snapshot.pendingApprovalDetails).toMatchObject({ decision: 'rejected' })
    expect(rejected.decisionRecords).toEqual(expect.arrayContaining([expect.objectContaining({
      question: 'Publish the release?',
      answer: 'rejected',
      executionId: waiting.snapshot.currentStepExecutionId
    })]))
    expect(rejected.stepExecutions[0]).toMatchObject({ status: 'cancelled' })
    expect(rejected.events).toEqual(expect.arrayContaining([expect.objectContaining({ type: 'approval_rejected' })]))
    expect(runtime.calls).toHaveLength(1)
  })

  it('persists Phase Context, runtime logs, and an explicit blocked relation', async () => {
    directory = await mkdtemp(join(tmpdir(), 'agent-space-run-'))
    const runtime = new FakeRuntime()
    engine = createWorkflowEngine({ databasePath: join(directory, 'runs.sqlite'), runtime })

    const run = await engine.startRun({ project, workflow, idea: 'Capture run context' })
    await vi.waitFor(() => expect(runtime.calls).toHaveLength(1))
    runtime.finish([
      { type: 'text_delta', text: 'First context fragment.' },
      { type: 'tool_call', name: 'inspect', input: { path: 'CONTEXT.md' } },
      { type: 'status_changed', status: 'blocked' }
    ])

    const blocked = await engine.waitForIdle(run.id)
    expect(blocked.snapshot.blockedBy).toMatchObject({
      executionId: blocked.snapshot.currentStepExecutionId,
      reason: 'Runtime 报告当前 Step blocked。'
    })
    expect(blocked.phaseContexts).toEqual(expect.arrayContaining([expect.objectContaining({
      phaseId: 'discovery',
      content: 'First context fragment.'
    })]))
    expect(blocked.logs).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'text_delta', message: 'First context fragment.' }),
      expect.objectContaining({ type: 'tool_call', message: 'inspect' }),
      expect.objectContaining({ type: 'status_changed', message: 'blocked' })
    ]))

    const resumed = await engine.resumeRun(run.id)
    expect(resumed.snapshot.blockedBy).toBeNull()
  })

  it('does not execute or mutate a Run when an action is not currently allowed', async () => {
    directory = await mkdtemp(join(tmpdir(), 'agent-space-run-'))
    const runtime = new FakeRuntime()
    engine = createWorkflowEngine({ databasePath: join(directory, 'runs.sqlite'), runtime })

    const run = await engine.startRun({ project, workflow, idea: 'Reject invalid actions' })
    const paused = await engine.pauseRun(run.id)
    const answered = await engine.answerQuestion(run.id, 'Should not apply')

    expect(paused.status).toBe('paused')
    expect(answered).toEqual(paused)
    expect(runtime.calls).toHaveLength(1)
  })

  it('recovers an in-progress Run after an application restart', async () => {
    directory = await mkdtemp(join(tmpdir(), 'agent-space-run-'))
    const databasePath = join(directory, 'runs.sqlite')
    const firstRuntime = new FakeRuntime()
    engine = createWorkflowEngine({ databasePath, runtime: firstRuntime })
    const run = await engine.startRun({ project, workflow, idea: 'Recover this Run' })
    await vi.waitFor(() => expect(firstRuntime.calls).toHaveLength(1))

    await engine.close()
    const recoveredRuntime = new FakeRuntime()
    engine = createWorkflowEngine({ databasePath, runtime: recoveredRuntime })
    await engine.recover()
    await vi.waitFor(() => expect(recoveredRuntime.calls).toHaveLength(1))
    recoveredRuntime.finish([{ type: 'status_changed', status: 'completed' }])

    await expect(engine.waitForIdle(run.id)).resolves.toMatchObject({ status: 'completed' })
  })

  it('can resume a blocked fake Run after an application restart', async () => {
    directory = await mkdtemp(join(tmpdir(), 'agent-space-run-'))
    const databasePath = join(directory, 'runs.sqlite')
    engine = createWorkflowEngine({ databasePath, runtime: createFakeRuntimeAdapter(0) })
    const run = await engine.startRun({ project, workflow, idea: '[blocked] recover this Run' })
    await expect(engine.waitForIdle(run.id)).resolves.toMatchObject({ status: 'blocked' })

    await engine.close()
    engine = createWorkflowEngine({ databasePath, runtime: createFakeRuntimeAdapter(0) })
    await expect(engine.resumeRun(run.id)).resolves.toMatchObject({ status: 'running' })
    await expect(engine.waitForIdle(run.id)).resolves.toMatchObject({ status: 'completed' })
  })

  it('skips a conditional Planning Step with a durable reason and can recover it', async () => {
    directory = await mkdtemp(join(tmpdir(), 'agent-space-run-'))
    const runtime = new FakeRuntime()
    const conditionalWorkflow: WorkflowView = {
      ...workflow,
      definition: {
        ...workflow.definition,
        phases: [{
          ...workflow.definition.phases[0],
          steps: [
            { ...workflow.definition.phases[0].steps[0], artifacts: ['specification'] },
            { id: 'tickets', name: 'Planning', kind: 'skill', condition: 'planning.required' }
          ]
        }]
      }
    }
    engine = createWorkflowEngine({ databasePath: join(directory, 'runs.sqlite'), runtime })

    const run = await engine.startRun({ project, workflow: conditionalWorkflow, idea: 'Small change' })
    await vi.waitFor(() => expect(runtime.calls).toHaveLength(1))
    runtime.finish([{ type: 'artifact_produced', artifact: { type: 'specification', name: 'specification', status: 'skip-planning' } }, { type: 'status_changed', status: 'completed' }])

    const skipped = await engine.waitForIdle(run.id)
    expect(skipped.status).toBe('completed')
    expect(skipped.stepExecutions).toEqual(expect.arrayContaining([
      expect.objectContaining({ stepId: 'tickets', status: 'skipped', output: { reason: '根据规格结果跳过 Planning。' } })
    ]))
    expect(skipped.events).toEqual(expect.arrayContaining([expect.objectContaining({ type: 'step_skipped', data: expect.objectContaining({ stepId: 'tickets', reason: '根据规格结果跳过 Planning。' }) })]))

    await engine.retryStep(run.id)
    await vi.waitFor(() => expect(runtime.calls).toHaveLength(2))
    runtime.finish([{ type: 'status_changed', status: 'completed' }])
    await expect(engine.waitForIdle(run.id)).resolves.toMatchObject({ status: 'completed', stepExecutions: expect.arrayContaining([expect.objectContaining({ stepId: 'tickets', status: 'completed', attempt: 2 })]) })
  })
})
