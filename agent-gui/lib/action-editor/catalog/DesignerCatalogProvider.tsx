"use client";

import { createContext, useContext, useEffect, useMemo, useRef, type ReactNode } from "react";
import { designerCatalogTargetKey, type DesignerCatalogScope } from "./designerCatalogContext";
import { createDesignerCatalogPort, type DesignerCatalogPort } from "./designerCatalogPort";

const CatalogContext = createContext<DesignerCatalogPort | undefined>(undefined);

export function DesignerCatalogProvider({ port, children }: { port?: DesignerCatalogPort; children: ReactNode }) {
  return <CatalogContext.Provider value={port}>{children}</CatalogContext.Provider>;
}

export function useDesignerCatalogPort(): DesignerCatalogPort | undefined { return useContext(CatalogContext); }

export function useDocumentDesignerCatalogPort(scope: DesignerCatalogScope, owner: object | null): DesignerCatalogPort | undefined {
  const key = designerCatalogTargetKey(scope);
  // The owner also separates two documents with identical persistent targets.
  const port = useMemo(() => createDesignerCatalogPort(scope), [key, owner]); // eslint-disable-line react-hooks/exhaustive-deps
  const mounted = useRef<{ port: DesignerCatalogPort; active: boolean } | null>(null);
  useEffect(() => {
    const lease = { port, active: true };
    mounted.current = lease;
    return () => {
      lease.active = false;
      queueMicrotask(() => {
        if (mounted.current?.active && mounted.current.port === port) return;
        port.dispose();
      });
    };
  }, [port]);
  return scope === undefined ? undefined : port;
}
