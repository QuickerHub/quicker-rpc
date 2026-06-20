import type { DevTempWorkspaceCleanupResult } from "@/lib/dev-temp-workspace.shared";

export function formatDevTempWorkspaceCleanupSummary(
  result: DevTempWorkspaceCleanupResult,
): string {
  const parts: string[] = [];
  if (result.deletedActions.length > 0) {
    parts.push(`Quicker 动作 ${result.deletedActions.length} 个`);
  }
  if (result.deletedSubprograms.length > 0) {
    parts.push(`公共子程序 ${result.deletedSubprograms.length} 个`);
  }
  parts.push("临时目录已删除");
  if (result.errors.length > 0) {
    parts.push(result.errors[0]!);
  }
  return parts.join(" · ");
}
