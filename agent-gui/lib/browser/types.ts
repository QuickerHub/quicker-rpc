export type BrowserRuntimeMode = "headless" | "embedded";

/** @deprecated Use BrowserRuntimeMode — kept for panel API payloads during migration */
export type BrowserLegacyMode = "playwright" | "native";

export type BrowserTargetInput = "auto" | "headless" | "embedded";

export type ResolveBrowserTargetInput = {
  target?: BrowserTargetInput;
  showPanel?: boolean;
  /** Electron :6018 health + BROWSER_AUTOMATION_MODE allows native */
  embeddedAvailable: boolean;
};

export type ExecuteBrowserAutomationOptions = {
  audience?: "agent" | "panel";
  fallbackFromNative?: boolean;
  showPanel?: boolean;
};
