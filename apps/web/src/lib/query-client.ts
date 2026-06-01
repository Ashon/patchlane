import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 15_000
    }
  }
});

export const queryKeys = {
  agentRuns: ["agent-runs"] as const,
  endpoints: ["llm-endpoints"] as const,
  health: ["health"] as const,
  sandboxSettings: ["sandbox-settings"] as const,
  sandboxWorkspaces: ["sandbox-workspaces"] as const,
  toolSettings: ["tool-settings"] as const
};
