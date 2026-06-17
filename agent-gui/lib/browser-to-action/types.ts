import type { BrowserAgentAction } from "@/lib/browser/input-types";

export type RefTargetHint = {
  role: string;
  name?: string | null;
  nth?: number;
};

export type BrowserRecordingSource = "browser" | "user_browser";

export type BrowserRecordingEntry = {
  source: BrowserRecordingSource;
  /** Tool input as executed (browser or user_browser). */
  input: Record<string, unknown>;
  /** Resolved element target for ref-based actions. */
  refTarget?: RefTargetHint;
  /** CSS selector when known (content / pick_element). */
  selector?: string;
};

export type WorkspaceActionVariable = {
  key: string;
  type: number;
  defaultValue: string;
};

export type WorkspaceActionStep = {
  stepRunnerKey: string;
  inputParams: Record<string, unknown>;
  outputParams?: Record<string, string>;
  note?: string;
};

export type WorkspaceActionDataJson = {
  variables: WorkspaceActionVariable[];
  steps: WorkspaceActionStep[];
};

export type BrowserToActionOptions = {
  tabVariable?: string;
  addComments?: boolean;
  /** When true, append sys:writeclipboard from last RunScript rawResponse variable. */
  clipboardFromLastScript?: boolean;
};

export type BrowserToActionSkipped = {
  reason: string;
  action: string;
};

export type BrowserToActionResult = {
  ok: boolean;
  dataJson: WorkspaceActionDataJson;
  steps: WorkspaceActionStep[];
  variables: WorkspaceActionVariable[];
  warnings: string[];
  skipped: BrowserToActionSkipped[];
  summary: string;
};

export type BrowserToolRecordingInput = {
  action: BrowserAgentAction;
  url?: string;
  ref?: string;
  text?: string;
  value?: string;
  key?: string;
  script?: string;
  selector?: string;
  sessionId?: string;
};
