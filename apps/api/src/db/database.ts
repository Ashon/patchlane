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
        subtask_id TEXT,
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
        tool_input_json TEXT,
        metadata_json TEXT,
        created_at TEXT NOT NULL,
        sequence INTEGER NOT NULL,
        UNIQUE (run_id, sequence)
      );

      CREATE INDEX IF NOT EXISTS idx_agent_run_messages_run_id_sequence
        ON agent_run_messages (run_id, sequence);

      CREATE TABLE IF NOT EXISTS agent_projects (
        id TEXT PRIMARY KEY,
        code TEXT NOT NULL DEFAULT '',
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
        number INTEGER NOT NULL,
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        project_id TEXT NOT NULL REFERENCES agent_projects (id),
        workspace_id TEXT,
        endpoint_id TEXT,
        requirement_run_id TEXT,
        planning_run_id TEXT,
        agent_run_id TEXT,
        status TEXT NOT NULL CHECK (status IN ('backlog', 'planning', 'ready', 'running', 'awaiting_user', 'review', 'completed', 'finalized', 'blocked', 'failed')),
        priority TEXT NOT NULL CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
        analysis TEXT,
        branch_name TEXT,
        pr_url TEXT,
        artifact_manifest_json TEXT,
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

      CREATE TABLE IF NOT EXISTS issue_comments (
        id TEXT PRIMARY KEY,
        issue_id TEXT NOT NULL REFERENCES issues (id) ON DELETE CASCADE,
        run_id TEXT,
        author TEXT NOT NULL CHECK (author IN ('agent', 'user', 'system')),
        kind TEXT NOT NULL CHECK (kind IN ('progress', 'decision', 'blocked', 'summary')),
        body TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_issue_comments_issue_created_at
        ON issue_comments (issue_id, created_at ASC);

      CREATE TABLE IF NOT EXISTS issue_subtasks (
        id TEXT PRIMARY KEY,
        issue_id TEXT NOT NULL REFERENCES issues (id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        description TEXT,
        status TEXT NOT NULL CHECK (status IN ('pending', 'running', 'awaiting_user', 'completed', 'failed', 'skipped')),
        kind TEXT NOT NULL CHECK (kind IN ('inspect', 'edit', 'verify', 'publish', 'followup')),
        sequence INTEGER NOT NULL,
        depends_on_json TEXT NOT NULL DEFAULT '[]',
        agent_run_id TEXT,
        result_summary TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_issue_subtasks_issue_sequence
        ON issue_subtasks (issue_id, sequence ASC);

      CREATE INDEX IF NOT EXISTS idx_issue_subtasks_agent_run_id
        ON issue_subtasks (agent_run_id);
    `)
    this.ensureColumn('agent_runs', 'kind', "TEXT NOT NULL DEFAULT 'coding'")
    this.ensureColumn('agent_runs', 'project_id', 'TEXT')
    this.ensureColumn('agent_runs', 'issue_id', 'TEXT')
    this.ensureColumn('agent_runs', 'subtask_id', 'TEXT')
    this.ensureColumn('agent_runs', 'branch_name', 'TEXT')
    this.ensureColumn('agent_runs', 'pr_url', 'TEXT')
    this.ensureColumn('agent_runs', 'result_summary', 'TEXT')
    this.ensureColumn('agent_runs', 'context_json', 'TEXT')
    this.ensureColumn('agent_run_messages', 'tool_input_json', 'TEXT')
    this.ensureColumn('agent_run_messages', 'metadata_json', 'TEXT')
    this.ensureColumn('agent_projects', 'repository_url', 'TEXT')
    this.ensureColumn('agent_projects', 'repository_ref', 'TEXT')
    this.ensureColumn('agent_projects', 'workspace_id', 'TEXT')
    this.ensureColumn('agent_projects', 'code', "TEXT NOT NULL DEFAULT ''")
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
    this.ensureColumn('issues', 'number', 'INTEGER NOT NULL DEFAULT 0')
    this.ensureColumn('issues', 'artifact_manifest_json', 'TEXT')
    this.rebuildAgentRunsIfNeeded()
    this.rebuildIssuesIfNeeded()
    this.backfillProjectCodes()
    this.backfillIssueNumbers()
    this.sqlite.exec(`
      CREATE INDEX IF NOT EXISTS idx_agent_runs_created_at
        ON agent_runs (created_at DESC);

      CREATE INDEX IF NOT EXISTS idx_agent_runs_workspace_id
        ON agent_runs (workspace_id);

      CREATE INDEX IF NOT EXISTS idx_agent_runs_issue_id
        ON agent_runs (issue_id);

      CREATE INDEX IF NOT EXISTS idx_agent_runs_subtask_id
        ON agent_runs (subtask_id);

      CREATE INDEX IF NOT EXISTS idx_agent_runs_kind_created_at
        ON agent_runs (kind, created_at DESC);

      CREATE INDEX IF NOT EXISTS idx_issues_project_status
        ON issues (project_id, status);

      CREATE UNIQUE INDEX IF NOT EXISTS idx_issues_project_number
        ON issues (project_id, number);

      CREATE INDEX IF NOT EXISTS idx_issues_updated_at
        ON issues (updated_at DESC);

      CREATE INDEX IF NOT EXISTS idx_issue_comments_issue_created_at
        ON issue_comments (issue_id, created_at ASC);

      CREATE INDEX IF NOT EXISTS idx_issue_subtasks_issue_sequence
        ON issue_subtasks (issue_id, sequence ASC);

      CREATE INDEX IF NOT EXISTS idx_issue_subtasks_agent_run_id
        ON issue_subtasks (agent_run_id);

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
          subtask_id TEXT,
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
          id, workspace_id, endpoint_id, model, title, kind, project_id, issue_id, subtask_id, branch_name, pr_url,
          result_summary, status, context_json, error, created_at, updated_at
        )
        SELECT
          id, workspace_id, endpoint_id, model, title, kind, project_id, issue_id, NULL, branch_name, pr_url,
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
      row.sql.includes("'awaiting_user'") &&
      row.sql.includes("'finalized'") &&
      row.sql.includes('artifact_manifest_json')
    ) {
      return
    }

    this.sqlite.exec('PRAGMA foreign_keys = OFF')
    try {
      this.sqlite.exec(`
        CREATE TABLE issues_new (
          id TEXT PRIMARY KEY,
          number INTEGER NOT NULL DEFAULT 0,
          title TEXT NOT NULL,
          description TEXT NOT NULL,
          project_id TEXT NOT NULL REFERENCES agent_projects (id),
          workspace_id TEXT,
          endpoint_id TEXT,
          requirement_run_id TEXT,
          planning_run_id TEXT,
          agent_run_id TEXT,
          status TEXT NOT NULL CHECK (status IN ('backlog', 'planning', 'ready', 'running', 'awaiting_user', 'review', 'completed', 'finalized', 'blocked', 'failed')),
          priority TEXT NOT NULL CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
          analysis TEXT,
          branch_name TEXT,
          pr_url TEXT,
          artifact_manifest_json TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        INSERT INTO issues_new (
          id, number, title, description, project_id, workspace_id, endpoint_id, requirement_run_id, planning_run_id,
          agent_run_id, status, priority, analysis, branch_name, pr_url, artifact_manifest_json, created_at, updated_at
        )
        SELECT
          id, number, title, description, project_id, workspace_id, endpoint_id, requirement_run_id, planning_run_id,
          agent_run_id, status, priority, analysis, branch_name, pr_url, artifact_manifest_json, created_at, updated_at
        FROM issues;

        DROP TABLE issues;
        ALTER TABLE issues_new RENAME TO issues;
      `)
    } finally {
      this.sqlite.exec('PRAGMA foreign_keys = ON')
    }
  }

  private backfillIssueNumbers() {
    const missingRows = this.sqlite
      .prepare(
        'SELECT id, project_id FROM issues WHERE number <= 0 ORDER BY project_id ASC, created_at ASC, id ASC',
      )
      .all() as Array<{ id: string; project_id: string }>

    if (missingRows.length === 0) {
      return
    }

    const nextByProjectId = new Map<string, number>()
    const maxRows = this.sqlite
      .prepare(
        'SELECT project_id, MAX(number) AS max_number FROM issues GROUP BY project_id',
      )
      .all() as Array<{ max_number: number | null; project_id: string }>

    for (const row of maxRows) {
      nextByProjectId.set(row.project_id, row.max_number ?? 0)
    }

    const update = this.sqlite.prepare(
      'UPDATE issues SET number = ? WHERE id = ?',
    )

    this.transaction(() => {
      for (const row of missingRows) {
        const next = (nextByProjectId.get(row.project_id) ?? 0) + 1
        nextByProjectId.set(row.project_id, next)
        update.run(next, row.id)
      }
    })
  }

  private backfillProjectCodes() {
    const rows = this.sqlite
      .prepare(
        "SELECT id, name, code FROM agent_projects ORDER BY created_at ASC, id ASC",
      )
      .all() as Array<{ code: string | null; id: string; name: string }>
    const usedCodes = new Set(
      rows
        .map((row) => normalizeProjectCode(row.code ?? ''))
        .filter((code) => code.length > 0),
    )
    const missingRows = rows.filter(
      (row) => normalizeProjectCode(row.code ?? '').length === 0,
    )

    if (missingRows.length === 0) {
      return
    }

    const update = this.sqlite.prepare(
      'UPDATE agent_projects SET code = ? WHERE id = ?',
    )

    this.transaction(() => {
      for (const row of missingRows) {
        const code = getUniqueProjectCode(row.name, usedCodes)
        usedCodes.add(code)
        update.run(code, row.id)
      }
    })
  }
}

