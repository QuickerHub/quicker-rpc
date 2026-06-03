"use client";

import { useLayoutEffect } from "react";
import { applyTauriConfirmPatch } from "@/lib/native-confirm";

/** Re-apply window.confirm patch after navigation (defensive). */
export function TauriDialogPatch() {
  useLayoutEffect(() => {
    applyTauriConfirmPatch();
  }, []);

  return null;
}
