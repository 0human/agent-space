import { dirname, join } from 'node:path'

import { BUILT_IN_DEVELOPMENT_WORKFLOW, type SkillManifest, type WorkflowDefinition, type WorkflowStartResult, type WorkflowValidationResult, type WorkflowView } from '../shared/workflow'

interface WorkflowFileDependencies {
  readFile: (path: string, encoding: 'utf8') => Promise<string>
  writeFile: (path: string, data: string, encoding: 'utf8') => Promise<void>
  mkdir: (path: string, options: { recursive: true }) => Promise<void>
  manifests: SkillManifest[]
}

function validationError(errors: string[], message: string): void {
  errors.push(message)
}

function containsPrompt(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsPrompt)
  if (!value || typeof value !== 'object') return false
  return Object.entries(value).some(([key, child]) => (key === 'prompt' || key === 'prompts') || containsPrompt(child))
}

function normalizeWorkflow(value: unknown): WorkflowDefinition {
  const record = value && typeof value === 'object' ? value as Record<string, unknown> : {}
  const phases = Array.isArray(record.phases) ? record.phases : []
  return {
    schemaVersion: 1,
    id: typeof record.id === 'string' ? record.id : 'invalid-workflow',
    name: typeof record.name === 'string' ? record.name : '无效的 Project Workflow',
    version: typeof record.version === 'string' ? record.version : '0.0.0',
    ...(record.derivedFrom && typeof record.derivedFrom === 'object' ? { derivedFrom: record.derivedFrom as WorkflowDefinition['derivedFrom'] } : {}),
    phases: phases.map((phase, phaseIndex) => {
      const phaseRecord = phase && typeof phase === 'object' ? phase as Record<string, unknown> : {}
      const steps = Array.isArray(phaseRecord.steps) ? phaseRecord.steps : []
      return {
        id: typeof phaseRecord.id === 'string' ? phaseRecord.id : `invalid-phase-${phaseIndex}`,
        name: typeof phaseRecord.name === 'string' ? phaseRecord.name : '无效 Phase',
        goal: typeof phaseRecord.goal === 'string' ? phaseRecord.goal : '',
        steps: steps.map((step, stepIndex) => {
          const stepRecord = step && typeof step === 'object' ? step as Record<string, unknown> : {}
          return {
            ...stepRecord,
            id: typeof stepRecord.id === 'string' ? stepRecord.id : `invalid-step-${stepIndex}`,
            name: typeof stepRecord.name === 'string' ? stepRecord.name : '无效 Step',
            kind: ['skill', 'tool', 'human'].includes(String(stepRecord.kind)) ? stepRecord.kind : 'human'
          } as WorkflowDefinition['phases'][number]['steps'][number]
        })
      }
    })
  }
}

export function validateWorkflow(definition: unknown, manifests: SkillManifest[], grantedPermissions?: string[], requireOrigin = false): WorkflowValidationResult {
  const errors: string[] = []
  const warnings: string[] = []
  if (!definition || typeof definition !== 'object') {
    return { valid: false, errors: ['Workflow File 必须是对象。'], warnings }
  }

  const value = definition as Record<string, unknown>
  if (value.schemaVersion !== 1) validationError(errors, 'schemaVersion 必须为 1。')
  if (typeof value.id !== 'string' || !value.id) validationError(errors, 'Workflow 必须包含 id。')
  if (typeof value.name !== 'string' || !value.name) validationError(errors, 'Workflow 必须包含 name。')
  if (typeof value.version !== 'string' || !/^\d+\.\d+\.\d+$/.test(value.version)) validationError(errors, 'Workflow version 必须使用 x.y.z 格式。')
  if (containsPrompt(value)) validationError(errors, 'Workflow File 不得包含 prompt；行为必须来自 Skill Package。')
  if (requireOrigin) {
    const origin = value.derivedFrom
    if (!origin || typeof origin !== 'object' || (origin as Record<string, unknown>).id !== BUILT_IN_DEVELOPMENT_WORKFLOW.id || (origin as Record<string, unknown>).version !== BUILT_IN_DEVELOPMENT_WORKFLOW.version) {
      validationError(errors, 'Project Workflow 必须保留有效的 derivedFrom 来源版本。')
    }
  }
  if (!Array.isArray(value.phases) || value.phases.length === 0) {
    validationError(errors, 'Workflow 至少需要一个 Phase。')
    return { valid: false, errors, warnings }
  }

  const manifestByName = new Map(manifests.map((manifest) => [`${manifest.name}@${manifest.version}`, manifest]))
  const names = new Set(manifests.map((manifest) => manifest.name))
  for (const [phaseIndex, phase] of value.phases.entries()) {
    if (!phase || typeof phase !== 'object') {
      validationError(errors, `phases[${phaseIndex}] 必须是对象。`)
      continue
    }
    const phaseValue = phase as Record<string, unknown>
    if (typeof phaseValue.id !== 'string' || typeof phaseValue.name !== 'string' || typeof phaseValue.goal !== 'string') validationError(errors, `phases[${phaseIndex}] 缺少 id、name 或 goal。`)
    if (!Array.isArray(phaseValue.steps) || phaseValue.steps.length === 0) {
      validationError(errors, `Phase ${String(phaseValue.name ?? phaseIndex)} 至少需要一个 Step。`)
      continue
    }
    for (const [stepIndex, step] of phaseValue.steps.entries()) {
      if (!step || typeof step !== 'object') {
        validationError(errors, `phases[${phaseIndex}].steps[${stepIndex}] 必须是对象。`)
        continue
      }
      const stepValue = step as Record<string, unknown>
      if (typeof stepValue.id !== 'string' || !stepValue.id || typeof stepValue.name !== 'string' || !stepValue.name) {
        validationError(errors, `phases[${phaseIndex}].steps[${stepIndex}] 缺少 id 或 name。`)
      }
      if (!['skill', 'tool', 'human'].includes(String(stepValue.kind))) validationError(errors, `Step ${String(stepValue.id ?? stepIndex)} 的 kind 无效。`)
      if (stepValue.artifacts !== undefined && (!Array.isArray(stepValue.artifacts) || stepValue.artifacts.some((artifact) => typeof artifact !== 'string' || !artifact))) {
        validationError(errors, `Step ${String(stepValue.id ?? stepIndex)} 的 artifacts 必须是非空字符串数组。`)
      }
      if (stepValue.condition !== undefined && (typeof stepValue.condition !== 'string' || !stepValue.condition)) {
        validationError(errors, `Step ${String(stepValue.id ?? stepIndex)} 的 condition 必须是非空字符串。`)
      }
      if (stepValue.approvalGate !== undefined && (typeof stepValue.approvalGate !== 'string' || !stepValue.approvalGate)) {
        validationError(errors, `Step ${String(stepValue.id ?? stepIndex)} 的 approvalGate 必须是非空字符串。`)
      }
      if (stepValue.kind === 'tool' && (typeof stepValue.adapter !== 'string' || !stepValue.adapter)) {
        validationError(errors, `Tool Step ${String(stepValue.id ?? stepIndex)} 缺少 adapter。`)
      }
      if (stepValue.kind === 'skill') {
        const skill = stepValue.skill
        if (!skill || typeof skill !== 'object') {
          validationError(errors, `Step ${String(stepValue.id ?? stepIndex)} 缺少 Skill 引用。`)
          continue
        }
        const skillValue = skill as Record<string, unknown>
        const name = String(skillValue.name ?? '')
        const version = String(skillValue.version ?? '')
        if (!names.has(name)) {
          validationError(errors, `缺少 Skill ${name}。`)
          continue
        }
        if (!manifestByName.has(`${name}@${version}`)) validationError(errors, `Skill ${name} 版本 ${version} 不可用。`)
        const manifest = manifestByName.get(`${name}@${version}`)
        if (manifest) {
          for (const dependency of manifest.dependencies) {
            if (!names.has(dependency)) validationError(errors, 'Skill ' + name + ' 缺少依赖 ' + dependency + '。')
          }
        }
        if (manifest && grantedPermissions) {
          const missing = manifest.requiredPermissions.filter((permission) => !grantedPermissions.includes(permission))
          if (missing.length > 0) validationError(errors, `Skill ${name} 权限校验失败：缺少 ${missing.join(', ')}。`)
        }
      }
    }
  }

  return { valid: errors.length === 0, errors, warnings }
}

