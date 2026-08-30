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
  allowedPaths?: string[]
  allowedCommands?: string[]
  allowedNetworkHosts?: string[]
}

export interface ProjectDeliveryPolicy {
  requiredChecks?: string[]
  requiredApprovals?: number
}

export const RELEASE_PLATFORMS = ['darwin', 'linux', 'win32'] as const
export type ReleasePlatform = typeof RELEASE_PLATFORMS[number]
export const RELEASE_OPERATIONS = ['build', 'release', 'validation'] as const
export type ReleaseOperation = typeof RELEASE_OPERATIONS[number]

export interface ProjectReleaseStep {
  kind: 'tool' | 'human'
  command?: string
  args?: string[]
  cwd?: string
  targetEnvironment?: string
  dataTransfer?: string
  requiredPermissions?: string[]
  instructions?: string
}

export interface ProjectReleasePlatformConfig {
  build?: ProjectReleaseStep
  release?: ProjectReleaseStep
  validation?: ProjectReleaseStep
}

export interface ProjectReleaseConfig {
  enabled: boolean
  platforms: Partial<Record<ReleasePlatform, ProjectReleasePlatformConfig>>
  targetEnvironment?: string
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
  status?: ProjectStatus
  deletedAt?: string | null
  deletionApproval?: ProjectDeletionApproval
  permissionPolicy?: PermissionPolicy
  deliveryPolicy?: ProjectDeliveryPolicy
  release?: ProjectReleaseConfig
}

export type ProjectStatus = 'active' | 'deleted'

export interface ProjectDeletionApproval {
  source: 'user-confirmation'
  approvedAt: string
}

export interface ProjectDeletionConfirmation {
  source: ProjectDeletionApproval['source']
}

export function isProjectDeleted(project: Pick<Project, 'status' | 'deletedAt'>): boolean {
  return project.status === 'deleted' || Boolean(project.deletedAt)
}

export type ProjectDeletionStatus = 'deleted' | 'already-deleted' | 'blocked' | 'approval-required' | 'not-found'

export interface ProjectDeletionResult {
  ok: boolean
  status: ProjectDeletionStatus
  project: Project | null
  error: string | null
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
