import cors from "cors";
import express from "express";
import { ZodError } from "zod";
import { AgentRunStore } from "./agent/agentRunStore";
import { env } from "./config/env";
import { HttpError } from "./http/errors";
import { LlmEndpointStore } from "./llm/endpointStore";
import { createAgentRouter } from "./routes/agent";
import { createLlmRouter } from "./routes/llm";
import { createSandboxRouter } from "./routes/sandbox";
import { createToolsRouter } from "./routes/tools";
import { SandboxWorkspaceStore } from "./sandbox/sandboxWorkspaceStore";
import { ToolSettingsStore } from "./tools/toolSettingsStore";

const app = express();
const llmStore = new LlmEndpointStore(env.llmEndpointsFile, env.defaultEndpoint);
const toolSettingsStore = new ToolSettingsStore(env.toolSettingsFile);
const sandboxWorkspaceStore = new SandboxWorkspaceStore(env.sandboxWorkspacesFile, env.sandbox.rootDir);
const agentRunStore = new AgentRunStore(env.agentRunsFile);

app.use(
  cors({
    origin: env.webOrigin === "*" ? true : env.webOrigin.split(",").map((origin) => origin.trim()),
    credentials: true
  })
);
app.use(express.json({ limit: "1mb" }));

app.get("/health", (_request, response) => {
  response.json({ ok: true });
});

app.use("/api/llm", createLlmRouter({ store: llmStore }));
app.use("/api/tools", createToolsRouter({ store: toolSettingsStore }));
app.use(
  "/api/agent",
  createAgentRouter({
    endpointStore: llmStore,
    runStore: agentRunStore,
    sandboxSettings: env.sandbox,
    toolSettingsStore,
    workspaceStore: sandboxWorkspaceStore
  })
);
app.use(
  "/api/sandbox",
  createSandboxRouter({
    settings: env.sandbox,
    toolSettingsStore,
    workspaceStore: sandboxWorkspaceStore
  })
);

app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
  if (error instanceof ZodError) {
    response.status(400).json({
      error: "Validation failed",
      details: error.flatten()
    });
    return;
  }

  if (error instanceof HttpError) {
    response.status(error.status).json({
      error: error.message,
      details: error.details
    });
    return;
  }

  console.error(error);
  response.status(500).json({ error: "Internal server error" });
});

app.listen(env.port, () => {
  console.log(`API listening on http://localhost:${env.port}`);
});
