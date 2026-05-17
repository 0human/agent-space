import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createDatabaseHandle, type DatabaseHandle } from '../db/client'
import { createRepositories } from '../db/repositories'
import { ProjectService } from '../projects/projectService'
import type {
  ProcessRunOptions,
  ProcessRunner,
  ProcessRunResult,
  RuntimeAdapter,
  RuntimeStartPlanInput,
  RunningProcess
} from '../runtime'
import { RuntimeRegistryService } from '../runtime'
import { SessionService } from './sessionService'

const handles: DatabaseHandle[] = []

class FakeProcessRunner implements ProcessRunner {
  lastStartOptions?: ProcessRunOptions

  constructor(private readonly result: ProcessRunResult) {}

  start(_command: string, _args: string[], options?: ProcessRunOptions): RunningProcess {
    this.lastStartOptions = options
    if (this.result.stdout) {
      options?.onStdoutChunk?.(this.result.stdout)
    }
    if (this.result.stderr) {
      options?.onStderrChunk?.(this.result.stderr)
    }

    return {
      result: Promise.resolve(this.result),
      stop: () => undefined
    }
  }

  run(command: string, args: string[], options?: ProcessRunOptions): Promise<ProcessRunResult> {
    return this.start(command, args, options).result
  }
}

class ControllableProcessRunner implements ProcessRunner {
  private resolveResult?: (result: ProcessRunResult) => void

  start(command: string, args: string[], options?: ProcessRunOptions): RunningProcess {
    void command
    void args
    void options
    return {
      result: new Promise<ProcessRunResult>((resolve) => {
        this.resolveResult = resolve
      }),
      stop: () => {
        this.resolveResult?.({
          exitCode: null,
          stdout: '',
          stderr: '',
          error: Object.assign(new Error('Process stopped by user.'), { code: 'STOPPED' })
        })
      }
    }
  }

  run(_command: string, _args: string[], options?: ProcessRunOptions): Promise<ProcessRunResult> {
    return this.start(_command, _args, options).result
  }
}

class ResumeAwareCustomAdapter implements RuntimeAdapter {
  readonly provider = 'custom_cli'
  readonly supportsExternalSessionResume = true

  createStartPlan(input: RuntimeStartPlanInput) {
    return {
      command: input.runtime.executablePath ?? '/bin/echo',
      args: input.resumeExternalSessionId ? ['--resume', input.resumeExternalSessionId] : [],
      cwd: input.projectLocalPath,
      stdin: input.prompt,
      inputEnvelope: {
        version: 1 as const,
        provider: 'custom_cli' as const,
        workSessionId: input.session.id,
        title: input.session.title,
        goal: input.session.goal ?? undefined,
        prompt: input.prompt,
        resumeExternalSessionId: input.resumeExternalSessionId
      },
      resumeExternalSessionId: input.resumeExternalSessionId,
      supportsExternalSessionResume: this.supportsExternalSessionResume
    }
  }

  extractAssistantMessage(stdout: string): string | undefined {
    return stdout.trim() || undefined
  }
}

function createServices() {
  const dir = mkdtempSync(join(tmpdir(), 'agent-space-sessions-'))
  const handle = createDatabaseHandle(join(dir, 'test.sqlite'))
  const repositories = createRepositories(handle.db)
  handles.push(handle)

  const processRunner = new FakeProcessRunner({
    exitCode: 0,
    stdout: 'assistant reply\n',
    stderr: ''
  })

  return {
    repositories,
    projectService: new ProjectService(handle.db),
    processRunner,
    sessionService: new SessionService(handle.db, processRunner)
  }
}

function createServicesWithRunner(result: ProcessRunResult) {
  const dir = mkdtempSync(join(tmpdir(), 'agent-space-sessions-'))
  const handle = createDatabaseHandle(join(dir, 'test.sqlite'))
  const repositories = createRepositories(handle.db)
  handles.push(handle)

  return {
    repositories,
    projectService: new ProjectService(handle.db),
    sessionService: new SessionService(handle.db, new FakeProcessRunner(result))
  }
}

function createServicesWithProcessRunner(processRunner: ProcessRunner) {
  const dir = mkdtempSync(join(tmpdir(), 'agent-space-sessions-'))
  const handle = createDatabaseHandle(join(dir, 'test.sqlite'))
  const repositories = createRepositories(handle.db)
  handles.push(handle)

  return {
    repositories,
    projectService: new ProjectService(handle.db),
    sessionService: new SessionService(handle.db, processRunner)
  }
}

