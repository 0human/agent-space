import { execFile as execFileCallback } from 'node:child_process'
import { readdir } from 'node:fs/promises'
import { basename, dirname, resolve } from 'node:path'
import { promisify } from 'node:util'
import { randomUUID } from 'node:crypto'

import { DEFAULT_PROJECT_PERMISSIONS, isProjectDeleted, type DirtyWorkspaceSummary, type Project, type ProjectDeletionResult, type WorkspaceState } from '../shared/project'
import { zhCNMain } from '../shared/i18n/zh-CN'
import { resolveGitHubRepository } from './git-delivery'
import { sanitizeSensitiveText } from './sensitive-text'

const execFile = promisify(execFileCallback)

export interface WorkspaceInspectionDependencies {
  execGit: (workspacePath: string, args: string[]) => Promise<string>
  readDirectory?: (workspacePath: string) => Promise<string[]>
}

export interface ProjectServiceDependencies {
  readFile: (path: string, encoding: 'utf8') => Promise<string>
  writeFile: (path: string, data: string, encoding: 'utf8') => Promise<void>
  rename?: (source: string, destination: string) => Promise<void>
  unlink?: (path: string) => Promise<void>
  mkdir: (path: string, options: { recursive: true }) => Promise<void>
  execGit: (workspacePath: string, args: string[]) => Promise<string>
  readDirectory?: (workspacePath: string) => Promise<string[]>
  cloneGitHub?: (repositoryUrl: string, destinationPath: string) => Promise<void>
  fetchGitHub?: (workspacePath: string) => Promise<void>
  resolveSshHost?: (host: string) => Promise<string | null>
  hasActiveWorkflowRuns?: (projectId: string) => Promise<boolean>
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

function sanitizeGitError(reason: unknown): Error {
  const message = reason instanceof Error ? reason.message : String(reason)
  return new Error(sanitizeSensitiveText(message))
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
      workspaceAvailable: true,
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
    workspaceAvailable: true,
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
  const projectLocks = new Map<string, Promise<void>>()

  async function withProjectLock<T>(projectId: string, action: () => Promise<T>): Promise<T> {
    const previous = projectLocks.get(projectId) ?? Promise.resolve()
    let release!: () => void
    const current = new Promise<void>((resolve) => { release = resolve })
    projectLocks.set(projectId, current)
    await previous
    try {
      return await action()
    } finally {
      release()
      if (projectLocks.get(projectId) === current) projectLocks.delete(projectId)
    }
  }

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
    return value.map((project) => ({
      ...project,
      workspaceAvailable: project.workspaceAvailable !== false,
      status: isProjectDeleted(project) ? 'deleted' : 'active',
      deletedAt: typeof project.deletedAt === 'string' ? project.deletedAt : null,
      permissionPolicy: project.permissionPolicy ?? { grantedPermissions: [...DEFAULT_PROJECT_PERMISSIONS] }
    })) as Project[]
  }

  async function save(filePath: string, projects: Project[]): Promise<void> {
    await dependencies.mkdir(dirname(filePath), { recursive: true })
    const serialized = JSON.stringify(projects, null, 2)
    if (!dependencies.rename) {
      await dependencies.writeFile(filePath, serialized, 'utf8')
      return
    }

    const temporaryPath = `${filePath}.tmp-${createId()}`
    let replaced = false
    try {
      await dependencies.writeFile(temporaryPath, serialized, 'utf8')
      await dependencies.rename(temporaryPath, filePath)
      replaced = true
    } finally {
      if (!replaced && dependencies.unlink) await dependencies.unlink(temporaryPath).catch(() => undefined)
    }
  }

