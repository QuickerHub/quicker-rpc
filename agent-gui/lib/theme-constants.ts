export type ThemePreference = "system" | "light" | "dark";

export const THEME_STORAGE_KEY = "agent-gui-theme";

/** Inline script for layout.tsx — prevents theme flash before hydration. */
export const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem("${THEME_STORAGE_KEY}");if(t==="light"||t==="dark"){document.documentElement.dataset.theme=t;document.documentElement.style.colorScheme=t;}}catch(e){}})();`;
