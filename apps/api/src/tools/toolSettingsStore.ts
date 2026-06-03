import {
  publicToolSettingsSchema,
  toolSettingsSchema,
  updateGitHubToolSettingsSchema,
  type GitHubToolSettings,
  type PublicToolSettings,
  type ToolSettings,
  type UpdateGitHubToolSettingsInput,
} from '@patchlane/shared'
import {
  AppDatabase,
  fromSqlBoolean,
  optionalString,
  toSqlBoolean,
} from '../db/database'
import { readLegacyJson } from '../db/legacyJson'

type GitHubToolSettingsRow = {
  id: 'github'
  enabled: number
  token: string | null
  username: string | null
  scopes_json: string
  updated_at: string | null
  validated_at: string | null
}

export class ToolSettingsStore {
  constructor(
    private readonly database: AppDatabase,
    private readonly legacyFilePath?: string,
  ) {
    this.ensureSeeded()
  }

  async get() {
    return this.read()
  }

  async getPublic() {
    return toPublicSettings(await this.read())
  }

  async updateGitHub(input: UpdateGitHubToolSettingsInput) {
    const parsed = updateGitHubToolSettingsSchema.parse(input)
    const settings = await this.read()
    const now = new Date().toISOString()
    const token = parsed.clearToken
      ? undefined
      : parsed.token || settings.github.token
    const validationStateCleared = Boolean(parsed.clearToken || parsed.token)

    const github: GitHubToolSettings = {
      enabled: parsed.enabled ?? settings.github.enabled,
      scopes: validationStateCleared ? [] : settings.github.scopes,
      token,
      username: validationStateCleared ? undefined : settings.github.username,
      updatedAt: now,
      validatedAt: validationStateCleared
        ? undefined
        : settings.github.validatedAt,
    }

    const next = toolSettingsSchema.parse({
      ...settings,
      github,
    })

    this.write(next)
    return toPublicSettings(next)
  }

  async markGitHubValidated(
    username: string | undefined,
    scopes: string[],
    validatedAt: string,
  ) {
    const settings = await this.read()
    const next = toolSettingsSchema.parse({
      ...settings,
      github: {
        ...settings.github,
        scopes,
        username,
        validatedAt,
        updatedAt: settings.github.updatedAt || validatedAt,
      },
    })

    this.write(next)
    return toPublicSettings(next)
  }

  private read(): ToolSettings {
    const row = this.database.sqlite
      .prepare("SELECT * FROM github_tool_settings WHERE id = 'github'")
      .get() as unknown as GitHubToolSettingsRow | undefined

    if (!row) {
      const seeded = toolSettingsSchema.parse({})
      this.write(seeded)
      return seeded
    }

    return toolSettingsSchema.parse({
      github: {
        enabled: fromSqlBoolean(row.enabled),
        token: optionalString(row.token),
        username: optionalString(row.username),
        scopes: parseScopes(row.scopes_json),
        updatedAt: optionalString(row.updated_at),
        validatedAt: optionalString(row.validated_at),
      },
    })
  }

  private write(settings: ToolSettings) {
    this.database.sqlite
      .prepare(
        `
        INSERT INTO github_tool_settings (
          id, enabled, token, username, scopes_json, updated_at, validated_at
        ) VALUES ('github', ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          enabled = excluded.enabled,
          token = excluded.token,
          username = excluded.username,
          scopes_json = excluded.scopes_json,
          updated_at = excluded.updated_at,
          validated_at = excluded.validated_at
      `,
      )
      .run(
        toSqlBoolean(settings.github.enabled),
        settings.github.token ?? null,
        settings.github.username ?? null,
        JSON.stringify(settings.github.scopes),
        settings.github.updatedAt ?? null,
        settings.github.validatedAt ?? null,
      )
  }

  private ensureSeeded() {
    const row = this.database.sqlite
      .prepare("SELECT id FROM github_tool_settings WHERE id = 'github'")
      .get()

    if (row) {
      return
    }

    const legacySettings = readLegacyJson(
      this.legacyFilePath,
      toolSettingsSchema,
    )
    this.write(legacySettings ?? toolSettingsSchema.parse({}))
  }
}

const toPublicSettings = (settings: ToolSettings): PublicToolSettings => {
  const tokenConfigured = Boolean(settings.github.token)

  return publicToolSettingsSchema.parse({
    github: {
      enabled: settings.github.enabled,
      scopes: settings.github.scopes,
      username: settings.github.username,
      updatedAt: settings.github.updatedAt,
      validatedAt: settings.github.validatedAt,
      tokenConfigured,
      tokenPreview: settings.github.token
        ? maskToken(settings.github.token)
        : undefined,
    },
  })
}

const parseScopes = (value: string) => {
  const parsed = JSON.parse(value) as unknown
  return Array.isArray(parsed)
    ? parsed.filter((item): item is string => typeof item === 'string')
    : []
}

const maskToken = (token: string) => {
  if (token.length <= 12) {
    return 'configured'
  }

  return `${token.slice(0, 6)}...${token.slice(-4)}`
}
