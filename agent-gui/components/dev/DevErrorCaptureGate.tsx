"use client";

import { lazy, Suspense } from "react";
import { useDevExperienceEnabled } from "@/lib/release-preview.client";

const DevErrorCapture = lazy(() => import("./DevErrorCapture").then((mod) => ({ default: mod.DevErrorCapture })));

export function DevErrorCaptureGate() {
  const devExperienceEnabled = useDevExperienceEnabled();
  if (!devExperienceEnabled) return null;
  return <Suspense fallback={null}><DevErrorCapture /></Suspense>;
}
