"use client";

import { useMemo } from "react";
import {
  formatJsonSize,
  sliceToolModelPayload,
} from "@/lib/tool-model-payload-view";
import { ToolPayloadView } from "./tool-output";

type ToolModelPayloadPanelProps = {
  toolName: string;
  input?: unknown;
  output?: unknown;
  errorText?: string;
  followTail?: boolean;
};

/** Popup tab: data payload + what the LLM receives (always displayData-stripped). */
export function ToolModelPayloadPanel({
  toolName,
  input,
  output,
  errorText,
  followTail = false,
}: ToolModelPayloadPanelProps) {
  const slices = useMemo(
    () => sliceToolModelPayload(input, output),
    [input, output],
  );

  if (!slices && !errorText?.trim()) {
    return <p className="tool-hint tool-muted">无工具输出</p>;
  }

  return (
    <div className="tool-body tool-body--debug tool-body--popup-model">
      <p className="tool-hint tool-muted tool-model-payload__intro">
        <strong>data</strong> 是压缩后的业务 payload。
        <strong>送入模型</strong> 与 tool 返回后续写、下轮历史一致（已去掉
        displayData）；长对话里更早的 tool result 还可能被 microcompact 再缩短。
      </p>

      {slices?.agentSummary ? (
        <p className="tool-model-payload__summary">{slices.agentSummary}</p>
      ) : null}

      {input !== undefined ? (
        <ToolPayloadView
          label="请求"
          value={input}
          rawOnly
          dense
          toolName={toolName}
          input={input}
          output={output}
        />
      ) : null}

      {slices?.kind === "structured" && slices.data !== undefined ? (
        <ToolPayloadView
          label="data（业务 payload）"
          value={slices.data}
          rawOnly
          dense
          toolName={toolName}
          input={input}
          output={output}
          followTail={followTail}
        />
      ) : null}

      {slices?.hasDisplayDataSlice ? (
        <details className="tool-model-payload__details">
          <summary className="tool-model-payload__details-summary">
            displayData（仅 UI / 侧栏，不进模型）
          </summary>
          <ToolPayloadView
            label="displayData"
            value={slices.displayData}
            rawOnly
            dense
            toolName={toolName}
            input={input}
            output={output}
            followTail={followTail}
          />
        </details>
      ) : null}

      {slices ? (
        <ToolPayloadView
          label={`送入模型 · ${formatJsonSize(slices.modelChars)}`}
          value={slices.modelOutput}
          rawOnly
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
