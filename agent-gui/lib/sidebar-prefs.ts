export const SIDEBAR_COLLAPSED_STORAGE_KEY = "agent-gui-sidebar-collapsed";

export const SIDEBAR_COLLAPSED_HTML_CLASS = "sidebar-collapsed-init";

/** Inline script for layout.tsx — avoids sidebar expand/collapse flash before hydration. */
export const SIDEBAR_INIT_SCRIPT = `(function(){try{if(localStorage.getItem("${SIDEBAR_COLLAPSED_STORAGE_KEY}")==="1"){document.documentElement.classList.add("${SIDEBAR_COLLAPSED_HTML_CLASS}");}}catch(e){}})();`;

export function loadSidebarCollapsed(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function storeSidebarCollapsed(collapsed: boolean): void {
  if (typeof window === "undefined") return;
  try {
    if (collapsed) {
      localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, "1");
    } else {
      localStorage.removeItem(SIDEBAR_COLLAPSED_STORAGE_KEY);
    }
  } catch {
    /* ignore */
  }
}

export function applySidebarCollapsed(collapsed: boolean): void {
  storeSidebarCollapsed(collapsed);
  if (typeof document === "undefined") return;
  document.documentElement.classList.toggle(SIDEBAR_COLLAPSED_HTML_CLASS, collapsed);
}
