"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { FaIconGeometry } from "@/lib/fa-icon";
import { uniqueFaSpecs } from "@/lib/fa-icon";

const FaIconContext = createContext<Map<string, FaIconGeometry>>(new Map());

export function useFaIconGeometry(spec: string | undefined): FaIconGeometry | undefined {
  const map = useContext(FaIconContext);
  const key = spec?.trim();
  if (!key) return undefined;
  return map.get(key);
}

type FaIconProviderProps = {
  specs: Iterable<string | undefined>;
  children: ReactNode;
};

export function FaIconProvider({ specs, children }: FaIconProviderProps) {
  const [map, setMap] = useState<Map<string, FaIconGeometry>>(new Map());
  const specList = useMemo(() => uniqueFaSpecs(specs), [specs]);

  useEffect(() => {
    if (specList.length === 0) {
      setMap(new Map());
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/fa/resolve", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ specs: specList }),
          cache: "no-store",
        });
        const data = (await res.json()) as {
          ok?: boolean;
          items?: FaIconGeometry[];
        };
        if (cancelled || !data.ok || !Array.isArray(data.items)) return;
        const next = new Map<string, FaIconGeometry>();
        for (const item of data.items) {
          if (item.spec) next.set(item.spec, item);
        }
        setMap(next);
      } catch {
        if (!cancelled) setMap(new Map());
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [specList.join("\0")]);

  return (
    <FaIconContext.Provider value={map}>{children}</FaIconContext.Provider>
  );
}
