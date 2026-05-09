import { relations } from 'drizzle-orm'
import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'

const timestamps = {
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull()
}

export const agentProfiles = sqliteTable(
  'agent_profiles',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    description: text('description'),
    permissionPreset: text('permission_preset').default('read_only'),
    baseSystemPrompt: text('base_system_prompt'),
    rolePromptTemplate: text('role_prompt_template'),
    defaultArgsJson: text('default_args_json'),
    defaultCwdMode: text('default_cwd_mode').notNull().default('project_root'),
    customCwd: text('custom_cwd'),
    outputStyle: text('output_style'),
    approvalMode: text('approval_mode'),
    envWhitelistJson: text('env_whitelist_json'),
    ...timestamps,
    lastUsedAt: text('last_used_at')
  },
  (table) => [index('idx_agent_profiles_last_used').on(table.lastUsedAt)]
)

export const permissionPolicySets = sqliteTable(
  'permission_policy_sets',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    description: text('description'),
    preset: text('preset'),
    rulesJson: text('rules_json').notNull(),
    enabled: integer('enabled').notNull().default(1),
    ...timestamps,
    lastUsedAt: text('last_used_at')
  },
  (table) => [index('idx_permission_policy_sets_enabled').on(table.enabled)]
)

export const permissionPolicyBindings = sqliteTable(
  'permission_policy_bindings',
  {
    id: text('id').primaryKey(),
    ownerType: text('owner_type').notNull(),
    ownerId: text('owner_id').notNull(),
    permissionPolicySetId: text('permission_policy_set_id')
      .notNull()
      .references(() => permissionPolicySets.id, { onDelete: 'cascade' }),
    mergeStrategy: text('merge_strategy').notNull().default('additive'),
    priority: integer('priority').notNull().default(0),
    enabled: integer('enabled').notNull().default(1),
    ...timestamps
  },
  (table) => [
    uniqueIndex('idx_permission_policy_bindings_unique').on(
      table.ownerType,
      table.ownerId,
      table.permissionPolicySetId
    ),
    index('idx_permission_policy_bindings_owner').on(
      table.ownerType,
      table.ownerId,
      table.enabled,
      table.priority
    ),
    index('idx_permission_policy_bindings_policy_set').on(table.permissionPolicySetId)
  ]
)

export const aiRuntimeConfigs = sqliteTable(
  'ai_runtime_configs',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    runtimeType: text('runtime_type').notNull().default('cli_agent'),
    provider: text('provider').notNull(),
    agentProfileId: text('agent_profile_id').references(() => agentProfiles.id, {
      onDelete: 'set null'
    }),
    source: text('source').notNull().default('manual'),
    sourceRef: text('source_ref'),
    model: text('model'),
    executablePath: text('executable_path'),
    defaultArgsJson: text('default_args_json'),
    defaultCwdMode: text('default_cwd_mode').notNull().default('project_root'),
    customCwd: text('custom_cwd'),
    systemPrompt: text('system_prompt'),
    streamEnabled: integer('stream_enabled').notNull().default(1),
    permissionPreset: text('permission_preset'),
    isDefault: integer('is_default').notNull().default(0),
    enabled: integer('enabled').notNull().default(1),
    notes: text('notes'),
    lastTestStatus: text('last_test_status'),
    lastTestMessage: text('last_test_message'),
    lastTestedAt: text('last_tested_at'),
    ...timestamps,
    lastUsedAt: text('last_used_at')
  },
  (table) => [
    index('idx_ai_runtime_configs_enabled_provider').on(table.enabled, table.provider),
    index('idx_ai_runtime_configs_last_used').on(table.lastUsedAt)
  ]
)

export const aiRuntimeSecrets = sqliteTable(
  'ai_runtime_secrets',
  {
    id: text('id').primaryKey(),
    runtimeConfigId: text('runtime_config_id')
      .notNull()
      .references(() => aiRuntimeConfigs.id, { onDelete: 'cascade' }),
    secretKind: text('secret_kind').notNull(),
    secretRef: text('secret_ref').notNull(),
    maskedValue: text('masked_value'),
    lastValidatedAt: text('last_validated_at'),
    ...timestamps
  },
  (table) => [
    uniqueIndex('idx_ai_runtime_secrets_kind').on(table.runtimeConfigId, table.secretKind)
  ]
)

