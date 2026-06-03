/**
 * Quicker embedded asset paths used with IconControl.
 * Accepts "res:Relative/Path.png" or the same path without the "res:" prefix (e.g. "Steps/common_step.png").
 * Bundled PNGs live under `public/ActionDesignerIcons/` (mirrors former Quicker WPF Assets layout).
 */

export type ParsedQuickerAssetIcon = {
  /** Path under Quicker Assets/ (no leading slash, no ".." segments). */
  path: string;
};

export function parseQuickerAssetIcon(raw: string | null | undefined): ParsedQuickerAssetIcon | null {
  if (raw == null) return null;
  let t = raw.trim();
  if (!t) return null;
  if (t.toLowerCase().startsWith("fa:")) return null;
  if (t.toLowerCase().startsWith("iconify:")) return null;
  if (/^https?:\/\//i.test(t)) return null;

  if (t.toLowerCase().startsWith("res:")) {
    t = t.slice("res:".length).trim();
  }

  if (!t || t.includes("..")) return null;
  if (!/^[A-Za-z0-9_/.\-]+$/.test(t)) return null;
  return { path: t.replace(/\\/g, "/") };
}

/**
 * Quicker has no dedicated files for these VarType names; map to closest existing bundled asset.
 * Mirrors former DesignerHost ActionDesignerEmbeddedIconReader.VarPathAliases.
 */
const VAR_PATH_ALIAS_BY_LOWER = new Map<string, string>([
  ["var/form.png", "Var/file.png"],
  ["var/enum.png", "Var/list.png"],
  ["var/formfordict.png", "Var/file.png"]
]);

/**
 * Map logical `res:` relative path to a filename that exists under `public/ActionDesignerIcons/`.
 */
export function resolveActionDesignerResIconRelativePath(logicalPath: string): string {
  const normalized = logicalPath.trim().replace(/\\/g, "/").replace(/^\/+/, "");
  const alias = VAR_PATH_ALIAS_BY_LOWER.get(normalized.toLowerCase());
  if (alias) {
    return alias;
  }
  if (normalized.length >= 5 && normalized.startsWith("Var/") && normalized.toLowerCase().endsWith(".png")) {
    const slash = normalized.lastIndexOf("/");
    if (slash >= 0 && slash < normalized.length - 1) {
      const dir = normalized.slice(0, slash + 1);
      const file = normalized.slice(slash + 1);
      const lower = file.toLowerCase();
      if (file !== lower) {
        return dir + lower;
      }
    }
  }
  return normalized;
}

/**
 * Bump when bundled icons change so browsers may bypass disk cache for the same logical path.
 */
const RES_ICON_CLIENT_CACHE_KEY = "icc";

const RES_ICON_CLIENT_CACHE_VERSION = "4";

/**
 * URL for a bundled `res:` icon. Uses /api/icons/res (static PNG when present, else bundled SVG).
 */
export function buildResIconRequestUrl(path: string): string {
  const rel = resolveActionDesignerResIconRelativePath(path);
  const params = new URLSearchParams({
    path: rel,
    [RES_ICON_CLIENT_CACHE_KEY]: RES_ICON_CLIENT_CACHE_VERSION,
  });
  return `/api/icons/res?${params.toString()}`;
}

/**
 * Plain absolute http(s) URL for action icons (remote PNG/SVG/GIF, etc.).
 * Rejects other schemes (e.g. javascript:) via URL parsing.
 */
export function parseHttpOrHttpsIconUrl(raw: string | null | undefined): string | null {
  if (raw == null) {
    return null;
  }
  const t = raw.trim();
  if (!t || !/^https?:\/\//i.test(t)) {
    return null;
  }
  try {
    const u = new URL(t);
    if (u.protocol !== "http:" && u.protocol !== "https:") {
      return null;
    }
    return u.href;
  } catch {
    return null;
  }
}
