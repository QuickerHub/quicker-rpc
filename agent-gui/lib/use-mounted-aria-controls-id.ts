import { useEffect, useId, useState } from "react";

/** Defer aria-controls until mount so SSR and hydration markup stay aligned. */
export function useMountedAriaControlsId(): string | undefined {
  const id = useId();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return mounted ? id : undefined;
}
