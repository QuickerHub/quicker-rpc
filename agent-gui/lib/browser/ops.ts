import type { BrowserRuntimeAction } from "@/lib/browser/input-types";

export function opForBrowserAction(action: BrowserRuntimeAction): string {
  switch (action) {
    case "status":
      return "status";
    case "navigate":
      return "page.navigate";
    case "snapshot":
      return "page.snapshot";
    case "search":
      return "page.search";
    case "content":
      return "page.content";
    case "click":
      return "page.click";
    case "click_xy":
      return "page.click_xy";
    case "pick_element":
      return "page.pick_element";
    case "type":
      return "page.type";
    case "fill":
      return "page.fill";
    case "press":
      return "page.press";
    case "wait":
      return "page.wait";
    case "scroll":
      return "page.scroll";
    case "evaluate":
      return "page.evaluate";
    case "screenshot":
      return "page.screenshot";
    case "tabs":
      return "page.tabs";
    case "tab":
      return "page.tab_select";
    case "back":
      return "page.back";
    case "forward":
      return "page.forward";
    case "reload":
      return "page.reload";
    case "close":
      return "session.close";
    default:
      return action;
  }
}

export const SESSION_ENSURE_ACTIONS = new Set<BrowserRuntimeAction>([
  "navigate",
  "snapshot",
  "search",
  "content",
  "click",
  "click_xy",
  "pick_element",
  "type",
  "fill",
  "press",
  "wait",
  "scroll",
  "evaluate",
  "screenshot",
  "back",
  "forward",
  "reload",
  "tabs",
  "tab",
]);