export const aiTeams = sqliteTable('ai_teams', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  goal: text('goal'),
  description: text('description'),
  defaultLaunchMode: text('default_launch_mode'),
  ...timestamps,
  lastUsedAt: text('last_used_at')
})

export const aiTeamMembers = sqliteTable(
  'ai_team_members',
  {
    id: text('id').primaryKey(),
    teamId: text('team_id')
      .notNull()
      .references(() => aiTeams.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    role: text('role').notNull(),
    runtimeConfigId: text('runtime_config_id')
      .notNull()
      .references(() => aiRuntimeConfigs.id, { onDelete: 'restrict' }),
    agentProfileId: text('agent_profile_id').references(() => agentProfiles.id, {
      onDelete: 'set null'
    }),
    taskInstruction: text('task_instruction'),
    enabled: integer('enabled').notNull().default(1),
    sortOrder: integer('sort_order').notNull().default(0),
    ...timestamps
  },
  (table) => [
    index('idx_ai_team_members_team_sort').on(table.teamId, table.sortOrder),
    index('idx_ai_team_members_runtime').on(table.runtimeConfigId)
  ]
)

export const projects = sqliteTable(
  'projects',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    description: text('description'),
    localPath: text('local_path').notNull(),
    mode: text('mode').notNull().default('manual'),
    phase: text('phase').notNull().default('requirements'),
    defaultAiTeamId: text('default_ai_team_id').references(() => aiTeams.id, {
      onDelete: 'set null'
    }),
    defaultAiRuntimeConfigId: text('default_ai_runtime_config_id').references(
      () => aiRuntimeConfigs.id,
      { onDelete: 'set null' }
    ),
    defaultAgentProfileId: text('default_agent_profile_id').references(() => agentProfiles.id, {
      onDelete: 'set null'
    }),
    riskStatus: text('risk_status').notNull().default('normal'),
    archivedAt: text('archived_at'),
    ...timestamps,
    lastActiveAt: text('last_active_at')
  },
  (table) => [
    index('idx_projects_last_active').on(table.lastActiveAt),
    index('idx_projects_risk_last_active').on(table.riskStatus, table.lastActiveAt),
    index('idx_projects_archived').on(table.archivedAt),
    index('idx_projects_mode').on(table.mode)
  ]
)

export const projectMetricSnapshots = sqliteTable('project_metric_snapshots', {
  id: text('id').primaryKey(),
  projectId: text('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  activeSessionCount: integer('active_session_count').notNull().default(0),
  runningAgentCount: integer('running_agent_count').notNull().default(0),
  waitingInputCount: integer('waiting_input_count').notNull().default(0),
  waitingPermissionCount: integer('waiting_permission_count').notNull().default(0),
  errorSessionCount: integer('error_session_count').notNull().default(0),
  recentOutputAt: text('recent_output_at'),
  recentFailureAt: text('recent_failure_at'),
  recentRuntimeType: text('recent_runtime_type'),
  fileChangeCount: integer('file_change_count').notNull().default(0),
  snapshotAt: text('snapshot_at').notNull()
})

export const workSessions = sqliteTable(
  'work_sessions',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    goal: text('goal'),
    status: text('status').notNull().default('idle'),
    aiTeamId: text('ai_team_id').references(() => aiTeams.id, { onDelete: 'set null' }),
    aiTeamMemberId: text('ai_team_member_id').references(() => aiTeamMembers.id, {
      onDelete: 'set null'
    }),
    aiRuntimeConfigId: text('ai_runtime_config_id').references(() => aiRuntimeConfigs.id, {
      onDelete: 'restrict'
    }),
    agentProfileId: text('agent_profile_id').references(() => agentProfiles.id, {
      onDelete: 'set null'
    }),
    assignmentMode: text('assignment_mode').notNull(),
    activeAssigneeType: text('active_assignee_type').notNull(),
    parentWorkSessionId: text('parent_work_session_id'),
    externalSessionId: text('external_session_id'),
    latestRunId: text('latest_run_id'),
    summary: text('summary'),
    resolvedConfigSnapshotJson: text('resolved_config_snapshot_json'),
    archivedAt: text('archived_at'),
    ...timestamps,
    lastMessageAt: text('last_message_at')
  },
  (table) => [
    index('idx_work_sessions_project_updated').on(table.projectId, table.archivedAt, table.updatedAt),
    index('idx_work_sessions_project_status').on(table.projectId, table.status),
    index('idx_work_sessions_parent').on(table.parentWorkSessionId)
  ]
)

