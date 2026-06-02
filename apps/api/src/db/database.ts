import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'

export class AppDatabase {
  readonly sqlite: DatabaseSync

  constructor(filePath: string) {
    mkdirSync(path.dirname(filePath), { recursive: true })

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
        name TEXT NOT NULL,
        base_url TEXT NOT NULL,
        default_model TEXT NOT NULL,
        api_key_env_var TEXT,
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
        kind TEXT NOT NULL DEFAULT 'manual',
        project_id TEXT,
        issue_id TEXT,
        agent_run_id TEXT,
        parent_workspace_id TEXT,
        base_ref TEXT,
        branch_name TEXT,
        cleanup_status TEXT NOT NULL DEFAULT 'active',
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
        title TEXT NOT NULL,
        kind TEXT NOT NULL DEFAULT 'coding' CHECK (kind IN ('coding', 'requirements', 'planning', 'verification', 'publish', 'followup')),
        project_id TEXT,
        issue_id TEXT,
        branch_name TEXT,
        pr_url TEXT,
        result_summary TEXT,
        status TEXT NOT NULL CHECK (status IN ('idle', 'running', 'awaiting_user', 'completed', 'failed')),
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
        metadata_json TEXT,
        created_at TEXT NOT NULL,
        sequence INTEGER NOT NULL,
        UNIQUE (run_id, sequence)
      );

      CREATE INDEX IF NOT EXISTS idx_agent_run_messages_run_id_sequence
        ON agent_run_messages (run_id, sequence);

      CREATE TABLE IF NOT EXISTS agent_projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT NOT NULL,
        repository_url TEXT,
        repository_ref TEXT,
        workspace_id TEXT,
        default_endpoint_id TEXT,
        branch_prefix TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_agent_projects_name
        ON agent_projects (name);

      CREATE TABLE IF NOT EXISTS agent_project_workspaces (
        project_id TEXT NOT NULL REFERENCES agent_projects (id) ON DELETE CASCADE,
        workspace_id TEXT NOT NULL,
        sequence INTEGER NOT NULL,
        PRIMARY KEY (project_id, workspace_id)
      );

