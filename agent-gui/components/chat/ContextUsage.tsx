"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import {
  aggregateSessionUsage,
  formatTokenCount,
  type AgentUIMessage,
} from "@/lib/chat-types";
import type { LlmProviderId } from "@/lib/llm-providers";
import { fetchLlmOptions } from "./ModelSelector";

const RING_SIZE = 14;
const STROKE = 1.75;
const RADIUS = (RING_SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

type ContextUsageProps = {
  messages: AgentUIMessage[];
  busy?: boolean;
  /** Selected provider in composer (drives context window for next turns). */
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

export function ContextUsage({ messages, busy, providerId }: ContextUsageProps) {
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
  const usage = aggregateSessionUsage(messages);
  const lastModel = lastAssistantModel(messages);
  const displayModel = activeModelId ?? lastModel;

  const contextTokens = usage.totalTokens > 0
    ? usage.totalTokens
    : usage.inputTokens + usage.outputTokens;
  const pct = limit > 0
    ? Math.min(100, (contextTokens / limit) * 100)
    : 0;
  const hasData = contextTokens > 0;
  const warn = pct >= 90;
  const dashOffset = CIRCUMFERENCE - (pct / 100) * CIRCUMFERENCE;

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
        aria-label="Context 使用量"
        aria-expanded={open}
        aria-controls={popupId}
        onClick={() => setOpen((v) => !v)}
        title={
          displayModel
            ? `Context ~${formatTokenCount(contextTokens)} / ${formatTokenCount(limit)} · ${displayModel}`
            : `Context ~${formatTokenCount(contextTokens)} / ${formatTokenCount(limit)}`
        }
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
          aria-label="Context 使用详情"
        >
          <div className="context-popup-header">
            <span className="context-popup-title">Context</span>
          </div>

          <div className="context-popup-usage-row">
            <span className="context-popup-pct">
              {hasData ? `${pct.toFixed(1)}%` : busy ? "…" : "0%"}
            </span>
            <p
              className={`context-popup-summary${hasData ? "" : " context-popup-summary--empty"}`}
            >
              {hasData
                ? `~${formatTokenCount(contextTokens)} / ${formatTokenCount(limit)}`
                : busy
                  ? "正在统计本轮 token…"
                  : "发送消息后显示用量"}
            </p>
          </div>

          <div className="context-popup-meter" aria-hidden>
            <div
              className={`context-popup-meter-fill${warn ? " context-popup-meter-fill--warn" : ""}`}
              style={{ width: `${hasData ? pct : 0}%` }}
            />
          </div>

          <dl className="context-popup-stats">
            <div className="context-popup-stat">
              <dt>输入</dt>
              <dd>{formatTokenCount(usage.inputTokens)}</dd>
            </div>
            <div className="context-popup-stat">
              <dt>输出</dt>
              <dd>{formatTokenCount(usage.outputTokens)}</dd>
            </div>
          </dl>

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
