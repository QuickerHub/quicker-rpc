"use client";

import {
  THEME_STORAGE_KEY,
  type ThemePreference,
} from "@/lib/theme-constants";

export type { ThemePreference } from "@/lib/theme-constants";
export { THEME_STORAGE_KEY, THEME_INIT_SCRIPT } from "@/lib/theme-constants";

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
  window.dispatchEvent(
    new CustomEvent("agent-gui-theme-change", { detail: preference }),
  );
}
