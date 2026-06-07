"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { isReasoningUIPart } from "ai";
import type { ReasoningSegmentItem } from "./tool-part-layout";
import { ToolDisclosure } from "./ToolDisclosure";

type ReasoningPartProps = {
  items: ReasoningSegmentItem[];
};

function mergeReasoningText(items: ReasoningSegmentItem[]): string {
  return items
    .map(({ part }) =>
      part && isReasoningUIPart(part) ? part.text.trim() : "",
    )
    .filter(Boolean)
    .join("\n\n");
}

function isReasoningSegmentStreaming(items: ReasoningSegmentItem[]): boolean {
  return items.some(
    ({ part }) =>
      part != null
      && isReasoningUIPart(part)
      && part.state === "streaming",
  );
}

function formatReasoningElapsedSec(seconds: number): string {
  return `${Math.max(0.1, seconds).toFixed(1)}s`;
}

function formatReasoningSummary(
  streaming: boolean,
  elapsedSec: number,
  measured: boolean,
): string {
  if (streaming) {
    if (!measured || elapsedSec < 0.1) return "思考中…";
    return `思考 ${formatReasoningElapsedSec(elapsedSec)}`;
  }
  if (measured && elapsedSec > 0) {
    return `思考 ${formatReasoningElapsedSec(elapsedSec)}`;
  }
  return "思考";
}

function useReasoningDuration(streaming: boolean): {
  elapsedSec: number;
  measured: boolean;
} {
  const [elapsedSec, setElapsedSec] = useState(0);
  const [measured, setMeasured] = useState(false);
  const startAtRef = useRef<number | null>(null);
  const measuredRef = useRef(false);

  useEffect(() => {
    if (streaming) {
      if (startAtRef.current == null) {
        startAtRef.current = Date.now();
        if (!measuredRef.current) {
          measuredRef.current = true;
          setMeasured(true);
        }
      }

      const tick = () => {
        const startAt = startAtRef.current;
        if (startAt == null) return;
        const nextSec = Math.round((Date.now() - startAt) / 100) / 10;
        setElapsedSec((prev) => (prev === nextSec ? prev : nextSec));
      };

      tick();
      const timer = window.setInterval(tick, 100);
      return () => window.clearInterval(timer);
    }

    const startAt = startAtRef.current;
    if (startAt != null) {
      const sec = Math.round((Date.now() - startAt) / 100) / 10;
      setElapsedSec((prev) => (prev === sec ? prev : sec));
      if (!measuredRef.current) {
        measuredRef.current = true;
        setMeasured(true);
      }
      startAtRef.current = null;
    }
  }, [streaming]);

  return { elapsedSec, measured };
}

function ReasoningBody({
  text,
  streaming,
}: {
  text: string;
  streaming: boolean;
}) {
  const bodyRef = useRef<HTMLPreElement>(null);

  useLayoutEffect(() => {
    if (!streaming) return;
    const el = bodyRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    const frame = requestAnimationFrame(() => {
      if (bodyRef.current) {
        bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [text, streaming]);

  return (
    <pre
      ref={bodyRef}
      className={[
        "reasoning-body",
        streaming ? "reasoning-body--streaming" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {text}
    </pre>
  );
}

function useReasoningAutoCollapse(streaming: boolean): {
  userOpen: boolean;
  setUserOpen: (open: boolean) => void;
  forcedOpen: boolean | null;
} {
  const [userOpen, setUserOpen] = useState(streaming);
  const wasStreamingRef = useRef(streaming);

  useEffect(() => {
    const wasStreaming = wasStreamingRef.current;
    if (streaming === wasStreaming) return;
    wasStreamingRef.current = streaming;
    setUserOpen((open) => {
      if (streaming) return open ? open : true;
      return open ? false : open;
    });
  }, [streaming]);

  return {
    userOpen,
    setUserOpen,
    forcedOpen: streaming ? true : null,
  };
}

function ReasoningDisclosure({
  text,
  streaming,
}: {
  text: string;
  streaming: boolean;
}) {
  const { userOpen, setUserOpen, forcedOpen } =
    useReasoningAutoCollapse(streaming);
  const { elapsedSec, measured } = useReasoningDuration(streaming);
  const summary = formatReasoningSummary(streaming, elapsedSec, measured);

  return (
    <ToolDisclosure
      className="reasoning-card"
      open={userOpen}
      onOpenChange={setUserOpen}
      forcedOpen={forcedOpen}
      summaryClassName="reasoning-summary"
      expandedClassName="reasoning-card--expanded"
      collapsedClassName="reasoning-card--collapsed"
      summary={<span className="reasoning-label">{summary}</span>}
    >
      <ReasoningBody text={text} streaming={streaming} />
    </ToolDisclosure>
  );
}

export function ReasoningPart({ items }: ReasoningPartProps) {
  const text = mergeReasoningText(items);
  const streaming = isReasoningSegmentStreaming(items);

  if (!text && !streaming) return null;

  return <ReasoningDisclosure text={text} streaming={streaming} />;
}
