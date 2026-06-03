import { useEffect, useState } from "react";

/** Show `active` only after it stays true for `delayMs` (avoids loading UI flash). */
export function useDelayedTrue(active: boolean, delayMs = 200): boolean {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!active) {
      setVisible(false);
      return;
    }
    const id = window.setTimeout(() => setVisible(true), delayMs);
    return () => window.clearTimeout(id);
  }, [active, delayMs]);

  return visible;
}
