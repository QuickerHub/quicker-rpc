"use client";

import { usePathname } from "next/navigation";
import { AppConfirmHost } from "@/components/AppConfirmHost";
import { AppMessageHost } from "@/components/AppMessageHost";
import { DevErrorCaptureGate } from "@/components/dev/DevErrorCaptureGate";
import { DevHooksRecovery } from "@/components/dev/DevHooksRecovery";
import { QuickerAgentUpdateChecker } from "@/components/QuickerAgentUpdateChecker";
import { QuickerAgentUpdateOverlay } from "@/components/QuickerAgentUpdateOverlay";
import { AppBootstrapSplash } from "@/components/shell/AppBootstrapSplash";
import { TauriShellInputGuard } from "@/components/shell/TauriShellInputGuard";

/** Root chrome omitted on /launcher to avoid next/dynamic CSR bailout on a tiny window. */
export function RootLayoutExtras() {
  const pathname = usePathname();
  const isLauncher = pathname === "/launcher";

  return (
    <>
      {!isLauncher ? <AppBootstrapSplash /> : null}
      {!isLauncher ? <TauriShellInputGuard /> : null}
      {!isLauncher ? <DevErrorCaptureGate /> : null}
      {!isLauncher ? <DevHooksRecovery /> : null}
      {!isLauncher ? <QuickerAgentUpdateChecker /> : null}
      {!isLauncher ? <QuickerAgentUpdateOverlay /> : null}
      <AppConfirmHost />
      <AppMessageHost />
    </>
  );
}
