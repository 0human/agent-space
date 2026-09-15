// @vitest-environment node

import { execFile as execFileCallback } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, readdir, rename, rm, unlink, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { APP_SHELL_CHANNELS } from '../shared/app-shell'
import type { Project, ProjectImportResult } from '../shared/project'
import { BUILT_IN_DEVELOPMENT_WORKFLOW, type WorkflowView } from '../shared/workflow'
import type { WorkflowPreflightResult, WorkflowRunActionResult } from '../shared/workflow-run'
import { registerProjectHandlers } from './project-handlers'
import { createDefaultGitExecutor, createProjectService } from './project-service'
import { createWorkflowEngine, type WorkflowEngine } from './workflow-engine'
import { registerWorkflowHandlers } from './workflow-handlers'

const execFile = promisify(execFileCallback)

// Include Git metadata and hidden configuration, not just tracked source files.
async function directoryContents(directory: string): Promise<Record<string, string>> {
  const contents: Record<string, string> = {}
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) {
      contents[`${entry.name}/`] = 'directory'
      for (const [child, hash] of Object.entries(await directoryContents(path))) {
        contents[`${entry.name}/${child}`] = hash
      }
    } else {
      contents[entry.name] = createHash('sha256').update(await readFile(path)).digest('hex')
    }
  }
  return contents
}

