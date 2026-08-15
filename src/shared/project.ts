export interface DirtyWorkspaceSummary {
  staged: number
  unstaged: number
  untracked: number
  files: string[]
}

export interface WorkspaceState {
  remote: string | null
  currentBranch: string | null
  head: string | null
  defaultBranch: string | null
  isGreenfield: boolean
  dirty: boolean
  dirtySummary: DirtyWorkspaceSummary
}

export interface Project extends WorkspaceState {
  id: string
  name: string
  workspacePath: string
  updatedAt: string
}

export interface ProjectImportResult {
  project: Project
  warning: string | null
}

export interface OpenProjectResult {
  ok: boolean
  error: string | null
}
