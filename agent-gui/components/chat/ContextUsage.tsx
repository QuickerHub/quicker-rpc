"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import type { AgentUIMessage } from "@/lib/chat-types";
import { formatTokenCount } from "@/lib/chat-types";
import { buildApiContextUsageSnapshot } from "@/lib/context-length";
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

export function ContextUsage({
  messages,
  busy,
  providerId,
}: ContextUsageProps) {
  const popupId = useId();
  const wrapRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [contextLimit, setContextLimit] = useState<number | null>(null);
  const [activeModelId, setActiveModelId] = useState<string | undefined>();

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

  const limit = contextLimit ?? 128_000;
  const snapshot = useMemo(
    () => buildApiContextUsageSnapshot(messages, limit),
    [messages, limit],
  );

  const lastModel = lastAssistantModel(messages);
  const displayModel = lastModel ?? activeModelId;
  const { pct, hasData, warn, windowLabel, inputTokens } = snapshot;
  const dashOffset = CIRCUMFERENCE - (pct / 100) * CIRCUMFERENCE;

  const usageSummary = hasData
    ? `${formatTokenCount(inputTokens)} / ${windowLabel}`
    : busy
      ? "等待模型返回用量…"
      : "发送消息后显示用量";

  const titleModel = displayModel ? ` · ${displayModel}` : "";
  const buttonTitle = hasData
    ? `上下文 ${formatTokenCount(inputTokens)} / ${windowLabel}${titleModel}`
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
            <div
              className={`context-popup-meter-fill${warn ? " context-popup-meter-fill--warn" : ""}`}
              style={{ width: hasData ? `${pct}%` : "0%" }}
            />
          </div>

          <p className="context-popup-hint">
            {hasData
              ? "基于本轮最后一步模型调用的 prompt 用量（非多步累加）"
              : busy
                ? "本轮响应完成后更新"
                : "完成一轮对话后显示"}
          </p>

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
