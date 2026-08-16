import developmentWorkflow from '../../.agents/workflows/development-workflow.json'
import skillPackageManifest from '../../.agents/skill-manifest.json'

export type WorkflowSource = 'built-in' | 'project'

export interface SkillManifest {
  name: string
  version: string
  entry: string
  dependencies: string[]
  supportedRuntimes: string[]
  capabilities: string[]
  requiredPermissions: string[]
}

export interface WorkflowStep {
  id: string
  name: string
  kind: 'skill' | 'tool' | 'human'
  skill?: { name: string; version: string }
  artifacts?: string[]
  condition?: string
  approvalGate?: string
  adapter?: string
}

export interface WorkflowPhase {
  id: string
  name: string
  goal: string
  steps: WorkflowStep[]
}

export interface WorkflowDefinition {
  schemaVersion: 1
  id: string
  name: string
  version: string
  derivedFrom?: { id: string; version: string }
  phases: WorkflowPhase[]
}

export interface WorkflowValidationResult {
  valid: boolean
  errors: string[]
  warnings: string[]
}

export interface WorkflowView {
  definition: WorkflowDefinition
  source: WorkflowSource
  path: string | null
  validation: WorkflowValidationResult
  canStart: boolean
  skillManifests: SkillManifest[]
}

export interface WorkflowStartResult {
  ok: boolean
  error: string | null
}

export const BUILT_IN_SKILL_MANIFESTS = skillPackageManifest.skills as SkillManifest[]
export const BUILT_IN_DEVELOPMENT_WORKFLOW = developmentWorkflow as WorkflowDefinition
