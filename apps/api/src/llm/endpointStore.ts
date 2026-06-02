import { randomUUID } from 'node:crypto'
import {
  createLlmEndpointSchema,
  llmEndpointListSchema,
  llmEndpointSchema,
  updateLlmEndpointSchema,
  type CreateLlmEndpointInput,
  type LlmEndpoint,
  type UpdateLlmEndpointInput,
} from '@agent-fleet/shared'
import {
  AppDatabase,
  fromSqlBoolean,
  optionalString,
  toSqlBoolean,
} from '../db/database'
import { readLegacyJson } from '../db/legacyJson'
import { notFound } from '../http/errors'

type LlmEndpointRow = {
  id: string
  name: string
  base_url: string
  default_model: string
  api_key_env_var: string | null
  enabled: number
  created_at: string
  updated_at: string
}

export class LlmEndpointStore {
  constructor(
    private readonly database: AppDatabase,
    private readonly seedEndpoint: CreateLlmEndpointInput,
    private readonly legacyFilePath?: string,
  ) {
    this.ensureSeeded()
  }

  async list() {
    const rows = this.database.sqlite
      .prepare('SELECT * FROM llm_endpoints ORDER BY name ASC')
      .all() as unknown as LlmEndpointRow[]

    return llmEndpointListSchema.parse(rows.map(toEndpoint))
  }

  async get(id: string) {
    const endpoint = this.getById(id)

    if (!endpoint) {
      throw notFound(`LLM endpoint '${id}' was not found`)
    }

    return endpoint
  }

  async getDefault() {
    const row = this.database.sqlite
      .prepare(
        'SELECT * FROM llm_endpoints WHERE enabled = 1 ORDER BY name ASC LIMIT 1',
      )
      .get() as unknown as LlmEndpointRow | undefined

    if (!row) {
      throw notFound('No enabled LLM endpoint is configured')
    }

    return toEndpoint(row)
  }

  async create(input: CreateLlmEndpointInput) {
    const parsed = createLlmEndpointSchema.parse(input)
    const now = new Date().toISOString()
    const endpoint = llmEndpointSchema.parse({
      ...parsed,
      id: randomUUID(),
      createdAt: now,
      updatedAt: now,
    })

    this.insert(endpoint)
    return endpoint
  }

  async update(id: string, input: UpdateLlmEndpointInput) {
    const current = await this.get(id)
    const parsed = updateLlmEndpointSchema.parse(input)
    const updated = llmEndpointSchema.parse({
      ...current,
      ...parsed,
      id: current.id,
      createdAt: current.createdAt,
      updatedAt: new Date().toISOString(),
    })

    this.database.sqlite
      .prepare(
        `
        UPDATE llm_endpoints
        SET name = ?, base_url = ?, default_model = ?, api_key_env_var = ?, enabled = ?, updated_at = ?
        WHERE id = ?
      `,
      )
      .run(
        updated.name,
        updated.baseUrl,
        updated.defaultModel,
        updated.apiKeyEnvVar ?? null,
        toSqlBoolean(updated.enabled),
        updated.updatedAt,
        updated.id,
      )

    return updated
  }

  async remove(id: string) {
    const result = this.database.sqlite
      .prepare('DELETE FROM llm_endpoints WHERE id = ?')
      .run(id)

    if (result.changes === 0) {
      throw notFound(`LLM endpoint '${id}' was not found`)
    }
  }

  private getById(id: string) {
    const row = this.database.sqlite
      .prepare('SELECT * FROM llm_endpoints WHERE id = ?')
      .get(id) as unknown as LlmEndpointRow | undefined

    return row ? toEndpoint(row) : undefined
  }

  private ensureSeeded() {
    const countRow = this.database.sqlite
      .prepare('SELECT COUNT(*) AS count FROM llm_endpoints')
      .get() as { count: number }

    if (countRow.count > 0) {
      return
    }

    const legacyEndpoints = readLegacyJson(
      this.legacyFilePath,
      llmEndpointListSchema,
    )
    const endpoints = legacyEndpoints?.length ? legacyEndpoints : this.seed()

    this.database.transaction(() => {
      for (const endpoint of endpoints) {
        this.insert(endpoint)
      }
    })
  }

  private seed() {
    const parsed = createLlmEndpointSchema.parse(this.seedEndpoint)
    const now = new Date().toISOString()

    return [
      llmEndpointSchema.parse({
        ...parsed,
        id: 'local-default',
        createdAt: now,
        updatedAt: now,
      }),
    ]
  }

  private insert(endpoint: LlmEndpoint) {
    this.database.sqlite
      .prepare(
        `
        INSERT INTO llm_endpoints (
          id, name, base_url, default_model, api_key_env_var, enabled, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
      )
      .run(
        endpoint.id,
        endpoint.name,
        endpoint.baseUrl,
        endpoint.defaultModel,
        endpoint.apiKeyEnvVar ?? null,
        toSqlBoolean(endpoint.enabled),
        endpoint.createdAt,
        endpoint.updatedAt,
      )
  }
}

const toEndpoint = (row: LlmEndpointRow) => {
  return llmEndpointSchema.parse({
    id: row.id,
    name: row.name,
    baseUrl: row.base_url,
    defaultModel: row.default_model,
    apiKeyEnvVar: optionalString(row.api_key_env_var),
    enabled: fromSqlBoolean(row.enabled),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  })
}
