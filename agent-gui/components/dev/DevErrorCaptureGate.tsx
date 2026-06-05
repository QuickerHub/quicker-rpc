"use client";

import dynamic from "next/dynamic";
import { useDevExperienceEnabled } from "@/lib/release-preview.client";

const DevErrorCapture = dynamic(
  () => import("./DevErrorCapture").then((mod) => mod.DevErrorCapture),
  { ssr: false },
);

export function DevErrorCaptureGate() {
  const devExperienceEnabled = useDevExperienceEnabled();
  if (!devExperienceEnabled) return null;
  return <DevErrorCapture />;
}
