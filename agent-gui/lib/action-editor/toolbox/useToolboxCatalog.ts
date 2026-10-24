"use client";

import { useDesignerCatalogPort } from "../catalog/DesignerCatalogProvider";

import { useCallback, useEffect, useRef, useState } from "react";
import { getActionDesignerBackendBaseUrl } from "../shared/actionDesignerBackendBaseUrl";
import { fetchStepRunnersItems } from "../steps/stepRunnerCatalog";
import type { StepRunnerItem } from "../types/action_query";

/** Read the native directory; concurrent document readers share only their in-flight request. */
export function useToolboxCatalog() {
  const catalogPort = useDesignerCatalogPort();
  const ownerRef = useRef(catalogPort);
  const baseUrl = getActionDesignerBackendBaseUrl();
  const [items, setItems] = useState<StepRunnerItem[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string>();
  const [revision, setRevision] = useState(0);
  if (ownerRef.current !== catalogPort) {
    ownerRef.current = catalogPort;
    setItems([]);
    setError(undefined);
  }
  const reload = useCallback(() => setRevision((value) => value + 1), []);
  useEffect(() => {
    let disposed = false;
    const cancel = new AbortController();
    setStatus("loading");
    void fetchStepRunnersItems(baseUrl, { revalidate: revision > 0, signal: cancel.signal, catalogPort }).then((next) => {
      if (disposed) return;
      setItems(next);
      setStatus("ready");
      setError(undefined);
    }, (reason: unknown) => {
      if (disposed) return;
      setItems([]);
      setError(reason instanceof Error ? reason.message : String(reason));
      setStatus("error");
    });
    return () => { disposed = true; cancel.abort(); };
  }, [baseUrl, revision, catalogPort]);
  // Older hosts expose categories on rows only. The source helper derives the tabs from those rows.
  return { items, hasCatalog: status === "ready", status, error, categories: [], reload };
}
