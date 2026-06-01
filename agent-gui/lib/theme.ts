export type ThemePreference = "system" | "light" | "dark";

export const THEME_STORAGE_KEY = "agent-gui-theme";

export function getStoredTheme(): ThemePreference {
  if (typeof window === "undefined") return "system";
  try {
    const value = localStorage.getItem(THEME_STORAGE_KEY);
    if (value === "light" || value === "dark" || value === "system") {
      return value;
    }
  } catch {
    /* ignore */
  }
  return "system";
}

export function applyTheme(preference: ThemePreference): void {
  const root = document.documentElement;
  if (preference === "system") {
    root.removeAttribute("data-theme");
    root.style.colorScheme = "";
  } else {
    root.dataset.theme = preference;
    root.style.colorScheme = preference;
  }
}

export function setStoredTheme(preference: ThemePreference): void {
  try {
    if (preference === "system") {
      localStorage.removeItem(THEME_STORAGE_KEY);
    } else {
      localStorage.setItem(THEME_STORAGE_KEY, preference);
    }
  } catch {
    /* ignore */
  }
  applyTheme(preference);
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent("agent-gui-theme-change", { detail: preference }),
    );
  }
}

/** Inline script for layout.tsx — prevents theme flash before hydration. */
export const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem("${THEME_STORAGE_KEY}");if(t==="light"||t==="dark"){document.documentElement.dataset.theme=t;document.documentElement.style.colorScheme=t;}}catch(e){}})();`;
