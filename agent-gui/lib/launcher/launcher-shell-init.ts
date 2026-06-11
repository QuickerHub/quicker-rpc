/** Runs before React paint on /launcher to pick transparent (desktop) vs themed (browser) shell. */
export const LAUNCHER_SHELL_INIT_SCRIPT = `(function(){try{var d=document.documentElement,w=window;d.classList.add("launcher-html");if("__TAURI_INTERNALS__"in w||"__TAURI__"in w||w.__DESKTOP_SHELL__==="electron"||"__ELECTRON__"in w){d.classList.add("launcher-html--transparent");}else{d.classList.add("launcher-html--web");}d.dataset.appBootSkip="1";d.dataset.appReady="1";var s=document.getElementById("app-bootstrap-splash");if(s)s.remove();}catch(e){}})();`;

export function isLauncherTransparentShell(): boolean {
  if (typeof window === "undefined") return false;
  if ("__TAURI_INTERNALS__" in window || "__TAURI__" in window) return true;
  return window.__DESKTOP_SHELL__ === "electron" || "__ELECTRON__" in window;
}
