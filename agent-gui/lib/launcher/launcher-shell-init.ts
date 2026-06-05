/** Runs before React paint on /launcher to pick transparent (Tauri) vs themed (browser) shell. */
export const LAUNCHER_SHELL_INIT_SCRIPT = `(function(){try{var d=document.documentElement;d.classList.add("launcher-html");if("__TAURI_INTERNALS__"in window||"__TAURI__"in window){d.classList.add("launcher-html--transparent");}else{d.classList.add("launcher-html--web");}}catch(e){}})();`;

export function isLauncherTransparentShell(): boolean {
  if (typeof window === "undefined") return false;
  return "__TAURI_INTERNALS__" in window || "__TAURI__" in window;
}