export const messages = sqliteTable(
  'messages',
  {
    id: text('id').primaryKey(),
    workSessionId: text('work_session_id')
      .notNull()
      .references(() => workSessions.id, { onDelete: 'cascade' }),
    role: text('role').notNull(),
    eventType: text('event_type').notNull().default('message'),
    aiTeamMemberId: text('ai_team_member_id').references(() => aiTeamMembers.id, {
      onDelete: 'set null'
    }),
    fromAiTeamMemberId: text('from_ai_team_member_id').references(() => aiTeamMembers.id, {
      onDelete: 'set null'
    }),
    toAiTeamMemberId: text('to_ai_team_member_id').references(() => aiTeamMembers.id, {
      onDelete: 'set null'
    }),
    content: text('content').notNull(),
    inputSummaryJson: text('input_summary_json'),
    inputEnvelopeSnapshotJson: text('input_envelope_snapshot_json'),
    displayStateJson: text('display_state_json'),
    runtimeSnapshotJson: text('runtime_snapshot_json'),
    tokenUsageJson: text('token_usage_json'),
    errorJson: text('error_json'),
    createdAt: text('created_at').notNull()
  },
  (table) => [index('idx_messages_session_created').on(table.workSessionId, table.createdAt)]
)

export const runtimeRuns = sqliteTable(
  'runtime_runs',
  {
    id: text('id').primaryKey(),
    workSessionId: text('work_session_id')
      .notNull()
      .references(() => workSessions.id, { onDelete: 'cascade' }),
    runtimeConfigId: text('runtime_config_id')
      .notNull()
      .references(() => aiRuntimeConfigs.id, { onDelete: 'restrict' }),
    provider: text('provider').notNull(),
    pid: integer('pid'),
    status: text('status').notNull().default('starting'),
    command: text('command'),
    argsJson: text('args_json'),
    cwd: text('cwd'),
    envSummaryJson: text('env_summary_json'),
    startedAt: text('started_at').notNull(),
    endedAt: text('ended_at'),
    exitCode: integer('exit_code'),
    exitSignal: text('exit_signal'),
    errorSummary: text('error_summary')
  },
  (table) => [index('idx_runtime_runs_session_started').on(table.workSessionId, table.startedAt)]
)

export const runtimeEvents = sqliteTable(
  'runtime_events',
  {
    id: text('id').primaryKey(),
    runId: text('run_id')
      .notNull()
      .references(() => runtimeRuns.id, { onDelete: 'cascade' }),
    workSessionId: text('work_session_id')
      .notNull()
      .references(() => workSessions.id, { onDelete: 'cascade' }),
    runtimeConfigId: text('runtime_config_id')
      .notNull()
      .references(() => aiRuntimeConfigs.id, { onDelete: 'restrict' }),
    type: text('type').notNull(),
    content: text('content'),
    metadataJson: text('metadata_json'),
    displayCategory: text('display_category').notNull().default('status'),
    sequenceNo: integer('sequence_no').notNull(),
    createdAt: text('created_at').notNull()
  },
  (table) => [
    uniqueIndex('idx_runtime_events_run_sequence').on(table.runId, table.sequenceNo),
    index('idx_runtime_events_session_created').on(table.workSessionId, table.createdAt)
  ]
)

export const contextItems = sqliteTable(
  'context_items',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    workSessionId: text('work_session_id').references(() => workSessions.id, {
      onDelete: 'set null'
    }),
    type: text('type').notNull(),
    title: text('title').notNull(),
    path: text('path'),
    content: text('content'),
    contentHash: text('content_hash'),
    ...timestamps
  },
  (table) => [index('idx_context_items_project_type').on(table.projectId, table.type)]
)

