"use client";

import { useEffect, useRef, useState } from "react";
import type { DesignerContextSnapshot } from "@/lib/designer-context-types";

const POLL_MS = 2_000;

async function fetchDesignerContext(): Promise<DesignerContextSnapshot> {
  const res = await fetch("/api/designer/context", { cache: "no-store" });
  const raw = await res.text();
  if (!raw.trim()) {
    return { ok: false, message: "Empty designer context response.", designers: [] };
  }
  try {
    return JSON.parse(raw) as DesignerContextSnapshot;
  } catch {
    return { ok: false, message: "Invalid designer context JSON.", designers: [] };
  }
}

export function useDesignerContext(enabled: boolean) {
  const [snapshot, setSnapshot] = useState<DesignerContextSnapshot | null>(null);
  const requestId = useRef(0);

  useEffect(() => {
    if (!enabled) {
      requestId.current += 1;
      setSnapshot(null);
      return;
    }

    let cancelled = false;
    const reload = async () => {
      const id = requestId.current + 1;
      requestId.current = id;
      const next = await fetchDesignerContext();
      if (cancelled || requestId.current !== id) return;
      setSnapshot(next);
    };

    void reload();
    const timer = window.setInterval(() => {
      void reload();
    }, POLL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [enabled]);

  return snapshot;
}
