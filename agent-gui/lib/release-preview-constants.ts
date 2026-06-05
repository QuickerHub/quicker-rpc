/** Cookie + localStorage flag: dev server behaves like Tauri release for LLM/UI. */
export const RELEASE_PREVIEW_COOKIE = "qa-release-preview";
export const RELEASE_PREVIEW_STORAGE_KEY = "qa-release-preview";

/** Inline script — sync html[data-release-preview] before React hydration. */
export const RELEASE_PREVIEW_INIT_SCRIPT = `(function(){try{var k="${RELEASE_PREVIEW_STORAGE_KEY}";var v=localStorage.getItem(k);if(v==="1"){document.documentElement.dataset.releasePreview="1";document.cookie="${RELEASE_PREVIEW_COOKIE}=1; path=/; max-age=2592000; SameSite=Lax"}}catch(e){}})();`;
