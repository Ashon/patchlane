import { spawn } from "node:child_process";
import type { SandboxExecResult } from "@agent-fleet/shared";

type RunProcessInput = {
  command: string;
  args: string[];
  cwd: string;
  env: NodeJS.ProcessEnv;
  timeoutMs: number;
  maxOutputBytes: number;
};

export const runProcess = ({
  command,
  args,
  cwd,
  env,
  timeoutMs,
  maxOutputBytes
}: RunProcessInput): Promise<SandboxExecResult> => {
  const startedAt = Date.now();

  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env,
      shell: false,
      windowsHide: true
    });

    let stdout = "";
    let stderr = "";
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let truncated = false;
    let timedOut = false;

    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
    }, timeoutMs);

    child.once("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });

    child.stdout.on("data", (chunk: Buffer) => {
      const next = appendBounded(stdout, stdoutBytes, chunk, maxOutputBytes);
      stdout = next.value;
      stdoutBytes = next.bytes;
      truncated ||= next.truncated;
    });

    child.stderr.on("data", (chunk: Buffer) => {
      const next = appendBounded(stderr, stderrBytes, chunk, maxOutputBytes);
      stderr = next.value;
      stderrBytes = next.bytes;
      truncated ||= next.truncated;
    });

    child.once("close", (exitCode, signal) => {
      clearTimeout(timeout);
      resolve({
        ok: exitCode === 0 && !timedOut,
        command,
        args,
        cwd,
        exitCode,
        signal,
        durationMs: Date.now() - startedAt,
        stdout,
        stderr,
        truncated,
        timedOut
      });
    });
  });
};

const appendBounded = (current: string, currentBytes: number, chunk: Buffer, maxBytes: number) => {
  if (currentBytes >= maxBytes) {
    return {
      value: current,
      bytes: currentBytes,
      truncated: true
    };
  }

  const available = maxBytes - currentBytes;
  const nextChunk = chunk.byteLength > available ? chunk.subarray(0, available) : chunk;

  return {
    value: current + nextChunk.toString("utf8"),
    bytes: currentBytes + nextChunk.byteLength,
    truncated: chunk.byteLength > available
  };
};
