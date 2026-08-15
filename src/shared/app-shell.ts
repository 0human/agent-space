import type { OpenProjectResult, Project, ProjectImportResult } from './project'

export interface RuntimeInfo {
  platform: NodeJS.Platform
  version: string
}

export const APP_SHELL_CHANNELS = {
  getRuntimeInfo: 'app-shell:get-runtime-info',
  listProjects: 'project:list',
  importProject: 'project:import',
  openProjectInIde: 'project:open-in-ide'
} as const

export interface AppShellApi {
  getRuntimeInfo: () => Promise<RuntimeInfo>
  listProjects: () => Promise<Project[]>
  importProject: () => Promise<ProjectImportResult | null>
  openProjectInIde: (projectId: string) => Promise<OpenProjectResult>
}
