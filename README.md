# Patchlane

Patchlane is an agentic coding workspace for creating isolated sandbox
workspaces, cloning repositories, and running coding agents that produce
pull requests.

## Stack

- pnpm workspace
- TypeScript
- Express API
- React + Vite
- shadcn/ui style components

## Development

```bash
pnpm install
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
pnpm dev
```

The web app runs on `http://localhost:8788`.
The API runs on `http://localhost:8787`.

For personal local development, leave `GOOGLE_OAUTH_CLIENT_ID` and
`GOOGLE_OAUTH_CLIENT_SECRET` empty in `apps/api/.env`. The web app reads
`GET /auth/config` and opens without Google login when the API has authentication
disabled. If the API cannot be reached, the app shows a retry screen instead of
enabling local access. Restart the API and reload the web app after changing
authentication settings.

The API listens on `127.0.0.1` by default. Keep that setting for local use without
authentication; deployments that need another bind address must set `HOST`
explicitly. Codex authentication is separate from Patchlane's Google login and
continues to use the official CLI's login.

API logs default to a local-friendly pretty format. Use structured JSON logs in deployments:

```bash
LOG_FORMAT=json
LOG_LEVEL=info
```

Run each side independently when needed:

```bash
pnpm dev:api
pnpm dev:web
```

## macOS App

Build an installable app on a Mac with Node.js 22.13+ and pnpm installed:

```bash
pnpm install
pnpm package:mac
```

The macOS Command Line Tools are required for icon generation and signing.
Install them with `xcode-select --install` if they are missing.

Outputs are written to `release/` for the build machine's architecture:

- `mac-arm64/Patchlane.app` on Apple Silicon, or `mac-x64/Patchlane.app` on Intel.
- `Patchlane-0.1.0-mac-<arch>.dmg`, with an Applications folder shortcut.
- `Patchlane-0.1.0-mac-<arch>.zip`, containing the same app.

Open the DMG and drag Patchlane into Applications, or unzip the ZIP and copy
`Patchlane.app` into Applications. Launch it from Finder or Spotlight. The
installed app includes Electron, the API, SQLite support, and the web UI; it
does not need the source checkout, Node.js, pnpm, or a separate API server to
launch. The local app opens directly without Google login.

Agent tools still need their own dependencies: configure an LLM endpoint, or
install Codex/OpenCode for the corresponding runtime. Git and project-specific
build tools must be installed to work on repositories. The app loads the login
shell's PATH so tools installed through Homebrew or nvm can be found.

Data is stored in `~/.patchlane`, including `patchlane.sqlite`, `sandboxes/`,
and `desktop.log`. An optional `~/.patchlane/.env` can configure LLM credentials
and agent settings. Closing the window keeps the app in the menu bar; use
`Quit Patchlane` to stop the app and its API. `Restart API` restarts the local
service without deleting data.

