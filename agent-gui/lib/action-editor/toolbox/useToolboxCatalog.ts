"use client";

import { useCallback, useEffect, useState } from "react";
import { getActionDesignerBackendBaseUrl } from "../shared/actionDesignerBackendBaseUrl";
import { fetchStepRunnersItems, getCachedStepRunnersItems } from "../steps/stepRunnerCatalog";
import type { StepRunnerItem } from "../types/action_query";

/** Share the existing catalog cache with every program surface; never fetch every module schema. */
export function useToolboxCatalog() {
  const baseUrl = getActionDesignerBackendBaseUrl();
  const [items, setItems] = useState<StepRunnerItem[]>(() => getCachedStepRunnersItems(baseUrl) ?? []);
  const [status, setStatus] = useState<"loading" | "ready" | "error">(items.length ? "ready" : "loading");
  const [error, setError] = useState<string>();
  const [revision, setRevision] = useState(0);
  const reload = useCallback(() => setRevision((value) => value + 1), []);
  useEffect(() => {
    let disposed = false;
    setStatus("loading");
    void fetchStepRunnersItems(baseUrl, { revalidate: revision > 0 }).then((next) => {
      if (disposed) return;
      setItems(next);
      setStatus("ready");
      setError(undefined);
    }, (reason: unknown) => {
      if (disposed) return;
      setError(reason instanceof Error ? reason.message : String(reason));
      setStatus("error");
    });
    return () => { disposed = true; };
  }, [baseUrl, revision]);
  // Older hosts expose categories on rows only. The source helper derives the tabs from those rows.
  return { items, hasCatalog: status === "ready" || items.length > 0, status, error, categories: [], reload };
}
