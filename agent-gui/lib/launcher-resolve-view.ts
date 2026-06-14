import type { LauncherResolveAgentOutput } from "@/lib/launcher/launcher-resolve-agent-output";

export const LAUNCHER_RESOLVE_TOOL = "launcher_resolve";

export type { LauncherResolveAgentOutput };

export function parseLauncherResolveOutput(
  output: unknown,
): LauncherResolveAgentOutput | null {
  if (typeof output !== "object" || output === null || Array.isArray(output)) {
    return null;
  }
  const row = output as Record<string, unknown>;
  if (typeof row.ok !== "boolean") return null;
  return output as LauncherResolveAgentOutput;
}

export function launcherResolveHasPopupVisual(
  toolName: string,
  output: unknown,
): boolean {
  if (toolName !== LAUNCHER_RESOLVE_TOOL) return false;
  const parsed = parseLauncherResolveOutput(output);
  if (!parsed) return false;
  return Boolean(
    parsed.ranked?.length
    || parsed.next
    || parsed.alternatives?.length
    || parsed.message
    || parsed.missedTerms?.length,
  );
}
