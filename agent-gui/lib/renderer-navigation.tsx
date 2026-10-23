"use client";

import { useSyncExternalStore, type AnchorHTMLAttributes } from "react";

const subscribe = (changed: () => void) => {
  window.addEventListener("popstate", changed);
  return () => window.removeEventListener("popstate", changed);
};
export function usePathname(): string {
  return useSyncExternalStore(subscribe, () => window.location.pathname, () => "/");
}

/** Cross-page links keep their browser semantics and existing persistence contracts. */
export default function Link({ prefetch: _prefetch, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { prefetch?: boolean }) {
  return <a {...props} />;
}
