"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import type { AgentUIMessage } from "@/lib/chat-types";
import {
  buildContextUsageSnapshot,
  formatCharLength,
  type ContextSegment,
} from "@/lib/context-breakdown";
import type { LlmProviderId } from "@/lib/llm-providers";
import { fetchLlmOptions } from "./ModelSelector";

const RING_SIZE = 14;
const STROKE = 1.75;
const RADIUS = (RING_SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

type ContextUsageProps = {
  messages: AgentUIMessage[];
  busy?: boolean;
  providerId: LlmProviderId;
  workingDirectory?: string;
  enabledTools: string[];
};

function lastAssistantModel(messages: AgentUIMessage[]): string | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role === "assistant" && m.metadata?.model) {
      return m.metadata.model;
    }
  }
  return undefined;
}

function ContextSegmentBar({
  segments,
  fillPct,
  warn,
}: {
  segments: ContextSegment[];
  fillPct: number;
  warn: boolean;
}) {
  const total = segments.reduce((sum, segment) => sum + segment.chars, 0);
  if (total <= 0) {
    return <div className="context-popup-meter" aria-hidden />;
  }

  return (
    <div
      className={`context-popup-segment-bar${warn ? " context-popup-segment-bar--warn" : ""}`}
      aria-hidden
      style={{ width: `${fillPct}%` }}
    >
      {segments.map((segment) => (
        <span
          key={segment.id}
          className="context-popup-segment-bar-part"
          style={{
            flexGrow: segment.chars,
            backgroundColor: segment.color,
          }}
        />
      ))}
    </div>
  );
}

function ContextSegmentLegend({ segments }: { segments: ContextSegment[] }) {
  return (
    <ul className="context-popup-breakdown">
      {segments.map((segment) => (
        <li key={segment.id} className="context-popup-breakdown-row">
          <span
            className="context-popup-breakdown-swatch"
            style={{ backgroundColor: segment.color }}
            aria-hidden
          />
          <span className="context-popup-breakdown-label">{segment.label}</span>
          <span className="context-popup-breakdown-value">
            {formatCharLength(segment.chars)}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function ContextUsage({
  messages,
  busy,
  providerId,
  workingDirectory,
  enabledTools,
}: ContextUsageProps) {
  const popupId = useId();
  const wrapRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [contextLimit, setContextLimit] = useState<number | null>(null);
  const [activeModelId, setActiveModelId] = useState<string | undefined>();
  const [toolDefinitionSizes, setToolDefinitionSizes] = useState<
    Record<string, number> | null
  >(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const data = await fetchLlmOptions();
      if (cancelled || !data) return;
      const provider = data.providers.find((p) => p.id === providerId);
      if (provider) {
        setContextLimit(provider.contextLimit);
        setActiveModelId(provider.modelId);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [providerId]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/context/tool-sizes", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { sizes?: Record<string, number> };
        if (!cancelled && data.sizes) {
          setToolDefinitionSizes(data.sizes);
        }
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const limit = contextLimit ?? 128_000;
  const snapshot = useMemo(
    () =>
      buildContextUsageSnapshot({
        messages,
        workingDirectory,
        enabledToolIds: enabledTools,
        tokenLimit: limit,
        toolDefinitionSizes: toolDefinitionSizes ?? undefined,
      }),
    [messages, workingDirectory, enabledTools, limit, toolDefinitionSizes],
  );

  const lastModel = lastAssistantModel(messages);
  const displayModel = lastModel ?? activeModelId;
  const { pct, hasData, warn, windowLabel, totalChars, segments } = snapshot;
  const dashOffset = CIRCUMFERENCE - (pct / 100) * CIRCUMFERENCE;

  const usageSummary = hasData
    ? `${formatCharLength(totalChars)} / ${windowLabel}`
    : busy
      ? "正在统计上下文…"
      : "发送消息后显示用量";

  const titleModel = displayModel ? ` · ${displayModel}` : "";
  const buttonTitle = hasData
    ? `上下文 ${formatCharLength(totalChars)} / ${windowLabel}${titleModel}`
    : `上下文窗口 ${windowLabel}${titleModel}`;

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) {
        close();
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, close]);

  return (
    <div className="context-ring-wrap" ref={wrapRef}>
      <button
        type="button"
        className={`context-ring-btn${busy && !hasData ? " context-ring--pending" : ""}${warn ? " context-ring--warn" : ""}`}
        aria-label="上下文使用量"
        aria-expanded={open}
        aria-controls={popupId}
        onClick={() => setOpen((v) => !v)}
        title={buttonTitle}
      >
        <svg
          className="context-ring-svg"
          width={RING_SIZE}
          height={RING_SIZE}
          viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`}
          aria-hidden
        >
          <circle
            className="context-ring-track"
            cx={RING_SIZE / 2}
            cy={RING_SIZE / 2}
            r={RADIUS}
            fill="none"
            strokeWidth={STROKE}
          />
          <circle
            className="context-ring-progress"
            cx={RING_SIZE / 2}
            cy={RING_SIZE / 2}
            r={RADIUS}
            fill="none"
            strokeWidth={STROKE}
            strokeLinecap="round"
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={hasData ? dashOffset : CIRCUMFERENCE}
            transform={`rotate(-90 ${RING_SIZE / 2} ${RING_SIZE / 2})`}
          />
        </svg>
      </button>

      {open && (
        <div
          id={popupId}
          className="composer-popup context-popup"
          role="dialog"
          aria-label="上下文使用详情"
        >
          <div className="context-popup-header">
            <span className="context-popup-title">上下文</span>
          </div>

          <div className="context-popup-usage-row">
            <span className="context-popup-pct">
              {hasData ? `${pct.toFixed(1)}%` : busy ? "…" : "0%"}
            </span>
            <p
              className={`context-popup-summary${hasData ? "" : " context-popup-summary--empty"}`}
            >
              {usageSummary}
            </p>
          </div>

          <div className="context-popup-meter-track" aria-hidden>
            <ContextSegmentBar
              segments={segments}
              fillPct={hasData ? pct : 0}
              warn={warn}
            />
          </div>

          {hasData && segments.length > 0 ? (
            <ContextSegmentLegend segments={segments} />
          ) : (
            <p className="context-popup-breakdown-empty">
              {busy ? "正在统计…" : "发送消息后显示分项用量"}
            </p>
          )}

          {displayModel && (
            <p className="context-popup-model" title={displayModel}>
              模型：
              {displayModel}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
