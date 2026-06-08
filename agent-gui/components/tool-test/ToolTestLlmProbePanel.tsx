"use client";

import { useCallback, useState } from "react";
import type {
  LlmEndpointProbeReport,
  LlmProbeConfigSource,
  LlmProbeMethod,
} from "@/lib/llm-endpoint-probe-core";

type ToolTestLlmProbePanelProps = {
  disabled?: boolean;
  onReport: (report: LlmEndpointProbeReport | null) => void;
  onError: (message: string | null) => void;
  onRunningChange: (running: boolean) => void;
};

const SOURCE_OPTIONS: Array<{ value: LlmProbeConfigSource; label: string }> = [
  { value: "all", label: "全部（publish+dev+merged+llm-config）" },
  { value: "publish", label: "publish config" },
  { value: "dev", label: "dev config" },
  { value: "merged", label: "merged（dev 覆盖 publish）" },
  { value: "llm-config", label: "llm-config.json" },
  { value: "auto", label: "Auto 候选模型" },
];

export function ToolTestLlmProbePanel({
  disabled,
  onReport,
  onError,
  onRunningChange,
}: ToolTestLlmProbePanelProps) {
  const [source, setSource] = useState<LlmProbeConfigSource>("all");
  const [method, setMethod] = useState<LlmProbeMethod>("models");
  const [includeAuto, setIncludeAuto] = useState(true);
  const [running, setRunning] = useState(false);

  const runProbe = useCallback(async () => {
    if (disabled || running) return;
    setRunning(true);
    onRunningChange(true);
    onError(null);
    onReport(null);

    const params = new URLSearchParams({
      source,
      method,
      includeAuto: includeAuto ? "true" : "false",
      timeoutMs: method === "chat" ? "25000" : "12000",
    });

    try {
      const res = await fetch(`/api/dev/llm-endpoint-probe?${params.toString()}`, {
        cache: "no-store",
      });
      const body = await res.json() as LlmEndpointProbeReport & { error?: string };
      if (!res.ok) {
        throw new Error(body.error ?? res.statusText);
      }
      onReport(body);
    } catch (error) {
      onError(error instanceof Error ? error.message : String(error));
    } finally {
      setRunning(false);
      onRunningChange(false);
    }
  }, [disabled, running, source, method, includeAuto, onReport, onError, onRunningChange]);

  return (
    <div className="tool-test-llm-probe-panel">
      <p className="tool-test-sidebar__hint">
        批量探测 publish / dev / llm-config 中的 endpoint（GET /models 或最小 chat）。
        Key 仅显示掩码。
      </p>

      <label className="tool-test-llm-probe-panel__field">
        <span>配置来源</span>
        <select
          value={source}
          disabled={disabled || running}
          onChange={(event) => setSource(event.target.value as LlmProbeConfigSource)}
        >
          {SOURCE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>

      <label className="tool-test-llm-probe-panel__field">
        <span>探测方式</span>
        <select
          value={method}
          disabled={disabled || running}
          onChange={(event) => setMethod(event.target.value as LlmProbeMethod)}
        >
          <option value="models">models（快）</option>
          <option value="chat">chat（需 model）</option>
        </select>
      </label>

      {source !== "auto" ? (
        <label className="tool-test-llm-probe-panel__checkbox">
          <input
            type="checkbox"
            checked={includeAuto}
            disabled={disabled || running}
            onChange={(event) => setIncludeAuto(event.target.checked)}
          />
          <span>附加探测 Auto 候选（chat）</span>
        </label>
      ) : null}

      <button
        type="button"
        className="tool-test-llm-probe-panel__run"
        disabled={disabled || running}
        onClick={() => void runProbe()}
      >
        {running ? "探测中…" : "开始批量探测"}
      </button>
    </div>
  );
}
