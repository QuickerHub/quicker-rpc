import type { AgentArtifactRef } from "@/lib/agent-harness/artifacts/types";

function readRecord(value: unknown): Record<string, unknown> | null {
  return value != null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function readAgentArtifactRef(value: unknown): AgentArtifactRef | null {
  const record = readRecord(value);
  if (!record) return null;
  const nested = readRecord(record.artifactRef) ?? record;
  const path = typeof nested.path === "string" ? nested.path.trim() : "";
  if (!path) return null;
  const format = typeof nested.format === "string" ? nested.format : "artifact";
  const bytesWritten =
    typeof nested.bytesWritten === "number" ? nested.bytesWritten : undefined;
  return { path, format, bytesWritten };
}

export function formatArtifactBytes(bytes?: number): string | null {
  if (bytes == null || bytes <= 0) return null;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
