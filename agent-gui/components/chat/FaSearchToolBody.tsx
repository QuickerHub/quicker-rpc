"use client";

import { parseFaSearchFromQkrpcData } from "@/lib/fa-search";
import { FaSearchPlainText } from "./FaSearchPlainText";
import { ToolPayloadView, type QkrpcToolResult } from "./tool-output";

export function FaSearchToolBody({
  input,
  output,
  toolName,
}: {
  input?: unknown;
  output: QkrpcToolResult;
  toolName: string;
}) {
  const parsed = parseFaSearchFromQkrpcData(output.data);

  if (!output.ok || !parsed) {
    return (
      <ToolPayloadView label="结果" value={output} compact toolName={toolName} />
    );
  }

  return (
    <FaSearchPlainText names={parsed.names} />
  );
}