These artifacts are ad-hoc signed for local installation. Public distribution
requires [Developer ID signing and Apple notarization](https://www.electronjs.org/docs/latest/tutorial/code-signing).
If macOS blocks a downloaded local build, use the per-app Open Anyway control
in System Settings > Privacy & Security after attempting to open it.

Run the packaged integration check in a macOS graphical session:

```bash
pnpm --filter @patchlane/desktop test:packaged
```

It uses temporary data to verify the real renderer, preload bridge, bundled
API, workspace/run creation, and persistence across app restarts. It does not
call an LLM or use existing user data. A screenshot is saved to
`release/desktop-smoke.png`.

For desktop development, run `pnpm dev:desktop`. Set `PATCHLANE_API_URL` before
launch to use an external API; the UI follows that API's authentication settings.
The managed desktop API always has Google authentication disabled.
`PATCHLANE_DATA_DIR` and `PATCHLANE_USER_DATA_DIR` can override the
data and Electron profile directories for isolated testing.

The frontend is a standalone Vite app. It calls the backend through `VITE_API_BASE_URL`, so it does not depend on a Vite proxy.

## Local LLM Endpoint Defaults

The API seeds one endpoint from `apps/api/.env` when the endpoint store does not exist:

```bash
DEFAULT_LLM_ENDPOINT_NAME=Ollama Local
DEFAULT_LLM_BASE_URL=http://localhost:11434/v1
DEFAULT_LLM_MODEL=llama3.1
DEFAULT_LLM_API_KEY_ENV_VAR=LOCAL_LLM_API_KEY
LOCAL_LLM_API_KEY=local-llm
```

Endpoint metadata is stored in `apps/api/.data/llm-endpoints.json`. API keys are not stored there; only the environment variable name is stored.

## Tools

GitHub tool settings are stored locally in `apps/api/.data/tool-settings.json`.

The frontend `Tools` tab can register a GitHub personal access token for future agent-side HTTPS git operations. The API keeps the token server-side and only returns masked/configured state to the UI.

## Workspaces And Agent

Sandbox workspaces are stored under `apps/api/.data/sandboxes` by default, with workspace metadata in `apps/api/.data/sandbox-workspaces.json`.

The API can create isolated workspaces, clone GitHub repositories into them, and run coding-agent tasks against a selected workspace. The frontend keeps workspace creation, selection, deletion, and sandbox policy in the `Workspaces` tab, while the `Agent` tab focuses on agent run history and the coding-agent conversation. Agent runs are stored in `apps/api/.data/agent-runs.json`.

Agent runs communicate with the user through a thread. The backend gives the selected local LLM a constrained tool surface for listing files, reading/writing files, running allowlisted commands, checking git status/diff, and creating a GitHub pull request after the agent has committed and pushed a branch. Paths are constrained to the selected workspace. GitHub PAT credentials are injected into git/GitHub operations server-side and are not returned to the UI.

Default sandbox policy:

```bash
SANDBOX_ROOT_DIR=.data/sandboxes
SANDBOX_DEFAULT_TIMEOUT_MS=120000
SANDBOX_MAX_OUTPUT_BYTES=131072
SANDBOX_ALLOWED_COMMANDS=git,pnpm,npm,node,tsx,tsc,ls,pwd,cat,head,tail,wc,grep,awk,find,rg,sed,mkdir,cp,mv,rm,touch,chmod
SANDBOX_ENV_ALLOWLIST=PATH,HOME,LANG,LC_ALL
```

## Product Specs

- [Agent Design System Guidelines](docs/agent-design-system-guidelines.md): compact app shell, page primitives, chat work blocks, overlays, typography, and visual QA guidance for agents changing UI.

## API

- `GET /health`
- `GET /auth/config`
- `GET /api/llm/endpoints`
- `POST /api/llm/endpoints`
- `PATCH /api/llm/endpoints/:id`
- `DELETE /api/llm/endpoints/:id`
- `POST /api/llm/endpoints/:id/test`
- `POST /api/llm/chat`
- `POST /api/llm/chat/stream`
- `GET /api/tools/settings`
- `PATCH /api/tools/settings/github`
- `POST /api/tools/github/test`
- `GET /api/sandbox/settings`
- `GET /api/sandbox/workspaces`
- `POST /api/sandbox/workspaces`
- `POST /api/sandbox/workspaces/:id/exec`
- `DELETE /api/sandbox/workspaces/:id`
- `GET /api/agent/runs`
- `POST /api/agent/runs`
- `GET /api/agent/runs/:id`
- `DELETE /api/agent/runs/:id`
- `POST /api/agent/runs/:id/messages`
- `POST /api/agent/runs/:id/continue`
- `POST /api/agent/runs/:id/continue/stream`

## Chat UI

The frontend includes a Vite chat workbench for the selected endpoint. It supports streamed SSE output, extracted `<think>...</think>` reasoning, Markdown/GFM rendering, tables, code blocks, and copy actions.

shadcn/ui components are installed with the CLI against `apps/web`:

```bash
pnpm dlx shadcn@latest add button card input label textarea badge -c apps/web
```

Prompt Kit components are installed through the shadcn registry URL format:

```bash
pnpm dlx shadcn@latest add "https://prompt-kit.com/c/prompt-input.json" -c apps/web
```

The app also configures a Prompt Kit registry alias in `apps/web/components.json`, so future components can be added with `@prompt-kit/<component>`.
