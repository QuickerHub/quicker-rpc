import type { DevTempWorkspaceCleanupResult } from "@/lib/dev-temp-workspace.shared";

export type CreateDevTempWorkspaceResult = {
  path: string;
  id: string;
};

export async function createDevTempWorkspaceClient(options?: {
  seed?: "eval-workspace" | "empty";
}): Promise<CreateDevTempWorkspaceResult> {
  const res = await fetch("/api/dev/temp-workspace", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ seed: options?.seed ?? "eval-workspace" }),
  });
  const data = (await res.json()) as CreateDevTempWorkspaceResult & { error?: string };
  if (!res.ok) {
    throw new Error(data.error ?? `HTTP ${res.status}`);
  }
  return data;
}

export async function cleanupDevTempWorkspaceClient(
  path: string,
): Promise<DevTempWorkspaceCleanupResult> {
  const res = await fetch("/api/dev/temp-workspace", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path }),
  });
  const data = (await res.json()) as DevTempWorkspaceCleanupResult & {
    ok?: boolean;
    error?: string;
  };
  if (!res.ok) {
    throw new Error(data.error ?? `HTTP ${res.status}`);
  }
  return data;
}
