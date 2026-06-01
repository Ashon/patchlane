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

## API

- `GET /health`
- `GET /api/llm/endpoints`
- `POST /api/llm/endpoints`
- `PATCH /api/llm/endpoints/:id`
- `DELETE /api/llm/endpoints/:id`
- `POST /api/llm/endpoints/:id/test`
- `POST /api/llm/chat`
- `POST /api/llm/chat/stream`

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
