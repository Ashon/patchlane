# Agent Fleet

OpenAI API compatible local LLM endpoints for an agent fleet control plane.

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

Run each side independently when needed:

```bash
pnpm dev:api
pnpm dev:web
```

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

## Tool Settings

GitHub tool settings are stored locally in `apps/api/.data/tool-settings.json`.

The frontend `Tool Settings` tab can register a GitHub personal access token for future agent-side HTTPS git operations. The API keeps the token server-side and only returns masked/configured state to the UI.

## Agent Sandbox

Sandbox workspaces are stored under `apps/api/.data/sandboxes` by default, with workspace metadata in `apps/api/.data/sandbox-workspaces.json`.

The API can create isolated workspaces, clone GitHub repositories into them, and run coding-agent tasks against a selected workspace. The frontend keeps workspace creation, selection, deletion, and sandbox policy in the `Workspaces` tab, while the `Agent Sandbox` tab focuses on agent run history and the coding-agent conversation. Agent runs are stored in `apps/api/.data/agent-runs.json`.

Agent runs communicate with the user through a thread. The backend gives the selected local LLM a constrained tool surface for listing files, reading/writing files, running allowlisted commands, checking git status/diff, and creating a GitHub pull request after the agent has committed and pushed a branch. Paths are constrained to the selected workspace. GitHub PAT credentials are injected into git/GitHub operations server-side and are not returned to the UI.

Default sandbox policy:

```bash
SANDBOX_ROOT_DIR=.data/sandboxes
SANDBOX_DEFAULT_TIMEOUT_MS=120000
SANDBOX_MAX_OUTPUT_BYTES=131072
SANDBOX_ALLOWED_COMMANDS=git,pnpm,npm,node,tsx,tsc,ls,pwd,cat,rg,sed
SANDBOX_ENV_ALLOWLIST=PATH,HOME,LANG,LC_ALL
```

## API

- `GET /health`
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
