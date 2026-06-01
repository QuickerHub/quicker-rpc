/** Structured tool output (local docs or qkrpc). */

export type StructuredToolResult = {
  ok: boolean;
  exitCode: number;
  source?: "local" | "qkrpc";
  data: unknown;
  stderr?: string;
  truncated?: boolean;
};

export function formatLocalToolResult(
  data: unknown,
  ok = true,
  error?: string,
): StructuredToolResult {
  return {
    ok,
    exitCode: ok ? 0 : 1,
    source: "local",
    data,
    stderr: error,
  };
}

export function isStructuredToolResult(
  value: unknown,
): value is StructuredToolResult {
  if (typeof value !== "object" || value === null) return false;
  const o = value as Record<string, unknown>;
  return typeof o.ok === "boolean" && typeof o.exitCode === "number" && "data" in o;
}
