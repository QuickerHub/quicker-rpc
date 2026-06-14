import type { BrowserRuntimeMode, BrowserTargetInput, ResolveBrowserTargetInput } from "./types";

export function resolveBrowserTarget(input: ResolveBrowserTargetInput): BrowserRuntimeMode {
  const target: BrowserTargetInput = input.target ?? "auto";

  if (target === "headless") {
    return "headless";
  }

  if (target === "embedded") {
    return input.embeddedAvailable ? "embedded" : "headless";
  }

  // auto: embedded when side panel display requested and runtime is up
  if (input.showPanel === true && input.embeddedAvailable) {
    return "embedded";
  }

  return "headless";
}
