import type { Project } from '../../../shared/project'
import type { WorkflowRun } from '../../../shared/workflow-run'

export type ProjectPage =
  | { name: 'projectOverview' }
  | { name: 'createProject' }
  | { name: 'resumeWork' }
  | { name: 'projectDetail'; project: Project }

export type AppPage =
  | ProjectPage
  | { name: 'workflow'; project: Project }
  | { name: 'run'; project: Project; run: WorkflowRun }
  | { name: 'settings' }

export function isProjectPage(page: AppPage): page is ProjectPage {
  return (
    page.name === 'projectOverview' ||
    page.name === 'createProject' ||
    page.name === 'resumeWork' ||
    page.name === 'projectDetail'
  )
}
