"use client";

import type { ToolPopupViewMode } from "@/lib/tool-popup-ui-prefs";
import { ToolPayloadView } from "./tool-output";

export type { ToolPopupViewMode };

type ToolPopupBodyProps = {
  view: ToolPopupViewMode;
  toolName: string;
  input?: unknown;
  output?: unknown;
  errorText?: string;
  followTail?: boolean;
};

/** Tool result popup body: structured visual layout or raw request/response. */
export function ToolPopupBody({
  view,
  toolName,
  input,
  output,
  errorText,
  followTail = false,
}: ToolPopupBodyProps) {
  const hasInput = input !== undefined;
  const hasOutput = output !== undefined;
  if (!hasInput && !hasOutput && !errorText) return null;

  if (view === "source") {
    return (
      <div className="tool-body tool-body--debug tool-body--popup-source">
        {hasInput ? (
          <ToolPayloadView
            label="请求"
            value={input}
            rawOnly
            toolName={toolName}
            input={input}
            output={output}
          />
        ) : null}
        {hasOutput ? (
          <ToolPayloadView
            label="结果"
            value={output}
            rawOnly
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

  return (
    <div className="tool-body tool-body--debug tool-body--popup-detail">
      {hasInput ? (
        <ToolPayloadView
          label="请求"
          value={input}
          dense
          toolName={toolName}
          input={input}
          output={output}
        />
      ) : null}
      {hasOutput ? (
        <ToolPayloadView
          label="结果"
          value={output}
          compact
          dense
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
