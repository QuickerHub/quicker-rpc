"use client";

import { useEffect } from "react";
import { initAppWindowFocusTracking } from "@/lib/app-window-focus";

/** Keeps {@link isAppWindowFocused} in sync with the desktop shell. */
export function AppWindowFocusTracker() {
  useEffect(() => initAppWindowFocusTracking(), []);
  return null;
}
