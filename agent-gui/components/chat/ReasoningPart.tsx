"use client";

import { useEffect, useRef, useState } from "react";
import { isReasoningUIPart } from "ai";
import { useWorkFoldFollow, useWorkFoldOpen } from "@/lib/use-work-fold-interaction";
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
      const timer = window.setInterval(tick, 200);
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
  visible,
}: {
  text: string;
  streaming: boolean;
  visible: boolean;
}) {
  const bodyRef = useRef<HTMLPreElement>(null);
  const followHandlers = useWorkFoldFollow(bodyRef, streaming && visible, text);

  return (
    <pre
      ref={bodyRef}
      {...followHandlers}
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

function ReasoningDisclosure({
  text,
  streaming,
}: {
  text: string;
  streaming: boolean;
}) {
  const { open, setOpen } = useWorkFoldOpen(streaming);
  const { elapsedSec, measured } = useReasoningDuration(streaming);
  const summary = formatReasoningSummary(streaming, elapsedSec, measured);

  return (
    <ToolDisclosure
      className="reasoning-card"
      open={open}
      onOpenChange={setOpen}
      summaryClassName="reasoning-summary"
      expandedClassName="reasoning-card--expanded"
      collapsedClassName="reasoning-card--collapsed"
      keepMounted
      summary={<span className="reasoning-label">{summary}</span>}
    >
      <ReasoningBody text={text} streaming={streaming} visible={open} />
    </ToolDisclosure>
  );
}

export function ReasoningPart({ items }: ReasoningPartProps) {
  const text = mergeReasoningText(items);
  const streaming = isReasoningSegmentStreaming(items);

  if (!text && !streaming) return null;

  return <ReasoningDisclosure text={text} streaming={streaming} />;
}
