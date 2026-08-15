import { execFile as execFileCallback } from 'node:child_process'
import { readdir } from 'node:fs/promises'
import { basename, dirname, resolve } from 'node:path'
import { promisify } from 'node:util'
import { randomUUID } from 'node:crypto'

import type { DirtyWorkspaceSummary, Project, WorkspaceState } from '../shared/project'

const execFile = promisify(execFileCallback)

export interface WorkspaceInspectionDependencies {
  execGit: (workspacePath: string, args: string[]) => Promise<string>
  readDirectory?: (workspacePath: string) => Promise<string[]>
}

export interface ProjectServiceDependencies {
  readFile: (path: string, encoding: 'utf8') => Promise<string>
  writeFile: (path: string, data: string, encoding: 'utf8') => Promise<void>
  mkdir: (path: string, options: { recursive: true }) => Promise<void>
  execGit: (workspacePath: string, args: string[]) => Promise<string>
  readDirectory?: (workspacePath: string) => Promise<string[]>
  now?: () => string
  createId?: () => string
}

const emptyDirtySummary = (): DirtyWorkspaceSummary => ({
  staged: 0,
  unstaged: 0,
  untracked: 0,
  files: []
})

function cleanOutput(output: string): string | null {
  const value = output.trim()
  return value.length > 0 ? value : null
}

function parseStatus(output: string): DirtyWorkspaceSummary {
  const summary = emptyDirtySummary()

  for (const line of output.split('\n').filter(Boolean)) {
    const indexStatus = line[0]
    const worktreeStatus = line[1]
    const file = line.slice(3)
    summary.files.push(file)

    if (indexStatus === '?' && worktreeStatus === '?') {
      summary.untracked += 1
      continue
    }

    if (indexStatus !== ' ') summary.staged += 1
    if (worktreeStatus !== ' ') summary.unstaged += 1
  }

  return summary
}

export async function inspectWorkspace(
  workspacePath: string,
  dependencies: WorkspaceInspectionDependencies
): Promise<WorkspaceState> {
  try {
    await dependencies.execGit(workspacePath, ['rev-parse', '--is-inside-work-tree'])
  } catch {
    const entries = await (dependencies.readDirectory ?? (async (path: string) => readdir(path)))
      (workspacePath)
    if (entries.length > 0) {
      throw new Error('目录不是 Git Workspace，也不是空目录')
    }

    return {
      remote: null,
      currentBranch: null,
      head: null,
      defaultBranch: null,
      isGreenfield: true,
      dirty: false,
      dirtySummary: emptyDirtySummary()
    }
  }

  const readOptional = async (args: string[]): Promise<string | null> => {
    try {
      return cleanOutput(await dependencies.execGit(workspacePath, args))
    } catch {
      return null
    }
  }

  const remotes = (await readOptional(['remote']))
    ?.split('\n')
    .map((remote) => remote.trim())
    .filter(Boolean) ?? []
  const remoteName = remotes.includes('origin') ? 'origin' : remotes[0]
  const remote = remoteName
    ? await readOptional(['config', '--get', `remote.${remoteName}.url`])
    : null
  const currentBranch = await readOptional(['branch', '--show-current'])
  const head = await readOptional(['rev-parse', 'HEAD'])
  const remoteHead = remoteName
    ? await readOptional(['symbolic-ref', '--short', `refs/remotes/${remoteName}/HEAD`])
    : null
  const defaultBranch = remoteHead?.replace(`${remoteName}/`, '') ?? currentBranch
  const dirtySummary = parseStatus(await dependencies.execGit(workspacePath, [
    'status', '--porcelain=v1', '--untracked-files=all'
  ]))

  return {
    remote,
    currentBranch,
    head,
    defaultBranch,
    isGreenfield: false,
    dirty: dirtySummary.files.length > 0,
    dirtySummary
  }
}

export function createDefaultGitExecutor(): WorkspaceInspectionDependencies['execGit'] {
  return async (workspacePath, args) => {
    const result = await execFile('git', ['-C', workspacePath, ...args], { encoding: 'utf8' })
    return result.stdout
  }
}

export function createProjectService(dependencies: ProjectServiceDependencies) {
  const now = dependencies.now ?? (() => new Date().toISOString())
  const createId = dependencies.createId ?? randomUUID

  async function load(filePath: string): Promise<Project[]> {
    let contents: string
    try {
      contents = await dependencies.readFile(filePath, 'utf8')
    } catch (reason) {
      if (reason && typeof reason === 'object' && 'code' in reason && reason.code === 'ENOENT') return []
      throw reason
    }

    const value = JSON.parse(contents) as unknown
    if (!Array.isArray(value)) throw new Error('Project 注册表格式无效')
    return value as Project[]
  }

  async function save(filePath: string, projects: Project[]): Promise<void> {
    await dependencies.mkdir(dirname(filePath), { recursive: true })
    await dependencies.writeFile(filePath, JSON.stringify(projects, null, 2), 'utf8')
  }

  async function refresh(project: Project): Promise<Project> {
    const state = await inspectWorkspace(project.workspacePath, dependencies)
    return { ...project, ...state, updatedAt: now() }
  }

  return {
    async inspectDirectory(workspacePath: string): Promise<WorkspaceState> {
      return inspectWorkspace(resolve(workspacePath), dependencies)
    },

    async list(filePath: string): Promise<Project[]> {
      const projects = await load(filePath)
      const refreshed = await Promise.all(projects.map(async (project) => {
        try {
          return await refresh(project)
        } catch {
          // Keep the durable registration available when the workspace is offline or moved.
          return project
        }
      }))
      await save(filePath, refreshed)
      return refreshed
    },

    async importDirectory(filePath: string, workspacePath: string): Promise<Project> {
      const normalizedWorkspacePath = resolve(workspacePath)
      const state = await inspectWorkspace(normalizedWorkspacePath, dependencies)
      const projects = await load(filePath)
      const existing = projects.find((project) => resolve(project.workspacePath) === normalizedWorkspacePath)
      const project: Project = {
        id: existing?.id ?? createId(),
        name: existing?.name ?? (basename(normalizedWorkspacePath) || normalizedWorkspacePath),
        workspacePath: normalizedWorkspacePath,
        ...state,
        updatedAt: now()
      }
      const next = existing
        ? projects.map((candidate) => candidate.id === existing.id ? project : candidate)
        : [...projects, project]
      await save(filePath, next)
      return project
    },

    async findById(filePath: string, projectId: string): Promise<Project | null> {
      const projects = await load(filePath)
      return projects.find((project) => project.id === projectId) ?? null
    }
  }
}
