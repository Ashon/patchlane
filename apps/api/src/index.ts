import cors from "cors";
import express from "express";
import { ZodError } from "zod";
import { env } from "./config/env";
import { HttpError } from "./http/errors";
import { LlmEndpointStore } from "./llm/endpointStore";
import { createLlmRouter } from "./routes/llm";

const app = express();
const store = new LlmEndpointStore(env.llmEndpointsFile, env.defaultEndpoint);

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

app.use("/api/llm", createLlmRouter({ store }));

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

