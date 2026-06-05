"use client";

import { usePathname } from "next/navigation";
import { AppConfirmHost } from "@/components/AppConfirmHost";
import { AppMessageHost } from "@/components/AppMessageHost";
import { DevErrorCaptureGate } from "@/components/dev/DevErrorCaptureGate";
import { QuickerAgentUpdateChecker } from "@/components/QuickerAgentUpdateChecker";

/** Root chrome omitted on /launcher to avoid next/dynamic CSR bailout on a tiny window. */
export function RootLayoutExtras() {
  const pathname = usePathname();
  const isLauncher = pathname === "/launcher";

  return (
    <>
      {!isLauncher ? <DevErrorCaptureGate /> : null}
      {!isLauncher ? <QuickerAgentUpdateChecker /> : null}
      <AppConfirmHost />
      <AppMessageHost />
    </>
  );
}
