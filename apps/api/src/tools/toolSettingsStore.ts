import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  publicToolSettingsSchema,
  toolSettingsSchema,
  updateGitHubToolSettingsSchema,
  type GitHubToolSettings,
  type PublicToolSettings,
  type ToolSettings,
  type UpdateGitHubToolSettingsInput
} from "@agent-fleet/shared";

export class ToolSettingsStore {
  constructor(private readonly filePath: string) {}

  async get() {
    return this.read();
  }

  async getPublic() {
    return toPublicSettings(await this.read());
  }

  async updateGitHub(input: UpdateGitHubToolSettingsInput) {
    const parsed = updateGitHubToolSettingsSchema.parse(input);
    const settings = await this.read();
    const now = new Date().toISOString();
    const token = parsed.clearToken ? undefined : parsed.token || settings.github.token;
    const validationStateCleared = Boolean(parsed.clearToken || parsed.token);

    const github: GitHubToolSettings = {
      enabled: parsed.enabled ?? settings.github.enabled,
      scopes: validationStateCleared ? [] : settings.github.scopes,
      token,
      username: validationStateCleared ? undefined : settings.github.username,
      updatedAt: now,
      validatedAt: validationStateCleared ? undefined : settings.github.validatedAt
    };

    const next = toolSettingsSchema.parse({
      ...settings,
      github
    });

    await this.write(next);
    return toPublicSettings(next);
  }

  async markGitHubValidated(username: string | undefined, scopes: string[], validatedAt: string) {
    const settings = await this.read();
    const next = toolSettingsSchema.parse({
      ...settings,
      github: {
        ...settings.github,
        scopes,
        username,
        validatedAt,
        updatedAt: settings.github.updatedAt || validatedAt
      }
    });

    await this.write(next);
    return toPublicSettings(next);
  }

  private async read(): Promise<ToolSettings> {
    try {
      const raw = await readFile(this.filePath, "utf8");
      return toolSettingsSchema.parse(JSON.parse(raw));
    } catch (error) {
      if (isMissingFileError(error)) {
        const seeded = toolSettingsSchema.parse({});
        await this.write(seeded);
        return seeded;
      }

      throw error;
    }
  }

  private async write(settings: ToolSettings) {
    await mkdir(path.dirname(this.filePath), { recursive: true });

    const tmpPath = `${this.filePath}.${process.pid}.tmp`;
    await writeFile(tmpPath, `${JSON.stringify(settings, null, 2)}\n`, "utf8");
    await rename(tmpPath, this.filePath);
  }
}

const toPublicSettings = (settings: ToolSettings): PublicToolSettings => {
  const tokenConfigured = Boolean(settings.github.token);

  return publicToolSettingsSchema.parse({
    github: {
      enabled: settings.github.enabled,
      scopes: settings.github.scopes,
      username: settings.github.username,
      updatedAt: settings.github.updatedAt,
      validatedAt: settings.github.validatedAt,
      tokenConfigured,
      tokenPreview: settings.github.token ? maskToken(settings.github.token) : undefined
    }
  });
};

const maskToken = (token: string) => {
  if (token.length <= 12) {
    return "configured";
  }

  return `${token.slice(0, 6)}...${token.slice(-4)}`;
};

const isMissingFileError = (error: unknown) => {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
};