      CREATE TABLE IF NOT EXISTS issues (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        project_id TEXT NOT NULL REFERENCES agent_projects (id),
        workspace_id TEXT,
        endpoint_id TEXT,
        requirement_run_id TEXT,
        planning_run_id TEXT,
        agent_run_id TEXT,
        status TEXT NOT NULL CHECK (status IN ('backlog', 'planning', 'ready', 'running', 'awaiting_user', 'review', 'completed', 'blocked', 'failed')),
        priority TEXT NOT NULL CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
        analysis TEXT,
        branch_name TEXT,
        pr_url TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_issues_project_status
        ON issues (project_id, status);

      CREATE INDEX IF NOT EXISTS idx_issues_updated_at
        ON issues (updated_at DESC);

      CREATE TABLE IF NOT EXISTS issue_events (
        id TEXT PRIMARY KEY,
        issue_id TEXT NOT NULL REFERENCES issues (id) ON DELETE CASCADE,
        type TEXT NOT NULL CHECK (type IN ('created', 'updated', 'analyzed', 'run_started', 'status_changed')),
        message TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_issue_events_issue_created_at
        ON issue_events (issue_id, created_at ASC);
    `)
    this.ensureColumn('agent_runs', 'kind', "TEXT NOT NULL DEFAULT 'coding'")
    this.ensureColumn('agent_runs', 'project_id', 'TEXT')
    this.ensureColumn('agent_runs', 'issue_id', 'TEXT')
    this.ensureColumn('agent_runs', 'branch_name', 'TEXT')
    this.ensureColumn('agent_runs', 'pr_url', 'TEXT')
    this.ensureColumn('agent_runs', 'result_summary', 'TEXT')
    this.ensureColumn('agent_runs', 'context_json', 'TEXT')
    this.ensureColumn('agent_run_messages', 'metadata_json', 'TEXT')
    this.ensureColumn('agent_projects', 'repository_url', 'TEXT')
    this.ensureColumn('agent_projects', 'repository_ref', 'TEXT')
    this.ensureColumn('agent_projects', 'workspace_id', 'TEXT')
    this.ensureColumn(
      'sandbox_workspaces',
      'kind',
      "TEXT NOT NULL DEFAULT 'manual'",
    )
    this.ensureColumn('sandbox_workspaces', 'project_id', 'TEXT')
    this.ensureColumn('sandbox_workspaces', 'issue_id', 'TEXT')
    this.ensureColumn('sandbox_workspaces', 'agent_run_id', 'TEXT')
    this.ensureColumn('sandbox_workspaces', 'parent_workspace_id', 'TEXT')
    this.ensureColumn('sandbox_workspaces', 'base_ref', 'TEXT')
    this.ensureColumn('sandbox_workspaces', 'branch_name', 'TEXT')
    this.ensureColumn(
      'sandbox_workspaces',
      'cleanup_status',
      "TEXT NOT NULL DEFAULT 'active'",
    )
    this.ensureColumn('issues', 'requirement_run_id', 'TEXT')
    this.ensureColumn('issues', 'planning_run_id', 'TEXT')
    this.ensureColumn('issues', 'pr_url', 'TEXT')
    this.rebuildAgentRunsIfNeeded()
    this.rebuildIssuesIfNeeded()
    this.sqlite.exec(`
      CREATE INDEX IF NOT EXISTS idx_agent_runs_created_at
        ON agent_runs (created_at DESC);

      CREATE INDEX IF NOT EXISTS idx_agent_runs_workspace_id
        ON agent_runs (workspace_id);

      CREATE INDEX IF NOT EXISTS idx_agent_runs_issue_id
        ON agent_runs (issue_id);

      CREATE INDEX IF NOT EXISTS idx_agent_runs_kind_created_at
        ON agent_runs (kind, created_at DESC);

      CREATE INDEX IF NOT EXISTS idx_issues_project_status
        ON issues (project_id, status);

      CREATE INDEX IF NOT EXISTS idx_issues_updated_at
        ON issues (updated_at DESC);

      CREATE INDEX IF NOT EXISTS idx_sandbox_workspaces_project_kind
        ON sandbox_workspaces (project_id, kind);

      CREATE INDEX IF NOT EXISTS idx_sandbox_workspaces_issue_id
        ON sandbox_workspaces (issue_id);

      UPDATE agent_projects
      SET workspace_id = (
        SELECT workspace_id
        FROM agent_project_workspaces
        WHERE project_id = agent_projects.id
        ORDER BY sequence ASC
        LIMIT 1
      )
      WHERE workspace_id IS NULL
        AND EXISTS (
          SELECT 1
          FROM agent_project_workspaces
          WHERE project_id = agent_projects.id
        );

      UPDATE agent_projects
      SET repository_url = (
        SELECT repository_url
        FROM sandbox_workspaces
        WHERE id = agent_projects.workspace_id
      )
      WHERE repository_url IS NULL
        AND workspace_id IS NOT NULL;

      UPDATE agent_projects
      SET repository_ref = (
        SELECT workspace_ref
        FROM sandbox_workspaces
        WHERE id = agent_projects.workspace_id
      )
      WHERE repository_ref IS NULL
        AND workspace_id IS NOT NULL;
    `)
  }

  private ensureColumn(
    tableName: string,
    columnName: string,
    definition: string,
  ) {
    const columns = this.sqlite
      .prepare(`PRAGMA table_info(${tableName})`)
      .all() as Array<{ name: string }>

    if (!columns.some((column) => column.name === columnName)) {
      this.sqlite.exec(
        `ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`,
      )
    }
  }

  private rebuildAgentRunsIfNeeded() {
    const row = this.sqlite
      .prepare(
        "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'agent_runs'",
      )
      .get() as { sql?: string } | undefined

    if (row?.sql?.includes("'verification'")) {
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
          title TEXT NOT NULL,
          kind TEXT NOT NULL DEFAULT 'coding' CHECK (kind IN ('coding', 'requirements', 'planning', 'verification', 'publish', 'followup')),
          project_id TEXT,
          issue_id TEXT,
          branch_name TEXT,
          pr_url TEXT,
          result_summary TEXT,
          status TEXT NOT NULL CHECK (status IN ('idle', 'running', 'awaiting_user', 'completed', 'failed')),
          context_json TEXT,
          error TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        INSERT INTO agent_runs_new (
          id, workspace_id, endpoint_id, model, title, kind, project_id, issue_id, branch_name, pr_url,
          result_summary, status, context_json, error, created_at, updated_at
        )
        SELECT
          id, workspace_id, endpoint_id, model, title, kind, project_id, issue_id, branch_name, pr_url,
          result_summary, status, context_json, error, created_at, updated_at
        FROM agent_runs;

        DROP TABLE agent_runs;
        ALTER TABLE agent_runs_new RENAME TO agent_runs;
      `)
    } finally {
      this.sqlite.exec('PRAGMA foreign_keys = ON')
    }
  }

  private rebuildIssuesIfNeeded() {
    const row = this.sqlite
      .prepare(
        "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'issues'",
      )
      .get() as { sql?: string } | undefined

    if (
      row?.sql?.includes("'planning'") &&
      row.sql.includes("'awaiting_user'")
    ) {
      return
    }

    this.sqlite.exec('PRAGMA foreign_keys = OFF')
    try {
      this.sqlite.exec(`
        CREATE TABLE issues_new (
          id TEXT PRIMARY KEY,
          title TEXT NOT NULL,
          description TEXT NOT NULL,
          project_id TEXT NOT NULL REFERENCES agent_projects (id),
          workspace_id TEXT,
          endpoint_id TEXT,
          requirement_run_id TEXT,
          planning_run_id TEXT,
          agent_run_id TEXT,
          status TEXT NOT NULL CHECK (status IN ('backlog', 'planning', 'ready', 'running', 'awaiting_user', 'review', 'completed', 'blocked', 'failed')),
          priority TEXT NOT NULL CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
          analysis TEXT,
          branch_name TEXT,
          pr_url TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        INSERT INTO issues_new (
          id, title, description, project_id, workspace_id, endpoint_id, requirement_run_id, planning_run_id,
          agent_run_id, status, priority, analysis, branch_name, pr_url, created_at, updated_at
        )
        SELECT
          id, title, description, project_id, workspace_id, endpoint_id, requirement_run_id, planning_run_id,
          agent_run_id, status, priority, analysis, branch_name, pr_url, created_at, updated_at
        FROM issues;

        DROP TABLE issues;
        ALTER TABLE issues_new RENAME TO issues;
      `)
    } finally {
      this.sqlite.exec('PRAGMA foreign_keys = ON')
    }
  }
}

export const toSqlBoolean = (value: boolean) => (value ? 1 : 0)

export const fromSqlBoolean = (value: unknown) => Number(value) === 1

export const optionalString = (value: unknown) =>
  typeof value === 'string' && value.length > 0 ? value : undefined
