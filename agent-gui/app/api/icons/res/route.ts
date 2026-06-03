import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  normalizeResIconRequestPath,
  resolveResIconSvg,
} from "@/lib/action-editor/shared/resIconCatalog";

export const dynamic = "force-dynamic";

const PUBLIC_ICONS_ROOT = path.join(process.cwd(), "public", "ActionDesignerIcons");

function contentTypeForPath(relPath: string): string {
  const lower = relPath.toLowerCase();
  if (lower.endsWith(".svg")) return "image/svg+xml";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".webp")) return "image/webp";
  return "application/octet-stream";
}

async function tryReadPublicIcon(relPath: string): Promise<Buffer | null> {
  const abs = path.join(PUBLIC_ICONS_ROOT, ...relPath.split("/"));
  const normalizedRoot = path.normalize(PUBLIC_ICONS_ROOT);
  const normalizedAbs = path.normalize(abs);
  if (!normalizedAbs.startsWith(normalizedRoot)) {
    return null;
  }
  try {
    return await readFile(abs);
  } catch {
    return null;
  }
}

/**
 * Serves Quicker `res:` PNG assets from public/ActionDesignerIcons when present,
 * otherwise returns bundled SVG fallbacks (Var type icons, etc.).
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const relPath = normalizeResIconRequestPath(url.searchParams.get("path") ?? "");
  if (!relPath) {
    return new Response("Missing or invalid path", { status: 400 });
  }

  const bytes = await tryReadPublicIcon(relPath);
  if (bytes) {
    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type": contentTypeForPath(relPath),
        "Cache-Control": "public, max-age=86400, immutable",
      },
    });
  }

  const svg = resolveResIconSvg(relPath);
  if (!svg) {
    return new Response("not_found", { status: 404 });
  }

  return new Response(svg, {
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": "public, max-age=86400",
    },
  });
}
