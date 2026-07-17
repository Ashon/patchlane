import { existsSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'

export class AppDatabase {
  readonly sqlite: DatabaseSync
  // True when the SQLite file did not exist before this process opened it.
  // Legacy JSON import (the file->SQLite migration) must run only on a
  // brand-new database — never when a user has emptied a table — otherwise
  // deleted records would be resurrected from the stale JSON on the next start.
  readonly createdFresh: boolean

  constructor(filePath: string) {
    mkdirSync(path.dirname(filePath), { recursive: true })

    this.createdFresh = !existsSync(filePath)
    this.sqlite = new DatabaseSync(filePath)
    this.sqlite.exec('PRAGMA foreign_keys = ON')
    this.sqlite.exec('PRAGMA journal_mode = WAL')
    this.migrate()
  }

  transaction<T>(callback: () => T) {
    this.sqlite.exec('BEGIN IMMEDIATE')

    try {
      const result = callback()
      this.sqlite.exec('COMMIT')
      return result
    } catch (error) {
      this.sqlite.exec('ROLLBACK')
      throw error
    }
  }

  private migrate() {
    this.sqlite.exec(`
      CREATE TABLE IF NOT EXISTS llm_endpoints (
        id TEXT PRIMARY KEY,
        runtime_type TEXT NOT NULL DEFAULT 'openai_compatible' CHECK (runtime_type IN ('openai_compatible', 'opencode_cli', 'codex_cli')),
        name TEXT NOT NULL,
        base_url TEXT NOT NULL,
        default_model TEXT NOT NULL,
        api_key_env_var TEXT,
        opencode_command TEXT NOT NULL DEFAULT 'opencode',
        opencode_command_args_json TEXT NOT NULL DEFAULT '[]',
        opencode_dangerously_skip_permissions INTEGER NOT NULL DEFAULT 0 CHECK (opencode_dangerously_skip_permissions IN (0, 1)),
        enabled INTEGER NOT NULL CHECK (enabled IN (0, 1)),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_llm_endpoints_name
        ON llm_endpoints (name);

      CREATE TABLE IF NOT EXISTS github_tool_settings (
        id TEXT PRIMARY KEY CHECK (id = 'github'),
        enabled INTEGER NOT NULL CHECK (enabled IN (0, 1)),
        token TEXT,
        username TEXT,
        scopes_json TEXT NOT NULL DEFAULT '[]',
        updated_at TEXT,
        validated_at TEXT
      );

      CREATE TABLE IF NOT EXISTS sandbox_workspaces (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        path TEXT NOT NULL,
        repository_url TEXT,
        workspace_ref TEXT,
        kind TEXT NOT NULL DEFAULT 'manual' CHECK (kind IN ('manual')),
        status TEXT NOT NULL CHECK (status IN ('ready', 'error')),
        error TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_sandbox_workspaces_created_at
        ON sandbox_workspaces (created_at DESC);

      CREATE TABLE IF NOT EXISTS agent_runs (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        endpoint_id TEXT,
        model TEXT,
        agent_runtime TEXT NOT NULL DEFAULT 'patchlane' CHECK (agent_runtime IN ('patchlane', 'opencode', 'codex')),
        runtime_session_id TEXT,
        title TEXT NOT NULL,
        kind TEXT NOT NULL DEFAULT 'coding' CHECK (kind IN ('coding')),
        pr_url TEXT,
        result_summary TEXT,
        status TEXT NOT NULL CHECK (status IN ('idle', 'running', 'awaiting_user', 'completed', 'cancelled', 'failed')),
        attempt INTEGER NOT NULL DEFAULT 1,
        queued_at TEXT,
        started_at TEXT,
        heartbeat_at TEXT,
        lease_owner TEXT,
        lease_expires_at TEXT,
        cancellation_requested_at TEXT,
        finished_at TEXT,
        context_json TEXT,
        error TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_agent_runs_created_at
        ON agent_runs (created_at DESC);

      CREATE INDEX IF NOT EXISTS idx_agent_runs_workspace_id
        ON agent_runs (workspace_id);

      CREATE TABLE IF NOT EXISTS agent_run_messages (
        id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL REFERENCES agent_runs (id) ON DELETE CASCADE,
        role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'tool', 'system')),
        content TEXT NOT NULL,
        tool_name TEXT,
        tool_input_json TEXT,
        metadata_json TEXT,
        created_at TEXT NOT NULL,
        sequence INTEGER NOT NULL,
        UNIQUE (run_id, sequence)
      );

      CREATE INDEX IF NOT EXISTS idx_agent_run_messages_run_id_sequence
        ON agent_run_messages (run_id, sequence);

      CREATE TABLE IF NOT EXISTS agent_run_events (
        id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL REFERENCES agent_runs (id) ON DELETE CASCADE,
        source TEXT NOT NULL,
        event_type TEXT,
        item_type TEXT,
        item_id TEXT,
        payload_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        sequence INTEGER NOT NULL,
        UNIQUE (run_id, sequence)
      );

      CREATE INDEX IF NOT EXISTS idx_agent_run_events_run_id_sequence
        ON agent_run_events (run_id, sequence);
    `)
    this.ensureColumn(
      'llm_endpoints',
      'runtime_type',
      "TEXT NOT NULL DEFAULT 'openai_compatible'",
    )
    this.ensureColumn(
      'llm_endpoints',
      'opencode_command',
      "TEXT NOT NULL DEFAULT 'opencode'",
    )
    this.ensureColumn(
      'llm_endpoints',
      'opencode_command_args_json',
      "TEXT NOT NULL DEFAULT '[]'",
    )
    this.ensureColumn(
      'llm_endpoints',
      'opencode_dangerously_skip_permissions',
      'INTEGER NOT NULL DEFAULT 0',
    )
    this.ensureColumn('agent_runs', 'kind', "TEXT NOT NULL DEFAULT 'coding'")
    this.ensureColumn(
      'agent_runs',
      'agent_runtime',
      "TEXT NOT NULL DEFAULT 'patchlane'",
    )
    this.ensureColumn('agent_runs', 'runtime_session_id', 'TEXT')
    this.ensureColumn('agent_runs', 'pr_url', 'TEXT')
    this.ensureColumn('agent_runs', 'result_summary', 'TEXT')
    this.ensureColumn('agent_runs', 'attempt', 'INTEGER NOT NULL DEFAULT 1')
    this.ensureColumn('agent_runs', 'queued_at', 'TEXT')
    this.ensureColumn('agent_runs', 'started_at', 'TEXT')
    this.ensureColumn('agent_runs', 'heartbeat_at', 'TEXT')
    this.ensureColumn('agent_runs', 'lease_owner', 'TEXT')
    this.ensureColumn('agent_runs', 'lease_expires_at', 'TEXT')
    this.ensureColumn('agent_runs', 'cancellation_requested_at', 'TEXT')
    this.ensureColumn('agent_runs', 'finished_at', 'TEXT')
    this.ensureColumn('agent_runs', 'context_json', 'TEXT')
    this.ensureColumn('agent_run_messages', 'tool_input_json', 'TEXT')
    this.ensureColumn('agent_run_messages', 'metadata_json', 'TEXT')
    this.rebuildLlmEndpointsIfNeeded()
    this.rebuildAgentRunsIfNeeded()
    this.rebuildSandboxWorkspacesIfNeeded()
    this.dropLegacyDomainTables()
    this.sqlite.exec(`
      CREATE INDEX IF NOT EXISTS idx_agent_runs_created_at
        ON agent_runs (created_at DESC);

      CREATE INDEX IF NOT EXISTS idx_agent_runs_workspace_id
        ON agent_runs (workspace_id);

      CREATE INDEX IF NOT EXISTS idx_agent_run_events_run_id_sequence
        ON agent_run_events (run_id, sequence);

      CREATE INDEX IF NOT EXISTS idx_agent_run_events_run_id_created_at
        ON agent_run_events (run_id, created_at ASC);

      CREATE INDEX IF NOT EXISTS idx_sandbox_workspaces_created_at
        ON sandbox_workspaces (created_at DESC);
    `)
  }

  private ensureColumn(
    tableName: string,
    columnName: string,
    definition: string,
  ) {
    const columns = this.tableColumns(tableName)

    if (!columns.includes(columnName)) {
      this.sqlite.exec(
        `ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`,
      )
    }
  }

  private tableColumns(tableName: string) {
    const columns = this.sqlite
      .prepare(`PRAGMA table_info(${tableName})`)
      .all() as Array<{ name: string }>

    return columns.map((column) => column.name)
  }

  private tableSql(tableName: string) {
    const row = this.sqlite
      .prepare(
        "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?",
      )
      .get(tableName) as { sql?: string } | undefined

    return row?.sql
  }

  private rebuildLlmEndpointsIfNeeded() {
    const sql = this.tableSql('llm_endpoints')

    if (sql?.includes("'codex_cli'")) {
      return
    }

    this.sqlite.exec('PRAGMA foreign_keys = OFF')
    try {
      this.sqlite.exec(`
        CREATE TABLE llm_endpoints_new (
          id TEXT PRIMARY KEY,
          runtime_type TEXT NOT NULL DEFAULT 'openai_compatible' CHECK (runtime_type IN ('openai_compatible', 'opencode_cli', 'codex_cli')),
          name TEXT NOT NULL,
          base_url TEXT NOT NULL,
          default_model TEXT NOT NULL,
          api_key_env_var TEXT,
          opencode_command TEXT NOT NULL DEFAULT 'opencode',
          opencode_command_args_json TEXT NOT NULL DEFAULT '[]',
          opencode_dangerously_skip_permissions INTEGER NOT NULL DEFAULT 0 CHECK (opencode_dangerously_skip_permissions IN (0, 1)),
          enabled INTEGER NOT NULL CHECK (enabled IN (0, 1)),
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        INSERT INTO llm_endpoints_new (
          id, runtime_type, name, base_url, default_model, api_key_env_var,
          opencode_command, opencode_command_args_json, opencode_dangerously_skip_permissions,
          enabled, created_at, updated_at
        )
        SELECT
          id, COALESCE(runtime_type, 'openai_compatible'), name, base_url, default_model, api_key_env_var,
          COALESCE(opencode_command, 'opencode'), COALESCE(opencode_command_args_json, '[]'),
          COALESCE(opencode_dangerously_skip_permissions, 0), enabled, created_at, updated_at
        FROM llm_endpoints;

        DROP TABLE llm_endpoints;
        ALTER TABLE llm_endpoints_new RENAME TO llm_endpoints;
      `)
    } finally {
      this.sqlite.exec('PRAGMA foreign_keys = ON')
    }
  }

  // Rebuild agent_runs to drop the legacy project/issue columns and collapse the
  // kind CHECK to the single supported 'coding' value. Existing runs are kept
  // (re-labelled 'coding'); orphan cleanup happens in dropLegacyDomainTables.
  private rebuildAgentRunsIfNeeded() {
    const columns = this.tableColumns('agent_runs')
    const hasLegacyColumns = [
      'project_id',
      'issue_id',
      'subtask_id',
      'branch_name',
    ].some((column) => columns.includes(column))
    const sql = this.tableSql('agent_runs')
    const hasLegacyKindCheck = sql?.includes("'requirements'") ?? false

    if (!hasLegacyColumns && !hasLegacyKindCheck) {
      return
    }

    this.sqlite.exec('PRAGMA foreign_keys = OFF')
    try {
      this.sqlite.exec(`
        CREATE TABLE agent_runs_new (
          id TEXT PRIMARY KEY,
          workspace_id TEXT NOT NULL,
          endpoint_id TEXT,
          model TEXT,
          agent_runtime TEXT NOT NULL DEFAULT 'patchlane' CHECK (agent_runtime IN ('patchlane', 'opencode', 'codex')),
          runtime_session_id TEXT,
          title TEXT NOT NULL,
          kind TEXT NOT NULL DEFAULT 'coding' CHECK (kind IN ('coding')),
          pr_url TEXT,
          result_summary TEXT,
          status TEXT NOT NULL CHECK (status IN ('idle', 'running', 'awaiting_user', 'completed', 'cancelled', 'failed')),
          attempt INTEGER NOT NULL DEFAULT 1,
          queued_at TEXT,
          started_at TEXT,
          heartbeat_at TEXT,
          lease_owner TEXT,
          lease_expires_at TEXT,
          cancellation_requested_at TEXT,
          finished_at TEXT,
          context_json TEXT,
          error TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        INSERT INTO agent_runs_new (
          id, workspace_id, endpoint_id, model, agent_runtime, runtime_session_id, title, kind, pr_url,
          result_summary, status, attempt, queued_at, started_at, heartbeat_at, lease_owner, lease_expires_at,
          cancellation_requested_at, finished_at, context_json, error, created_at, updated_at
        )
        SELECT
          id, workspace_id, endpoint_id, model, COALESCE(agent_runtime, 'patchlane'), runtime_session_id, title, 'coding', pr_url,
          result_summary, status, COALESCE(attempt, 1), queued_at, started_at, heartbeat_at, lease_owner, lease_expires_at,
          cancellation_requested_at, finished_at, context_json, error, created_at, updated_at
        FROM agent_runs;

        DROP TABLE agent_runs;
        ALTER TABLE agent_runs_new RENAME TO agent_runs;
      `)
    } finally {
      this.sqlite.exec('PRAGMA foreign_keys = ON')
    }
  }

  // Rebuild sandbox_workspaces to drop the legacy project/issue/worktree columns
  // and keep only standalone manual workspaces.
  private rebuildSandboxWorkspacesIfNeeded() {
    const columns = this.tableColumns('sandbox_workspaces')
    const hasLegacyColumns = [
      'project_id',
      'issue_id',
      'agent_run_id',
      'parent_workspace_id',
      'base_ref',
      'branch_name',
      'cleanup_status',
    ].some((column) => columns.includes(column))
    const sql = this.tableSql('sandbox_workspaces')
    const hasLegacyKindCheck = sql?.includes("CHECK (kind IN ('manual'))")
      ? false
      : Boolean(sql)

    if (!hasLegacyColumns && !hasLegacyKindCheck) {
      return
    }

    this.sqlite.exec('PRAGMA foreign_keys = OFF')
    try {
      this.sqlite.exec(`
        CREATE TABLE sandbox_workspaces_new (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          path TEXT NOT NULL,
          repository_url TEXT,
          workspace_ref TEXT,
          kind TEXT NOT NULL DEFAULT 'manual' CHECK (kind IN ('manual')),
          status TEXT NOT NULL CHECK (status IN ('ready', 'error')),
          error TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        INSERT INTO sandbox_workspaces_new (
          id, name, path, repository_url, workspace_ref, kind, status, error, created_at, updated_at
        )
        SELECT
          id, name, path, repository_url, workspace_ref, 'manual', status, error, created_at, updated_at
        FROM sandbox_workspaces
        WHERE kind = 'manual' OR kind IS NULL;

        DROP TABLE sandbox_workspaces;
        ALTER TABLE sandbox_workspaces_new RENAME TO sandbox_workspaces;
      `)
    } finally {
      this.sqlite.exec('PRAGMA foreign_keys = ON')
    }
  }

  // One-time cleanup of the removed project/issue domain: drop its tables and
  // remove agent runs orphaned by the dropped project workspaces. Gated on a
  // legacy table still being present so it never runs on a fresh or
  // already-migrated database (otherwise it would keep purging legitimately
  // orphaned run history on every boot).
  private dropLegacyDomainTables() {
    const tables = new Set(
      (
        this.sqlite
          .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
          .all() as Array<{ name: string }>
      ).map((row) => row.name),
    )
    const legacyTables = [
      'issue_subtasks',
      'issue_comments',
      'issue_events',
      'issues',
      'agent_project_workspaces',
      'agent_projects',
    ]

    if (!legacyTables.some((table) => tables.has(table))) {
      return
    }

    this.sqlite.exec(`
      DROP TABLE IF EXISTS issue_subtasks;
      DROP TABLE IF EXISTS issue_comments;
      DROP TABLE IF EXISTS issue_events;
      DROP TABLE IF EXISTS issues;
      DROP TABLE IF EXISTS agent_project_workspaces;
      DROP TABLE IF EXISTS agent_projects;

      DELETE FROM agent_runs
      WHERE workspace_id NOT IN (SELECT id FROM sandbox_workspaces);
    `)
  }
}

export const toSqlBoolean = (value: boolean) => (value ? 1 : 0)

export const fromSqlBoolean = (value: unknown) => Number(value) === 1

export const optionalString = (value: unknown) =>
  typeof value === 'string' && value.length > 0 ? value : undefined