export const toSqlBoolean = (value: boolean) => (value ? 1 : 0)

export const fromSqlBoolean = (value: unknown) => Number(value) === 1

export const optionalString = (value: unknown) =>
  typeof value === 'string' && value.length > 0 ? value : undefined

const normalizeProjectCode = (value: string) =>
  value.trim().toUpperCase().replace(/[^A-Z0-9]/g, '')

const getUniqueProjectCode = (name: string, usedCodes: Set<string>) => {
  const base = getProjectCodeBase(name)

  if (!usedCodes.has(base)) {
    return base
  }

  for (let index = 2; index < 1000; index += 1) {
    const suffix = String(index)
    const candidate = `${base.slice(0, Math.max(2, 8 - suffix.length))}${suffix}`

    if (!usedCodes.has(candidate)) {
      return candidate
    }
  }

  return `${base.slice(0, 5)}${Date.now().toString(36).slice(-3).toUpperCase()}`
}

const getProjectCodeBase = (name: string) => {
  const normalized = normalizeProjectCode(name)

  if (/^[A-Z][A-Z0-9]{1,7}$/.test(normalized)) {
    return normalized
  }

  if (normalized === 'PATCHLANE') {
    return 'PLN'
  }

  const words = name
    .trim()
    .split(/[^A-Za-z0-9]+/)
    .map((word) => normalizeProjectCode(word))
    .filter(Boolean)

  if (words.length >= 2) {
    return words
      .map((word) => word[0])
      .join('')
      .slice(0, 8)
      .padEnd(3, 'X')
  }

  const consonants = normalized.replace(/[AEIOU]/g, '')
  const candidate = (consonants || normalized).slice(0, 3).padEnd(3, 'X')

  return candidate || 'PRJ'
}
