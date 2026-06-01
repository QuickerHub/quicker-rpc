"use client";

import { useEffect, useState } from "react";
import type { AgentActivity } from "@/lib/agent-activity";
import {
  CONNECTING_ACTIVITY_LABELS,
  PLANNING_ACTIVITY_LABELS,
} from "@/lib/agent-activity";

type AgentActivityLineProps = {
  activity: AgentActivity;
};

function useRotatingLabels(
  enabled: boolean,
  labels: readonly string[],
  fallback: string,
): string {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (!enabled) {
      setIndex(0);
      return;
    }
    const timer = window.setInterval(() => {
      setIndex((i) => (i + 1) % labels.length);
    }, 2800);
    return () => window.clearInterval(timer);
  }, [enabled, labels]);

  if (!enabled) return fallback;
  return labels[index] ?? fallback;
}

export function AgentActivityLine({ activity }: AgentActivityLineProps) {
  const planningLabel = useRotatingLabels(
    activity.phase === "planning",
    PLANNING_ACTIVITY_LABELS,
    activity.label,
  );
  const connectingLabel = useRotatingLabels(
    activity.phase === "connecting",
    CONNECTING_ACTIVITY_LABELS,
    activity.label,
  );

  const label =
    activity.phase === "planning"
      ? planningLabel
      : activity.phase === "connecting"
        ? connectingLabel
        : activity.label;

  return (
    <div
      className={`agent-activity agent-activity--${activity.phase}`}
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      <span className="agent-activity-indicator" aria-hidden>
        <span className="agent-activity-dot" />
        <span className="agent-activity-dot" />
        <span className="agent-activity-dot" />
      </span>
      <span className="agent-activity-label">{label}</span>
    </div>
  );
}