export const contextSnapshots = sqliteTable(
  'context_snapshots',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    workSessionId: text('work_session_id').references(() => workSessions.id, {
      onDelete: 'set null'
    }),
    sourceType: text('source_type').notNull(),
    title: text('title').notNull(),
    summary: text('summary'),
    decisionSummaryJson: text('decision_summary_json'),
    openQuestionsJson: text('open_questions_json'),
    constraintsJson: text('constraints_json'),
    nextActionsJson: text('next_actions_json'),
    preservedRefsJson: text('preserved_refs_json'),
    isPinned: integer('is_pinned').notNull().default(0),
    ...timestamps
  },
  (table) => [
    index('idx_context_snapshots_session_created').on(table.workSessionId, table.createdAt),
    index('idx_context_snapshots_project_pinned').on(table.projectId, table.isPinned, table.createdAt)
  ]
)

export const sessionContextRefs = sqliteTable(
  'session_context_refs',
  {
    id: text('id').primaryKey(),
    workSessionId: text('work_session_id')
      .notNull()
      .references(() => workSessions.id, { onDelete: 'cascade' }),
    contextItemId: text('context_item_id')
      .notNull()
      .references(() => contextItems.id, { onDelete: 'cascade' }),
    includedBy: text('included_by'),
    createdAt: text('created_at').notNull()
  },
  (table) => [uniqueIndex('idx_session_context_refs_unique').on(table.workSessionId, table.contextItemId)]
)

export const workSessionRelations = relations(workSessions, ({ one, many }) => ({
  project: one(projects, {
    fields: [workSessions.projectId],
    references: [projects.id]
  }),
  messages: many(messages),
  runtimeRuns: many(runtimeRuns)
}))

export const runtimeRunRelations = relations(runtimeRuns, ({ one, many }) => ({
  workSession: one(workSessions, {
    fields: [runtimeRuns.workSessionId],
    references: [workSessions.id]
  }),
  runtimeConfig: one(aiRuntimeConfigs, {
    fields: [runtimeRuns.runtimeConfigId],
    references: [aiRuntimeConfigs.id]
  }),
  events: many(runtimeEvents)
}))

export type AgentProfile = typeof agentProfiles.$inferSelect
export type NewAgentProfile = typeof agentProfiles.$inferInsert
export type PermissionPolicySet = typeof permissionPolicySets.$inferSelect
export type NewPermissionPolicySet = typeof permissionPolicySets.$inferInsert
export type PermissionPolicyBinding = typeof permissionPolicyBindings.$inferSelect
export type NewPermissionPolicyBinding = typeof permissionPolicyBindings.$inferInsert
export type AiRuntimeConfig = typeof aiRuntimeConfigs.$inferSelect
export type NewAiRuntimeConfig = typeof aiRuntimeConfigs.$inferInsert
export type AiRuntimeSecret = typeof aiRuntimeSecrets.$inferSelect
export type NewAiRuntimeSecret = typeof aiRuntimeSecrets.$inferInsert
export type AiTeam = typeof aiTeams.$inferSelect
export type NewAiTeam = typeof aiTeams.$inferInsert
export type AiTeamMember = typeof aiTeamMembers.$inferSelect
export type NewAiTeamMember = typeof aiTeamMembers.$inferInsert
export type Project = typeof projects.$inferSelect
export type NewProject = typeof projects.$inferInsert
export type ProjectMetricSnapshot = typeof projectMetricSnapshots.$inferSelect
export type NewProjectMetricSnapshot = typeof projectMetricSnapshots.$inferInsert
export type WorkSession = typeof workSessions.$inferSelect
export type NewWorkSession = typeof workSessions.$inferInsert
export type Message = typeof messages.$inferSelect
export type NewMessage = typeof messages.$inferInsert
export type RuntimeRun = typeof runtimeRuns.$inferSelect
export type NewRuntimeRun = typeof runtimeRuns.$inferInsert
export type RuntimeEvent = typeof runtimeEvents.$inferSelect
export type NewRuntimeEvent = typeof runtimeEvents.$inferInsert
export type ContextItem = typeof contextItems.$inferSelect
export type NewContextItem = typeof contextItems.$inferInsert
export type ContextSnapshot = typeof contextSnapshots.$inferSelect
export type NewContextSnapshot = typeof contextSnapshots.$inferInsert
export type SessionContextRef = typeof sessionContextRefs.$inferSelect
export type NewSessionContextRef = typeof sessionContextRefs.$inferInsert
