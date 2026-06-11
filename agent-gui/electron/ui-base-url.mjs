/** Tracks the bundled Next.js UI origin for launcher / external windows. */

/** @type {string | null} */
let productionUiUrl = null;

/** @param {string} url */
export function setProductionUiUrl(url) {
  productionUiUrl = url.replace(/\/$/, "");
}

/**
 * @param {boolean} isDev
 * @returns {string}
 */
export function getUiBaseUrl(isDev) {
  if (isDev) {
    const host = process.env.HOSTNAME?.trim() || "127.0.0.1";
    const port = process.env.AGENT_GUI_PORT?.trim() || "3000";
    return `http://${host}:${port}`;
  }
  if (!productionUiUrl) {
    throw new Error("UI base URL is not configured");
  }
  return productionUiUrl;
}
