"use client";

import { parseActionProjectsFromToolData } from "@/lib/action-projects";
import { ActionProjectsView } from "./ActionProjectsView";
import { ToolPayloadView, type QkrpcToolResult } from "./tool-output";

export function ActionProjectsToolBody({
  input,
  output,
  toolName,
}: {
  input?: unknown;
  output: QkrpcToolResult;
  toolName: string;
}) {
  const parsed = parseActionProjectsFromToolData(output.data);

  if (!output.ok || !parsed) {
    return (
      <ToolPayloadView label="结果" value={output} compact toolName={toolName} />
    );
  }

  return (
    <ActionProjectsView root={parsed.root} projects={parsed.projects} />
  );
}
