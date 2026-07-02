import type { QuickerKnowledgeSourceType } from "@/lib/quicker-knowledge/types";

const ALLOWED_HOST = "getquicker.net";

function parseUrl(rawUrl: string): URL | null {
  try {
    return new URL(rawUrl);
  } catch {
    return null;
  }
}

function stripTrailingSlash(pathname: string): string {
  if (pathname.length <= 1) {
    return pathname;
  }

  return pathname.replace(/\/+$/u, "");
}

function isPathWithPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function canonicalizeQuickerKnowledgeUrl(rawUrl: string): string {
  const url = parseUrl(rawUrl);
  if (!url) {
    return rawUrl;
  }

  url.protocol = "https:";
  url.hostname = url.hostname.toLowerCase();
  url.hash = "";
  url.pathname = stripTrailingSlash(url.pathname);

  for (const key of Array.from(url.searchParams.keys())) {
    const normalizedKey = key.toLowerCase();
    if (normalizedKey.startsWith("utm_") || normalizedKey === "spm") {
      url.searchParams.delete(key);
    }
  }

  return url.toString();
}

export function classifyQuickerKnowledgeUrl(rawUrl: string): QuickerKnowledgeSourceType {
  const url = parseUrl(canonicalizeQuickerKnowledgeUrl(rawUrl));
  if (!url) {
    return "unknown";
  }

  const pathname = stripTrailingSlash(url.pathname).toLowerCase();
  if (isPathWithPrefix(pathname, "/kc/manual/doc")) {
    return "manual";
  }

  if (isPathWithPrefix(pathname, "/kc/help/doc")) {
    return "action_dev";
  }

  if (isPathWithPrefix(pathname, "/kc/kb/article")) {
    return "kb";
  }

  if (pathname === "/kc" || pathname === "/kc/manual" || pathname === "/docs") {
    return "docs_index";
  }

  return "unknown";
}

export function isAllowedQuickerKnowledgeUrl(rawUrl: string): boolean {
  const url = parseUrl(canonicalizeQuickerKnowledgeUrl(rawUrl));
  if (!url || url.hostname !== ALLOWED_HOST) {
    return false;
  }

  return classifyQuickerKnowledgeUrl(url.toString()) !== "unknown";
}
