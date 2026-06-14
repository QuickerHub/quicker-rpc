import type { ContextCompressionMetadata } from "@/lib/chat-types";

/** One-line summary for tool-test / debug panes. */
export function formatContextCompressionMetadata(
  meta: ContextCompressionMetadata | null | undefined,
): string {
  if (!meta) return "—";
  const parts = [
    `through ${meta.throughMessageId}`,
    `kept ${meta.recentMessagesKept}`,
  ];
  if (meta.splitReason && meta.splitReason !== "none") {
    parts.push(meta.splitReason);
  }
  if (meta.microcompactApplied) parts.push("microcompact");
  if (meta.summaryReused) parts.push("reused summary");
  if (meta.reactiveCompactAttempted) parts.push("reactive retry");
  if (meta.reinjectPaths?.length) {
    parts.push(`reinject ${meta.reinjectPaths.join(", ")}`);
  }
  return parts.join(" · ");
}

export function hasReinjectBlock(
  systemSuffix: string | null | undefined,
): boolean {
  return Boolean(
    systemSuffix?.includes("Recent workspace files (reinjected after compression)"),
  );
}
