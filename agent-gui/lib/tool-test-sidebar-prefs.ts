import type { ToolTestSidebarTab } from "@/components/tool-test/ToolTestSidebarTabs";

export type { ToolTestSidebarTab };

export const TOOL_TEST_SIDEBAR_TAB_STORAGE_KEY = "tool-test-sidebar-tab";

const DEFAULT_SIDEBAR_TAB: ToolTestSidebarTab = "prompt-chat";

const VALID_SIDEBAR_TABS = new Set<ToolTestSidebarTab>([
  "tools",
  "prompt",
  "prompt-chat",
  "quickerbench",
  "auto-fix",
  "launcher",
  "action-trace",
  "action-runtime",
  "context-compression",
  "voice-input",
  "ask-question",
  "llm-probe",
]);

export function isToolTestSidebarTab(value: unknown): value is ToolTestSidebarTab {
  return typeof value === "string" && VALID_SIDEBAR_TABS.has(value as ToolTestSidebarTab);
}

export function defaultToolTestSidebarTab(): ToolTestSidebarTab {
  return DEFAULT_SIDEBAR_TAB;
}

export function loadStoredToolTestSidebarTab(): ToolTestSidebarTab {
  if (typeof window === "undefined") return DEFAULT_SIDEBAR_TAB;
  try {
    const raw = localStorage.getItem(TOOL_TEST_SIDEBAR_TAB_STORAGE_KEY);
    return isToolTestSidebarTab(raw) ? raw : DEFAULT_SIDEBAR_TAB;
  } catch {
    return DEFAULT_SIDEBAR_TAB;
  }
}

export function storeToolTestSidebarTab(tab: ToolTestSidebarTab): void {
  try {
    localStorage.setItem(TOOL_TEST_SIDEBAR_TAB_STORAGE_KEY, tab);
  } catch {
    /* ignore */
  }
}