function projectPath(workspacePath: string): string {
  return join(workspacePath, '.agent-space', 'workflow.json')
}

function createWorkflowView(value: unknown, source: WorkflowView['source'], path: string | null, manifests: SkillManifest[], grantedPermissions?: string[]): WorkflowView {
  const validation = validateWorkflow(value, manifests, grantedPermissions, source === 'project')
  return {
    definition: normalizeWorkflow(value),
    source,
    path,
    validation,
    canStart: source === 'project' && validation.valid,
    skillManifests: structuredClone(manifests)
  }
}

export function createWorkflowService(dependencies: WorkflowFileDependencies) {
  return {
    manifests: dependencies.manifests,

    async getBuiltIn(): Promise<WorkflowView> {
      return createWorkflowView(structuredClone(BUILT_IN_DEVELOPMENT_WORKFLOW), 'built-in', null, dependencies.manifests)
    },

    validate(definition: unknown): WorkflowValidationResult {
      return validateWorkflow(definition, dependencies.manifests)
    },

    async copyToProject(workspacePath: string, grantedPermissions: string[]): Promise<WorkflowView> {
      const path = projectPath(workspacePath)
      await dependencies.mkdir(dirname(path), { recursive: true })
      const definition: WorkflowDefinition = {
        ...structuredClone(BUILT_IN_DEVELOPMENT_WORKFLOW),
        derivedFrom: { id: BUILT_IN_DEVELOPMENT_WORKFLOW.id, version: BUILT_IN_DEVELOPMENT_WORKFLOW.version }
      }
      await dependencies.writeFile(path, JSON.stringify(definition, null, 2), 'utf8')
      return createWorkflowView(definition, 'project', path, dependencies.manifests, grantedPermissions)
    },

    async loadProject(workspacePath: string, grantedPermissions: string[]): Promise<WorkflowView> {
      const path = projectPath(workspacePath)
      const contents = await dependencies.readFile(path, 'utf8')
      let definition: WorkflowDefinition
      try {
        definition = JSON.parse(contents) as WorkflowDefinition
      } catch {
        definition = { schemaVersion: 1, id: 'invalid-workflow', name: '无效的 Project Workflow', version: '0.0.0', phases: [] }
        return {
          definition,
          source: 'project',
          path,
          validation: { valid: false, errors: ['Workflow File 不是有效的 JSON。'], warnings: [] },
          canStart: false,
          skillManifests: structuredClone(dependencies.manifests)
        }
      }
      return createWorkflowView(definition, 'project', path, dependencies.manifests, grantedPermissions)
    },

    async startProjectRun(workspacePath: string, grantedPermissions: string[]): Promise<WorkflowStartResult> {
      let workflow: WorkflowView
      try {
        workflow = await this.loadProject(workspacePath, grantedPermissions)
      } catch {
        return { ok: false, error: 'Project Workflow 不存在或无法读取。' }
      }
      if (!workflow.canStart) return { ok: false, error: `Workflow 校验失败：${workflow.validation.errors.join(' ')}` }
      return { ok: true, error: null }
    }
  }
}
