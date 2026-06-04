"use client";

import dynamic from "next/dynamic";

const DevErrorCapture = dynamic(
  () => import("./DevErrorCapture").then((mod) => mod.DevErrorCapture),
  { ssr: false },
);

export function DevErrorCaptureGate() {
  if (process.env.NODE_ENV !== "development") return null;
  return <DevErrorCapture />;
}