  async function importDirectory(filePath: string, workspacePath: string): Promise<Project> {
    const normalizedWorkspacePath = resolve(workspacePath)
    const state = await inspectWorkspace(normalizedWorkspacePath, dependencies)
    const projects = await load(filePath)
    const existing = projects.find((project) => !isProjectDeleted(project) && resolve(project.workspacePath) === normalizedWorkspacePath)
    const project: Project = {
      id: existing?.id ?? createId(),
      name: existing?.name ?? (basename(normalizedWorkspacePath) || normalizedWorkspacePath),
      workspacePath: normalizedWorkspacePath,
      ...state,
      permissionPolicy: existing?.permissionPolicy ?? { grantedPermissions: [...DEFAULT_PROJECT_PERMISSIONS] },
      deliveryPolicy: existing?.deliveryPolicy,
      release: existing?.release,
      status: 'active',
      deletedAt: null,
      updatedAt: now()
    }
    const next = existing
      ? projects.map((candidate) => candidate.id === existing.id ? project : candidate)
      : [...projects, project]
    await save(filePath, next)
    return project
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
        if (isProjectDeleted(project)) return project
        try {
          return await refresh(project)
        } catch {
          // Keep the durable registration available when the workspace is offline or moved.
          return { ...project, workspaceAvailable: false }
        }
      }))
      await save(filePath, refreshed)
      return refreshed.filter((project) => !isProjectDeleted(project))
    },

    async importDirectory(filePath: string, workspacePath: string): Promise<Project> {
      return importDirectory(filePath, workspacePath)
    },

    async cloneGitHub(filePath: string, repositoryUrl: string, destinationPath: string): Promise<Project> {
      const url = repositoryUrl.trim()
      let repositorySlug: string
      try {
        repositorySlug = await resolveGitHubRepository(url, dependencies.resolveSshHost)
      } catch {
        throw new Error('请输入有效的 GitHub 仓库地址。')
      }
      const workspacePath = resolve(destinationPath)
      let existing = false
      let existingRemote: string | null = null
      try {
        const state = await inspectWorkspace(workspacePath, dependencies)
        existing = !state.isGreenfield
        existingRemote = state.remote
      } catch {
        const entries = await (dependencies.readDirectory?.(workspacePath) ?? Promise.resolve([])).catch(() => [])
        // A non-empty directory may be a partial clone. Fetch it instead of risking a second clone.
        existing = entries.length > 0
      }
      if (existingRemote) {
        let existingRepositorySlug: string
        try {
          existingRepositorySlug = await resolveGitHubRepository(existingRemote, dependencies.resolveSshHost)
        } catch {
          throw new Error('目标 Workspace 已连接到另一个 GitHub 仓库。')
        }
        if (existingRepositorySlug.toLowerCase() !== repositorySlug.toLowerCase()) {
          throw new Error('目标 Workspace 已连接到另一个 GitHub 仓库。')
        }
      }
      try {
        if (existing) {
          if (!dependencies.fetchGitHub) throw new Error('无法恢复 GitHub Workspace。')
          await dependencies.fetchGitHub(workspacePath)
        } else {
          if (!dependencies.cloneGitHub) throw new Error('GitHub clone 不可用。')
          await dependencies.cloneGitHub(url, workspacePath)
        }
      } catch (reason) {
        throw sanitizeGitError(reason)
      }
      return importDirectory(filePath, workspacePath)
    },

    async findById(filePath: string, projectId: string): Promise<Project | null> {
      const projects = await load(filePath)
      return projects.find((project) => project.id === projectId) ?? null
    },

    withProjectLock,

    async deleteProject(filePath: string, projectId: string): Promise<ProjectDeletionResult> {
      return withProjectLock(projectId, async () => {
        const projects = await load(filePath)
        const project = projects.find((candidate) => candidate.id === projectId)
        if (!project) return { ok: false, status: 'not-found', project: null, error: zhCNMain.projectDelete.notFound }
        if (isProjectDeleted(project)) return { ok: true, status: 'already-deleted', project, error: null }
        if (await (dependencies.hasActiveWorkflowRuns?.(project.id) ?? Promise.resolve(false))) {
          return { ok: false, status: 'blocked', project, error: zhCNMain.projectDelete.activeRunError }
        }

        const timestamp = now()
        const deletedProject: Project = { ...project, status: 'deleted', deletedAt: timestamp, updatedAt: timestamp }
        await save(filePath, projects.map((candidate) => candidate.id === project.id ? deletedProject : candidate))
        return { ok: true, status: 'deleted', project: deletedProject, error: null }
      })
    }
  }
}
