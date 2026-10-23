import { readFile, realpath, stat } from "node:fs/promises";
import { extname, isAbsolute, relative, resolve } from "node:path";
import { createHash } from "node:crypto";

const pages = new Set(["/", "/launcher", "/bench", "/tool-test", "/cursor-sdk"]);
const contentTypes: Record<string, string> = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg",
  ".ico": "image/x-icon", ".woff2": "font/woff2", ".wasm": "application/wasm",
};
const within = (root: string, path: string) => {
  const rel = relative(root, path);
  return rel !== ".." && !rel.startsWith("../") && !rel.startsWith("..\\") && !isAbsolute(rel);
};

/** Only the declared renderer root is public; never fall through to cwd or data. */
export function createStaticRendererHandler(directory: string) {
  const configuredRoot = resolve(directory);
  return async (request: Request): Promise<Response> => {
    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response(null, { status: 405, headers: { allow: "GET, HEAD" } });
    }
    let path: string;
    try { path = decodeURIComponent(new URL(request.url).pathname); }
    catch { return new Response(null, { status: 400 }); }
    if (path.includes("\\") || path.includes("\0") || path.split("/").some((part) => part.startsWith("."))) {
      return new Response(null, { status: 404 });
    }
    try {
      const root = await realpath(configuredRoot);
      const target = resolve(root, pages.has(path) ? "index.html" : `.${path}`);
      if (!within(root, target)) return new Response(null, { status: 404 });
      const canonical = await realpath(target);
      if (!within(root, canonical) || !(await stat(canonical)).isFile()) return new Response(null, { status: 404 });
      const body = await readFile(canonical);
      request.signal.throwIfAborted();
      const etag = `"${createHash("sha256").update(body).digest("hex")}"`;
      const headers = {
        "content-type": contentTypes[extname(canonical)] ?? "application/octet-stream",
        "cache-control": pages.has(path) || extname(canonical) === ".html" ? "no-cache" : "public, max-age=0, must-revalidate",
        "x-content-type-options": "nosniff", etag,
      };
      if (request.headers.get("if-none-match") === etag) return new Response(null, { status: 304, headers });
      return new Response(request.method === "HEAD" ? null : body, { headers });
    } catch (error) {
      if (request.signal.aborted) return new Response(null, { status: 499 });
      if (["ENOENT", "ENOTDIR"].includes((error as NodeJS.ErrnoException).code ?? "")) return new Response(null, { status: 404 });
      throw error;
    }
  };
}
