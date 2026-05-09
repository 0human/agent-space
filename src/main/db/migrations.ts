import type Database from 'better-sqlite3'

interface Migration {
  id: number
  name: string
  sql: string
}

const migrations: Migration[] = [
  {
    id: 1,
    name: 'initial_schema',
    sql: `
CREATE TABLE IF NOT EXISTS agent_profiles (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  permission_preset TEXT DEFAULT 'read_only',
  base_system_prompt TEXT,
  role_prompt_template TEXT,
  default_args_json TEXT,
  default_cwd_mode TEXT NOT NULL DEFAULT 'project_root',
  custom_cwd TEXT,
  output_style TEXT,
  approval_mode TEXT,
  env_whitelist_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_used_at TEXT
);

CREATE TABLE IF NOT EXISTS permission_policy_sets (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  preset TEXT,
  rules_json TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_used_at TEXT
);

CREATE TABLE IF NOT EXISTS permission_policy_bindings (
  id TEXT PRIMARY KEY,
  owner_type TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  permission_policy_set_id TEXT NOT NULL,
  merge_strategy TEXT NOT NULL DEFAULT 'additive',
  priority INTEGER NOT NULL DEFAULT 0,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (permission_policy_set_id) REFERENCES permission_policy_sets(id) ON DELETE CASCADE,
  UNIQUE (owner_type, owner_id, permission_policy_set_id)
);

CREATE TABLE IF NOT EXISTS ai_runtime_configs (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  runtime_type TEXT NOT NULL DEFAULT 'cli_agent',
  provider TEXT NOT NULL,
  agent_profile_id TEXT,
  source TEXT NOT NULL DEFAULT 'manual',
  source_ref TEXT,
  model TEXT,
  executable_path TEXT,
  default_args_json TEXT,
  default_cwd_mode TEXT NOT NULL DEFAULT 'project_root',
  custom_cwd TEXT,
  system_prompt TEXT,
  stream_enabled INTEGER NOT NULL DEFAULT 1,
  permission_preset TEXT,
  is_default INTEGER NOT NULL DEFAULT 0,
  enabled INTEGER NOT NULL DEFAULT 1,
  notes TEXT,
  last_test_status TEXT,
  last_test_message TEXT,
  last_tested_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_used_at TEXT,
  FOREIGN KEY (agent_profile_id) REFERENCES agent_profiles(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS ai_runtime_secrets (
  id TEXT PRIMARY KEY,
  runtime_config_id TEXT NOT NULL,
  secret_kind TEXT NOT NULL,
  secret_ref TEXT NOT NULL,
  masked_value TEXT,
  last_validated_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (runtime_config_id) REFERENCES ai_runtime_configs(id) ON DELETE CASCADE,
  UNIQUE (runtime_config_id, secret_kind)
);

CREATE TABLE IF NOT EXISTS ai_teams (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  goal TEXT,
  description TEXT,
  default_launch_mode TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_used_at TEXT
);

CREATE TABLE IF NOT EXISTS ai_team_members (
  id TEXT PRIMARY KEY,
  team_id TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL,
  runtime_config_id TEXT NOT NULL,
  agent_profile_id TEXT,
  task_instruction TEXT,
  enabled INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (team_id) REFERENCES ai_teams(id) ON DELETE CASCADE,
  FOREIGN KEY (runtime_config_id) REFERENCES ai_runtime_configs(id) ON DELETE RESTRICT,
  FOREIGN KEY (agent_profile_id) REFERENCES agent_profiles(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  local_path TEXT NOT NULL,
  mode TEXT NOT NULL DEFAULT 'manual',
  phase TEXT NOT NULL DEFAULT 'requirements',
  default_ai_team_id TEXT,
  default_ai_runtime_config_id TEXT,
  default_agent_profile_id TEXT,
  risk_status TEXT NOT NULL DEFAULT 'normal',
  archived_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_active_at TEXT,
  FOREIGN KEY (default_ai_team_id) REFERENCES ai_teams(id) ON DELETE SET NULL,
  FOREIGN KEY (default_ai_runtime_config_id) REFERENCES ai_runtime_configs(id) ON DELETE SET NULL,
  FOREIGN KEY (default_agent_profile_id) REFERENCES agent_profiles(id) ON DELETE SET NULL,
  CHECK (default_ai_team_id IS NULL OR default_ai_runtime_config_id IS NULL)
);

CREATE TABLE IF NOT EXISTS project_metric_snapshots (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  active_session_count INTEGER NOT NULL DEFAULT 0,
  running_agent_count INTEGER NOT NULL DEFAULT 0,
  waiting_input_count INTEGER NOT NULL DEFAULT 0,
  waiting_permission_count INTEGER NOT NULL DEFAULT 0,
  error_session_count INTEGER NOT NULL DEFAULT 0,
  recent_output_at TEXT,
  recent_failure_at TEXT,
  recent_runtime_type TEXT,
  file_change_count INTEGER NOT NULL DEFAULT 0,
  snapshot_at TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS work_sessions (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  title TEXT NOT NULL,
  goal TEXT,
  status TEXT NOT NULL DEFAULT 'idle',
  ai_team_id TEXT,
  ai_team_member_id TEXT,
  ai_runtime_config_id TEXT,
  agent_profile_id TEXT,
  assignment_mode TEXT NOT NULL,
  active_assignee_type TEXT NOT NULL,
  parent_work_session_id TEXT,
  external_session_id TEXT,
  latest_run_id TEXT,
  summary TEXT,
  resolved_config_snapshot_json TEXT,
  archived_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_message_at TEXT,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (ai_team_id) REFERENCES ai_teams(id) ON DELETE SET NULL,
  FOREIGN KEY (ai_team_member_id) REFERENCES ai_team_members(id) ON DELETE SET NULL,
  FOREIGN KEY (ai_runtime_config_id) REFERENCES ai_runtime_configs(id) ON DELETE RESTRICT,
  FOREIGN KEY (agent_profile_id) REFERENCES agent_profiles(id) ON DELETE SET NULL,
  FOREIGN KEY (parent_work_session_id) REFERENCES work_sessions(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  work_session_id TEXT NOT NULL,
  role TEXT NOT NULL,
  event_type TEXT NOT NULL DEFAULT 'message',
  ai_team_member_id TEXT,
  from_ai_team_member_id TEXT,
  to_ai_team_member_id TEXT,
  content TEXT NOT NULL,
  input_summary_json TEXT,
  input_envelope_snapshot_json TEXT,
  display_state_json TEXT,
  runtime_snapshot_json TEXT,
  token_usage_json TEXT,
  error_json TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (work_session_id) REFERENCES work_sessions(id) ON DELETE CASCADE,
  FOREIGN KEY (ai_team_member_id) REFERENCES ai_team_members(id) ON DELETE SET NULL,
  FOREIGN KEY (from_ai_team_member_id) REFERENCES ai_team_members(id) ON DELETE SET NULL,
  FOREIGN KEY (to_ai_team_member_id) REFERENCES ai_team_members(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS runtime_runs (
  id TEXT PRIMARY KEY,
  work_session_id TEXT NOT NULL,
  runtime_config_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  pid INTEGER,
  status TEXT NOT NULL DEFAULT 'starting',
  command TEXT,
  args_json TEXT,
  cwd TEXT,
  env_summary_json TEXT,
  started_at TEXT NOT NULL,
  ended_at TEXT,
  exit_code INTEGER,
  exit_signal TEXT,
  error_summary TEXT,
  FOREIGN KEY (work_session_id) REFERENCES work_sessions(id) ON DELETE CASCADE,
  FOREIGN KEY (runtime_config_id) REFERENCES ai_runtime_configs(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS runtime_events (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  work_session_id TEXT NOT NULL,
  runtime_config_id TEXT NOT NULL,
  type TEXT NOT NULL,
  content TEXT,
  metadata_json TEXT,
  display_category TEXT NOT NULL DEFAULT 'status',
  sequence_no INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (run_id) REFERENCES runtime_runs(id) ON DELETE CASCADE,
  FOREIGN KEY (work_session_id) REFERENCES work_sessions(id) ON DELETE CASCADE,
  FOREIGN KEY (runtime_config_id) REFERENCES ai_runtime_configs(id) ON DELETE RESTRICT,
  UNIQUE (run_id, sequence_no)
);

CREATE TABLE IF NOT EXISTS context_items (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  work_session_id TEXT,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  path TEXT,
  content TEXT,
  content_hash TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (work_session_id) REFERENCES work_sessions(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS context_snapshots (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  work_session_id TEXT,
  source_type TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT,
  decision_summary_json TEXT,
  open_questions_json TEXT,
  constraints_json TEXT,
  next_actions_json TEXT,
  preserved_refs_json TEXT,
  is_pinned INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (work_session_id) REFERENCES work_sessions(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS session_context_refs (
  id TEXT PRIMARY KEY,
  work_session_id TEXT NOT NULL,
  context_item_id TEXT NOT NULL,
  included_by TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (work_session_id) REFERENCES work_sessions(id) ON DELETE CASCADE,
  FOREIGN KEY (context_item_id) REFERENCES context_items(id) ON DELETE CASCADE,
  UNIQUE (work_session_id, context_item_id)
);

CREATE INDEX IF NOT EXISTS idx_agent_profiles_last_used ON agent_profiles(last_used_at DESC);
CREATE INDEX IF NOT EXISTS idx_permission_policy_sets_enabled ON permission_policy_sets(enabled);
CREATE INDEX IF NOT EXISTS idx_permission_policy_bindings_owner ON permission_policy_bindings(owner_type, owner_id, enabled, priority ASC);
CREATE INDEX IF NOT EXISTS idx_permission_policy_bindings_policy_set ON permission_policy_bindings(permission_policy_set_id);
CREATE INDEX IF NOT EXISTS idx_ai_runtime_configs_enabled_provider ON ai_runtime_configs(enabled, provider);
CREATE INDEX IF NOT EXISTS idx_ai_runtime_configs_last_used ON ai_runtime_configs(last_used_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_team_members_team_sort ON ai_team_members(team_id, sort_order ASC);
CREATE INDEX IF NOT EXISTS idx_ai_team_members_runtime ON ai_team_members(runtime_config_id);
CREATE INDEX IF NOT EXISTS idx_projects_last_active ON projects(last_active_at DESC);
CREATE INDEX IF NOT EXISTS idx_projects_risk_last_active ON projects(risk_status, last_active_at DESC);
CREATE INDEX IF NOT EXISTS idx_projects_archived ON projects(archived_at);
CREATE INDEX IF NOT EXISTS idx_projects_mode ON projects(mode);
CREATE INDEX IF NOT EXISTS idx_project_metric_snapshots_project ON project_metric_snapshots(project_id);
CREATE INDEX IF NOT EXISTS idx_work_sessions_project_updated ON work_sessions(project_id, archived_at, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_work_sessions_project_status ON work_sessions(project_id, status);
CREATE INDEX IF NOT EXISTS idx_work_sessions_parent ON work_sessions(parent_work_session_id);
CREATE INDEX IF NOT EXISTS idx_messages_session_created ON messages(work_session_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_runtime_runs_session_started ON runtime_runs(work_session_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_runtime_events_session_created ON runtime_events(work_session_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_context_items_project_type ON context_items(project_id, type);
CREATE INDEX IF NOT EXISTS idx_context_snapshots_session_created ON context_snapshots(work_session_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_context_snapshots_project_pinned ON context_snapshots(project_id, is_pinned, created_at DESC);
`
  }
]

export function runMigrations(sqlite: Database.Database): void {
  sqlite.exec(`
CREATE TABLE IF NOT EXISTS schema_migrations (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  applied_at TEXT NOT NULL
);
`)

  const applied = new Set(
    sqlite.prepare('SELECT id FROM schema_migrations').all().map((row) => {
      return (row as { id: number }).id
    })
  )

  const applyMigration = sqlite.transaction((migration: Migration) => {
    sqlite.exec(migration.sql)
    sqlite
      .prepare('INSERT INTO schema_migrations (id, name, applied_at) VALUES (?, ?, ?)')
      .run(migration.id, migration.name, new Date().toISOString())
  })

  for (const migration of migrations) {
    if (!applied.has(migration.id)) {
      applyMigration(migration)
    }
  }
}

export function getMigrationCount(): number {
  return migrations.length
}
