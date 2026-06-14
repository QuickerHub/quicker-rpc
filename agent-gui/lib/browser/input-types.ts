import type { BrowserTargetInput } from "./types";

export type BrowserAgentAction =
  | "status"
  | "navigate"
  | "snapshot"
  | "search"
  | "content"
  | "click"
  | "click_xy"
  | "type"
  | "fill"
  | "press"
  | "wait"
  | "scroll"
  | "evaluate"
  | "tabs"
  | "tab"
  | "back"
  | "forward"
  | "reload"
  | "close";

export type BrowserPanelOnlyAction = "screenshot" | "pick_element";

export type BrowserToolInputBase = {
  sessionId?: string;
  url?: string;
  ref?: string;
  x?: number;
  y?: number;
  text?: string;
  value?: string;
  key?: string;
  waitUntil?: "load" | "domcontentloaded" | "networkidle" | "commit";
  timeoutMs?: number;
  fullPage?: boolean;
  state?: "attached" | "detached" | "visible" | "hidden";
  delayMs?: number;
  deltaX?: number;
  deltaY?: number;
  script?: string;
  selector?: string;
  offset?: number;
  index?: number;
  limit?: number;
  target?: BrowserTargetInput;
  showPanel?: boolean;
};

export type BrowserAgentToolInput = BrowserToolInputBase & {
  action: BrowserAgentAction;
};

export type BrowserPanelToolInput = BrowserToolInputBase & {
  action: BrowserPanelOnlyAction;
};

export type BrowserToolInput = BrowserAgentToolInput | BrowserPanelToolInput;

export type BrowserRuntimeAction = BrowserAgentAction | BrowserPanelOnlyAction;
