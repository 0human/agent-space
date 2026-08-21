export interface DirtyWorkspaceSummary {
  staged: number
  unstaged: number
  untracked: number
  files: string[]
}

export interface WorkspaceState {
  workspaceAvailable: boolean
  remote: string | null
  currentBranch: string | null
  head: string | null
  defaultBranch: string | null
  isGreenfield: boolean
  dirty: boolean
  dirtySummary: DirtyWorkspaceSummary
}

export interface PermissionPolicy {
  grantedPermissions: string[]
}

export const DEFAULT_PROJECT_PERMISSIONS = [
  'workspace.read',
  'workspace.write',
  'git.commit',
  'network.github'
] as const

export interface Project extends WorkspaceState {
  id: string
  name: string
  workspacePath: string
  updatedAt: string
  permissionPolicy?: PermissionPolicy
}

export interface ProjectImportResult {
  project: Project
  warning: string | null
}

export interface DataTransferNotice {
  destination: string
  data: string
  permissions: string
  recovery: string
}

export interface GitHubProjectCloneResult extends ProjectImportResult {
  transferNotice: DataTransferNotice
}

export interface GitHubProjectCloneBlocked {
  blocked: true
  reason: string
  transferNotice: DataTransferNotice
}

export type GitHubProjectCloneResponse = GitHubProjectCloneResult | GitHubProjectCloneBlocked

export interface OpenProjectResult {
  ok: boolean
  error: string | null
}
