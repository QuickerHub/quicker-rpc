"use client";

import { useEffect, useMemo, type ReactNode } from "react";
import { ensureFaIconsResolved } from "@/lib/fa-icon-cache";
import { uniqueFaSpecs } from "@/lib/fa-icon";

type FaIconProviderProps = {
  specs: Iterable<string | undefined>;
  children: ReactNode;
};

/** Prefetch FA specs into the global icon cache (optional; ActionIcon also resolves on its own). */
export function FaIconProvider({ specs, children }: FaIconProviderProps) {
  const specList = useMemo(() => uniqueFaSpecs(specs), [specs]);
  const specKey = specList.join("\0");

  useEffect(() => {
    ensureFaIconsResolved(specList);
    // specList is derived from specKey; avoid specList ref churn from parent arrays.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- specKey
  }, [specKey]);

  return children;
}

export { useFaIconGeometry } from "@/lib/use-fa-icon-geometry";
