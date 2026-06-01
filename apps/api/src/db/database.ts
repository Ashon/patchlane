import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

export class AppDatabase {
  readonly sqlite: DatabaseSync;

  constructor(filePath: string) {
    mkdirSync(path.dirname(filePath), { recursive: true });

    this.sqlite = new DatabaseSync(filePath);
    this.sqlite.exec("PRAGMA foreign_keys = ON");
    this.sqlite.exec("PRAGMA journal_mode = WAL");
    this.migrate();
  }

  transaction<T>(callback: () => T) {
    this.sqlite.exec("BEGIN IMMEDIATE");

    try {
      const result = callback();
      this.sqlite.exec("COMMIT");
      return result;
    } catch (error) {
      this.sqlite.exec("ROLLBACK");
      throw error;
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
        status TEXT NOT NULL CHECK (status IN ('idle', 'running', 'awaiting_user', 'completed', 'failed')),
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
        created_at TEXT NOT NULL,
        sequence INTEGER NOT NULL,
        UNIQUE (run_id, sequence)
      );

      CREATE INDEX IF NOT EXISTS idx_agent_run_messages_run_id_sequence
        ON agent_run_messages (run_id, sequence);
    `);
  }
}

export const toSqlBoolean = (value: boolean) => (value ? 1 : 0);

export const fromSqlBoolean = (value: unknown) => Number(value) === 1;

export const optionalString = (value: unknown) => (typeof value === "string" && value.length > 0 ? value : undefined);