describe('local Project import through IPC with real filesystem and Git', () => {
  let directory: string

  afterEach(async () => {
    if (directory) await rm(directory, { recursive: true, force: true })
  })

  async function setup() {
    directory = await mkdtemp(join(tmpdir(), 'agent-space-project-import-'))
    const workspacePath = join(directory, 'workspace')
    const userDataPath = join(directory, 'app-data')
    await mkdir(workspacePath)
    let saveFailure: 'write' | 'rename' | null = null
    const service = createProjectService({
      readFile, unlink,
      writeFile: async (path, data, encoding) => {
        if (saveFailure === 'write') {
          saveFailure = null
          await writeFile(path, 'partial registry', encoding)
          throw new Error('Registration interrupted')
        }
        await writeFile(path, data, encoding)
      },
      rename: async (source, destination) => {
        if (saveFailure === 'rename') {
          saveFailure = null
          throw new Error('Registration interrupted')
        }
        await rename(source, destination)
      },
      mkdir: async (path, options) => { await mkdir(path, options) },
      execGit: createDefaultGitExecutor()
    })
    const handlers = new Map<string, (...args: unknown[]) => unknown>()
    registerProjectHandlers({
      handle: (channel, listener) => { handlers.set(channel, listener) },
      dialog: {
        showOpenDialog: async () => ({ canceled: false, filePaths: [workspacePath] }),
        showMessageBox: async () => ({ response: 0 })
      },
      openInIde: vi.fn(), userDataPath, service
    })
    return {
      workspacePath,
      userDataPath,
      connectWorkflow: (engine: WorkflowEngine) => {
        const workflow: WorkflowView = {
          definition: BUILT_IN_DEVELOPMENT_WORKFLOW,
          source: 'built-in', path: null,
          validation: { valid: true, errors: [], warnings: [] },
          canStart: true, skillManifests: []
        }
        registerWorkflowHandlers({
          handle: (channel, listener) => { handlers.set(channel, listener) },
          projectService: service,
          workflowService: {
            getBuiltIn: async () => workflow,
            loadProject: async () => workflow,
            copyToProject: vi.fn(), startProjectRun: vi.fn()
          },
          workflowEngine: engine, userDataPath
        })
        return {
          preflight: (projectId: string) => handlers.get(APP_SHELL_CHANNELS.preflightWorkflowRun)!({}, projectId, 'Continue this project') as Promise<WorkflowPreflightResult>,
          start: (projectId: string) => handlers.get(APP_SHELL_CHANNELS.startWorkflowRun)!({}, projectId, 'Continue this project') as Promise<WorkflowRunActionResult>
        }
      },
      failNextSave: (stage: 'write' | 'rename') => { saveFailure = stage },
      git: async (...args: string[]) => (await execFile('git', ['-C', workspacePath, ...args])).stdout.trim(),
      importProject: () => handlers.get(APP_SHELL_CHANNELS.importProject)!() as Promise<ProjectImportResult>,
      listProjects: () => handlers.get(APP_SHELL_CHANNELS.listProjects)!() as Promise<Project[]>
    }
  }

  it('registers an existing Git repository without refreshing its index or changing any files', async () => {
    const { workspacePath, git, importProject, listProjects } = await setup()
    await git('init', '--initial-branch=main')
    await git('config', 'core.autocrlf', 'false')
    await writeFile(join(workspacePath, 'README.md'), '# Existing project\n')
    await git('add', 'README.md')
    await git('-c', 'user.name=Test', '-c', 'user.email=test@example.com', '-c', 'commit.gpgSign=false', 'commit', '-m', 'Initial')
    const head = await git('rev-parse', 'HEAD')
    // Same content, different stat data: ordinary git status would rewrite .git/index.
    await utimes(join(workspacePath, 'README.md'), new Date('2020-01-01'), new Date('2020-01-01'))
    const before = await directoryContents(workspacePath)

    const result = await importProject()

    expect(result.project).toMatchObject({ workspacePath, currentBranch: 'main', head, isGreenfield: false, dirty: false })
    expect(await listProjects()).toMatchObject([{ id: result.project.id, workspacePath, currentBranch: 'main', head, dirty: false }])
    expect(await directoryContents(workspacePath)).toEqual(before)
  })

  it('registers a non-empty non-Git directory once and preserves existing project configuration', async () => {
    const { workspacePath, importProject, listProjects } = await setup()
    await writeFile(join(workspacePath, 'README.md'), '# My project\n')
    await mkdir(join(workspacePath, '.agent-space'))
    await writeFile(join(workspacePath, '.agent-space', 'workflow.json'), '{"custom":"keep as-is"}\n')
    const before = await directoryContents(workspacePath)

    const first = await importProject()
    const repeated = await importProject()

    expect(first.project).toMatchObject({ workspacePath, isGreenfield: true, dirty: true, head: null, currentBranch: null })
    expect(first.project.dirtySummary.files.sort()).toEqual(['.agent-space', 'README.md'])
    expect(repeated.project.id).toBe(first.project.id)
    expect(repeated.notice).toBe('该 Workspace 已登记为 Project，已打开现有 Project，没有创建重复记录。')
    expect(await listProjects()).toMatchObject([{ id: first.project.id, workspacePath }])
    expect(await directoryContents(workspacePath)).toEqual(before)
  })

  it('preserves staged, unstaged and untracked files and exposes their baseline in later Run Preflight', async () => {
    const { workspacePath, git, importProject, connectWorkflow } = await setup()
    await git('init', '--initial-branch=existing-work')
    await git('config', 'core.autocrlf', 'false')
    await writeFile(join(workspacePath, 'README.md'), '# Original\n')
    await git('add', 'README.md')
    await git('-c', 'user.name=Test', '-c', 'user.email=test@example.com', '-c', 'commit.gpgSign=false', 'commit', '-m', 'Initial')
    const head = await git('rev-parse', 'HEAD')
    await writeFile(join(workspacePath, 'README.md'), '# Staged\n')
    await git('add', 'README.md')
    await writeFile(join(workspacePath, 'README.md'), '# Unstaged\n')
    await writeFile(join(workspacePath, 'notes.md'), 'Untracked notes\n')
    const before = await directoryContents(workspacePath)

    const result = await importProject()
    expect(result.warning).toContain('不会 stash、reset 或丢弃这些修改')
    expect(result.project).toMatchObject({
      currentBranch: 'existing-work', head, dirty: true,
      dirtySummary: { staged: 1, unstaged: 1, untracked: 1, files: ['README.md', 'notes.md'] }
    })

    // A later Preflight reads fresh state, including files added after registration.
    await writeFile(join(workspacePath, 'later.md'), 'Added after registration\n')
    const execute = vi.fn()
    const engine = createWorkflowEngine({ databasePath: join(directory, 'runs.sqlite'), runtime: { execute } })
    const workflow = connectWorkflow(engine)
    try {
      const preflight = await workflow.preflight(result.project.id)
      expect(preflight.checks).toContain(
        `Workspace 基线：branch existing-work；HEAD ${head}；Dirty Workspace（staged 1，unstaged 1，untracked 2）；未提交文件：README.md, later.md, notes.md。`
      )
      expect(await engine.getProjectRun(result.project.id)).toBeNull()
      expect(execute).not.toHaveBeenCalled()
    } finally {
      await engine.close()
    }
    const after = await directoryContents(workspacePath)
    delete after['later.md']
    expect(after).toEqual(before)
  })

  it('refreshes branch, HEAD and clean-to-dirty changes through Preflight without listing Projects', async () => {
    const { workspacePath, userDataPath, git, importProject, connectWorkflow } = await setup()
    await git('init', '--initial-branch=main')
    await git('-c', 'user.name=Test', '-c', 'user.email=test@example.com', '-c', 'commit.gpgSign=false', 'commit', '--allow-empty', '-m', 'Initial')
    const { project } = await importProject()
    expect(project.dirty).toBe(false)
    await git('checkout', '-b', 'continued-work')
    await git('-c', 'user.name=Test', '-c', 'user.email=test@example.com', '-c', 'commit.gpgSign=false', 'commit', '--allow-empty', '-m', 'Continue')
    const head = await git('rev-parse', 'HEAD')
    expect(head).not.toBe(project.head)
    await writeFile(join(workspacePath, 'later.md'), 'New work\n')
    const before = await directoryContents(workspacePath)
    const registryBefore = await directoryContents(userDataPath)
    const engine = createWorkflowEngine({ databasePath: join(directory, 'runs.sqlite'), runtime: { execute: vi.fn() } })
    try {
      const preflight = await connectWorkflow(engine).preflight(project.id)
      expect(preflight.checks).toContain(
        `Workspace 基线：branch continued-work；HEAD ${head}；Dirty Workspace（staged 0，unstaged 0，untracked 1）；未提交文件：later.md。`
      )
      expect(await directoryContents(workspacePath)).toEqual(before)
      expect(await directoryContents(userDataPath)).toEqual(registryBefore)
    } finally {
      await engine.close()
    }
  })

  it('blocks Preflight and starting a Run when the registered Workspace goes offline, then recovers', async () => {
    const { workspacePath, importProject, connectWorkflow } = await setup()
    const { project } = await importProject()
    const movedPath = join(directory, 'moved-workspace')
    await rename(workspacePath, movedPath)
    const execute = vi.fn()
    const engine = createWorkflowEngine({ databasePath: join(directory, 'runs.sqlite'), runtime: { execute } })
    const workflow = connectWorkflow(engine)
    try {
      const preflight = await workflow.preflight(project.id)
      expect(preflight.passed).toBe(false)
      expect(preflight.errors).toContain('Project Workspace 不可访问。')
      expect(await workflow.start(project.id)).toMatchObject({ ok: false, run: null })
      expect(await engine.getProjectRun(project.id)).toBeNull()
      expect(execute).not.toHaveBeenCalled()
      await rename(movedPath, workspacePath)
      const recovered = await workflow.preflight(project.id)
      expect(recovered.passed).toBe(true)
    } finally {
      await engine.close()
    }
  })

  it.each(['write', 'rename'] as const)('keeps the Workspace and registry intact after a %s failure and allows retry', async (stage) => {
    const { workspacePath, userDataPath, failNextSave, importProject, listProjects } = await setup()
    await writeFile(join(workspacePath, 'notes.md'), 'Keep my work\n')
    await expect(listProjects()).resolves.toEqual([])
    const workspaceBefore = await directoryContents(workspacePath)
    const registryBefore = await directoryContents(userDataPath)
    failNextSave(stage)

    await expect(importProject()).rejects.toThrow('Registration interrupted')

    expect(await directoryContents(workspacePath)).toEqual(workspaceBefore)
    expect(await directoryContents(userDataPath)).toEqual(registryBefore)
    await expect(listProjects()).resolves.toEqual([])
    const retried = await importProject()
    expect(await listProjects()).toMatchObject([{ id: retried.project.id, workspacePath }])
    expect(await directoryContents(workspacePath)).toEqual(workspaceBefore)
  })
})
