"use client";

import { usePathname } from "next/navigation";
import { AppConfirmHost } from "@/components/AppConfirmHost";
import { AppMessageHost } from "@/components/AppMessageHost";
import { AppWindowFocusTracker } from "@/components/AppWindowFocusTracker";
import { DevErrorCaptureGate } from "@/components/dev/DevErrorCaptureGate";
import { DevHooksRecovery } from "@/components/dev/DevHooksRecovery";
import { QuickerAgentExitHandler } from "@/components/QuickerAgentExitHandler";
import { QuickerAgentExitOverlay } from "@/components/QuickerAgentExitOverlay";
import { QuickerAgentUpdateChecker } from "@/components/QuickerAgentUpdateChecker";
import { QuickerAgentUpdateOverlay } from "@/components/QuickerAgentUpdateOverlay";
import { TauriShellInputGuard } from "@/components/shell/TauriShellInputGuard";
import { ElectronTitlebarOverlaySync } from "@/components/shell/ElectronTitlebarOverlaySync";
import { useLauncherGlobalShortcut } from "@/lib/launcher/use-launcher-global-shortcut";
import { useTerminalRuntimeBootstrap } from "@/lib/use-terminal-runtime-bootstrap";
import { useVoiceRuntimeBootstrap } from "@/lib/voice-input/use-voice-runtime-bootstrap";

/** Root chrome omitted on /launcher to avoid next/dynamic CSR bailout on a tiny window. */
export function RootLayoutExtras() {
  const pathname = usePathname();
  const isLauncher = pathname === "/launcher";
  useLauncherGlobalShortcut();
  useTerminalRuntimeBootstrap();
  useVoiceRuntimeBootstrap();

  return (
    <>
      {!isLauncher ? <TauriShellInputGuard /> : null}
      {!isLauncher ? <ElectronTitlebarOverlaySync /> : null}
      {!isLauncher ? <DevErrorCaptureGate /> : null}
      {!isLauncher ? <DevHooksRecovery /> : null}
      {!isLauncher ? <QuickerAgentExitHandler /> : null}
      {!isLauncher ? <QuickerAgentExitOverlay /> : null}
      {!isLauncher ? <QuickerAgentUpdateChecker /> : null}
      {!isLauncher ? <QuickerAgentUpdateOverlay /> : null}
      <AppConfirmHost />
      <AppMessageHost />
      {!isLauncher ? <AppWindowFocusTracker /> : null}
    </>
  );
}
