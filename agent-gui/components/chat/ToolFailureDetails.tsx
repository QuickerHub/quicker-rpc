"use client";

import { ToolPayloadView } from "./tool-output";

type ToolFailureDetailsProps = {
  toolName: string;
  input?: unknown;
  output?: unknown;
  errorText?: string;
  followTail?: boolean;
};

/** Request/response payload for tool result popup (all states). */
export function ToolFailureDetails({
  toolName,
  input,
  output,
  errorText,
  followTail = false,
}: ToolFailureDetailsProps) {
  const hasInput = input !== undefined;
  const hasOutput = output !== undefined;
  if (!hasInput && !hasOutput && !errorText) return null;

  return (
    <div className="tool-body tool-body--debug">
      {hasInput ? (
        <ToolPayloadView
          label="请求"
          value={input}
          toolName={toolName}
          input={input}
          output={output}
        />
      ) : null}
      {hasOutput ? (
        <ToolPayloadView
          label="结果"
          value={output}
          compact={false}
          toolName={toolName}
          input={input}
          output={output}
          followTail={followTail}
        />
      ) : null}
      {errorText ? <pre className="tool-error">{errorText}</pre> : null}
    </div>
  );
}