function createServicesWithRegistry(
  processRunner: ProcessRunner,
  registry: RuntimeRegistryService
) {
  const dir = mkdtempSync(join(tmpdir(), 'agent-space-sessions-'))
  const handle = createDatabaseHandle(join(dir, 'test.sqlite'))
  const repositories = createRepositories(handle.db)
  handles.push(handle)

  return {
    repositories,
    projectService: new ProjectService(handle.db),
    sessionService: new SessionService(handle.db, processRunner, registry)
  }
}

afterEach(() => {
  while (handles.length > 0) {
    handles.pop()?.sqlite.close()
  }
})

describe('SessionService', () => {
  it('creates a manual session and refreshes project metrics', () => {
    const { projectService, sessionService } = createServices()
    const project = projectService.create({
      name: 'Manual Project',
      localPath: '/tmp/manual-project'
    }).project

    const session = sessionService.create({
      projectId: project.id,
      title: 'Planning'
    })

    expect(session).toEqual(
      expect.objectContaining({
        title: 'Planning',
        assignmentMode: 'manual',
        activeAssigneeType: 'user',
        messageCount: 0
      })
    )
    expect(projectService.get(project.id).metrics?.activeSessionCount).toBe(1)
  })

  it('stores user messages without rewriting history', () => {
    const { projectService, sessionService } = createServices()
    const project = projectService.create({
      name: 'Message Project',
      localPath: '/tmp/message-project'
    }).project
    const session = sessionService.create({
      projectId: project.id,
      title: 'Build'
    })

    const first = sessionService.addMessage({
      workSessionId: session.id,
      content: 'Implement the session page.'
    })
    sessionService.addMessage({
      workSessionId: session.id,
      content: 'Keep this as a separate user turn.'
    })

    const messages = sessionService.listMessages({ workSessionId: session.id })

    expect(messages).toHaveLength(2)
    expect(messages[0]).toEqual(
      expect.objectContaining({
        id: first.id,
        role: 'user',
        content: 'Implement the session page.'
      })
    )
    expect(sessionService.get(session.id).messageCount).toBe(2)
  })

  it('switches the active member without rewriting existing messages', () => {
    const { repositories, projectService, sessionService } = createServices()
    const runtimeA = repositories.runtimes.create({
      name: 'Runtime A',
      provider: 'custom_cli',
      executablePath: '/bin/echo'
    })
    const runtimeB = repositories.runtimes.create({
      name: 'Runtime B',
      provider: 'custom_cli',
      executablePath: '/bin/echo'
    })
    const team = repositories.teams.create({ name: 'Delivery Team' })
    const firstMember = repositories.teamMembers.create({
      teamId: team.id,
      name: 'Developer',
      role: 'developer',
      runtimeConfigId: runtimeA.id,
      enabled: 1,
      sortOrder: 0
    })
    const secondMember = repositories.teamMembers.create({
      teamId: team.id,
      name: 'Reviewer',
      role: 'reviewer',
      runtimeConfigId: runtimeB.id,
      enabled: 1,
      sortOrder: 1
    })
    const project = projectService.create({
      name: 'Switch Project',
      localPath: '/tmp/switch-project',
      defaultAiTeamId: team.id
    }).project
    const session = sessionService.create({
      projectId: project.id,
      title: 'Review handover'
    })
    const originalMessage = sessionService.addMessage({
      workSessionId: session.id,
      content: 'Implement the feature first.'
    })

    const switched = sessionService.switchMember({
      workSessionId: session.id,
      toAiTeamMemberId: secondMember.id,
      content: 'Reviewer takes over from here.'
    })
    const nextMessage = sessionService.addMessage({
      workSessionId: session.id,
      content: 'Please review the implementation.'
    })
    const messages = sessionService.listMessages({ workSessionId: session.id })

    expect(session.aiTeamMemberId).toBe(firstMember.id)
    expect(switched.aiTeamMemberId).toBe(secondMember.id)
    expect(switched.aiRuntimeConfigId).toBe(runtimeB.id)
    expect(messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: originalMessage.id,
          eventType: 'message',
          aiTeamMemberId: firstMember.id
        }),
        expect.objectContaining({
          eventType: 'member_switch',
          fromAiTeamMemberId: firstMember.id,
          toAiTeamMemberId: secondMember.id,
          content: 'Reviewer takes over from here.'
        }),
        expect.objectContaining({
          id: nextMessage.id,
          eventType: 'message',
          aiTeamMemberId: secondMember.id
        })
      ])
    )
  })

  it('creates a linked child session when handing off to another member', () => {
    const { repositories, projectService, sessionService } = createServices()
    const runtimeA = repositories.runtimes.create({
      name: 'Runtime A',
      provider: 'custom_cli',
      executablePath: '/bin/echo'
    })
    const runtimeB = repositories.runtimes.create({
      name: 'Runtime B',
      provider: 'custom_cli',
      executablePath: '/bin/echo'
    })
    const team = repositories.teams.create({ name: 'Build Team' })
    repositories.teamMembers.create({
      teamId: team.id,
      name: 'Implementer',
      role: 'developer',
      runtimeConfigId: runtimeA.id,
      enabled: 1,
      sortOrder: 0
    })
    const reviewer = repositories.teamMembers.create({
      teamId: team.id,
      name: 'Reviewer',
      role: 'reviewer',
      runtimeConfigId: runtimeB.id,
      enabled: 1,
      sortOrder: 1
    })
    const project = projectService.create({
      name: 'Handoff Project',
      localPath: '/tmp/handoff-project',
      defaultAiTeamId: team.id
    }).project
    const sourceSession = sessionService.create({
      projectId: project.id,
      title: 'Implementation'
    })
    sessionService.update({ id: sourceSession.id, status: 'completed' })

    const result = sessionService.handoff({
      workSessionId: sourceSession.id,
      toAiTeamMemberId: reviewer.id,
      content: 'Review this implementation in a separate window.',
      mode: 'new_linked_session',
      newSessionTitle: 'Review'
    })

    expect(result.sourceSession.id).toBe(sourceSession.id)
    expect(result.sourceSession.status).toBe('completed')
    expect(result.targetSession).toEqual(
      expect.objectContaining({
        title: 'Review',
        parentWorkSessionId: sourceSession.id,
        aiTeamMemberId: reviewer.id,
        aiRuntimeConfigId: runtimeB.id,
        status: 'idle'
      })
    )
    expect(result.handoffMessage).toEqual(
      expect.objectContaining({
        workSessionId: result.targetSession.id,
        eventType: 'handoff',
        toAiTeamMemberId: reviewer.id
      })
    )
    expect(sessionService.list({ projectId: project.id })).toHaveLength(2)
  })

  it('archives a session and removes it from the default list', () => {
    const { projectService, sessionService } = createServices()
    const project = projectService.create({
      name: 'Archive Project',
      localPath: '/tmp/archive-project'
    }).project
    const session = sessionService.create({
      projectId: project.id,
      title: 'Old session'
    })

    const archived = sessionService.archive({ id: session.id })

    expect(archived.archivedAt).toBeTruthy()
    expect(sessionService.list()).toEqual([])
    expect(sessionService.list({ archived: true })).toHaveLength(1)
  })

  it('creates run, events, and assistant output when sending a message succeeds', async () => {
    const { repositories, projectService, processRunner, sessionService } = createServices()
    const runtime = repositories.runtimes.create({
      name: 'Echo Runtime',
      provider: 'custom_cli',
      executablePath: '/bin/echo',
      defaultArgsJson: JSON.stringify(['assistant reply'])
    })
    const project = projectService.create({
      name: 'Run Project',
      localPath: '/tmp/run-project',
      defaultAiRuntimeConfigId: runtime.id
    }).project
    const session = sessionService.create({
      projectId: project.id,
      title: 'Run it'
    })

    const result = await sessionService.sendMessage({
      workSessionId: session.id,
      content: 'Say something'
    })

    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(result.run.status).toBe('running')
    expect(result.run.cwd).toBe('/tmp/run-project')
    expect(processRunner.lastStartOptions?.cwd).toBe('/tmp/run-project')
    expect(processRunner.lastStartOptions?.stdin).toContain('"prompt": "Say something"')
    expect(sessionService.listRuns(session.id)).toHaveLength(1)
    expect(sessionService.listEvents(result.run.id)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'stdout_chunk', content: 'assistant reply' }),
        expect.objectContaining({ type: 'run_started' }),
        expect.objectContaining({ type: 'run_completed' })
      ])
    )
    expect(sessionService.listMessages({ workSessionId: session.id }).at(-1)?.content).toBe(
      'assistant reply'
    )
    expect(sessionService.listMessages({ workSessionId: session.id })[0]).toEqual(
      expect.objectContaining({
        inputSummary: expect.objectContaining({
          source: 'session_send_message',
          provider: 'custom_cli',
          runtimeConfigId: runtime.id
        }),
        inputEnvelopeSnapshot: expect.objectContaining({
          version: 1,
          provider: 'custom_cli',
          workSessionId: session.id,
          prompt: 'Say something'
        })
      })
    )
    expect(sessionService.get(session.id).status).toBe('completed')
  })

  it('records failed runs and error messages when execution fails', async () => {
    const { repositories, projectService, sessionService } = createServicesWithRunner({
      exitCode: 1,
      stdout: '',
      stderr: 'boom'
    })
    const runtime = repositories.runtimes.create({
      name: 'Fail Runtime',
      provider: 'custom_cli',
      executablePath: '/bin/false'
    })
    const project = projectService.create({
      name: 'Fail Project',
      localPath: '/tmp/fail-project',
      defaultAiRuntimeConfigId: runtime.id
    }).project
    const session = sessionService.create({
      projectId: project.id,
      title: 'Fail it'
    })

    const result = await sessionService.sendMessage({
      workSessionId: session.id,
      content: 'This should fail'
    })

    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(result.run.status).toBe('running')
    expect(sessionService.listEvents(result.run.id)).toEqual(
      expect.arrayContaining([expect.objectContaining({ type: 'stderr_chunk', content: 'boom' })])
    )
    expect(sessionService.listMessages({ workSessionId: session.id }).at(-1)?.content).toContain(
      'boom'
    )
    expect(sessionService.get(session.id).status).toBe('error')
  })

  it('stops an active run and marks it as stopped', async () => {
    const runner = new ControllableProcessRunner()
    const { repositories, projectService, sessionService } = createServicesWithProcessRunner(runner)
    const runtime = repositories.runtimes.create({
      name: 'Long Runtime',
      provider: 'custom_cli',
      executablePath: '/bin/sleep'
    })
    const project = projectService.create({
      name: 'Stop Project',
      localPath: '/tmp/stop-project',
      defaultAiRuntimeConfigId: runtime.id
    }).project
    const session = sessionService.create({
      projectId: project.id,
      title: 'Stop it'
    })

    const sendPromise = sessionService.sendMessage({
      workSessionId: session.id,
      content: 'Run until stopped'
    })

    const runBeforeStop = sessionService.listRuns(session.id)[0]
    expect(runBeforeStop.status).toBe('running')

    sessionService.stopRun({ workSessionId: session.id })
    await sendPromise

    const stoppedRun = sessionService.listRuns(session.id)[0]
    expect(stoppedRun.status).toBe('stopped')
    expect(stoppedRun.errorSummary).toContain('stopped by user')
    expect(sessionService.get(session.id).status).toBe('idle')
    expect(sessionService.listEvents(stoppedRun.id)).toEqual(
      expect.arrayContaining([expect.objectContaining({ type: 'run_stopped' })])
    )
  })

  it('blocks a second send while a run is active', async () => {
    const runner = new ControllableProcessRunner()
    const { repositories, projectService, sessionService } = createServicesWithProcessRunner(runner)
    const runtime = repositories.runtimes.create({
      name: 'Busy Runtime',
      provider: 'custom_cli',
      executablePath: '/bin/sleep'
    })
    const project = projectService.create({
      name: 'Busy Project',
      localPath: '/tmp/busy-project',
      defaultAiRuntimeConfigId: runtime.id
    }).project
    const session = sessionService.create({
      projectId: project.id,
      title: 'Busy'
    })

    const sendPromise = sessionService.sendMessage({
      workSessionId: session.id,
      content: 'First run'
    })

    await expect(
      sessionService.sendMessage({
        workSessionId: session.id,
        content: 'Second run'
      })
    ).rejects.toThrow('already has an active Runtime Run')

    sessionService.stopRun({ workSessionId: session.id })
    await sendPromise
  })

  it('lets runtime adapters decide whether to pass resume session ids', async () => {
    const processRunner = new FakeProcessRunner({
      exitCode: 0,
      stdout: 'resumed\n',
      stderr: ''
    })
    const registry = new RuntimeRegistryService([new ResumeAwareCustomAdapter()])
    const { repositories, projectService, sessionService } = createServicesWithRegistry(
      processRunner,
      registry
    )
    const runtime = repositories.runtimes.create({
      name: 'Resume Runtime',
      provider: 'custom_cli',
      executablePath: '/bin/echo'
    })
    const project = projectService.create({
      name: 'Resume Project',
      localPath: '/tmp/resume-project',
      defaultAiRuntimeConfigId: runtime.id
    }).project
    const session = sessionService.create({
      projectId: project.id,
      title: 'Resume'
    })

    const result = await sessionService.sendMessage({
      workSessionId: session.id,
      content: 'Continue',
      resumeExternalSessionId: 'external-123'
    })

    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(result.run.args).toEqual(['--resume', 'external-123'])
    expect(processRunner.lastStartOptions?.stdin).toBe('Continue')
    expect(sessionService.listMessages({ workSessionId: session.id })[0]).toEqual(
      expect.objectContaining({
        inputSummary: expect.objectContaining({
          supportsExternalSessionResume: true
        }),
        inputEnvelopeSnapshot: expect.objectContaining({
          resumeExternalSessionId: 'external-123'
        })
      })
    )
  })
})
