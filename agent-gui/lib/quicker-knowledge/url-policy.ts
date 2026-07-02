import type { QuickerKnowledgeSourceType } from "@/lib/quicker-knowledge/types";

const ALLOWED_HOST = "getquicker.net";

function parseUrl(rawUrl: string, base?: string): URL | null {
  try {
    return new URL(rawUrl, base);
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

export function canonicalizeQuickerKnowledgeUrl(input: string, base?: string): string | null {
  const url = parseUrl(input, base);
  if (!url || (url.protocol !== "http:" && url.protocol !== "https:")) {
    return null;
  }

  url.protocol = "https:";
  url.hostname = url.hostname.toLowerCase();
  if (url.hostname !== ALLOWED_HOST) {
    return null;
  }

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
  const canonicalUrl = canonicalizeQuickerKnowledgeUrl(rawUrl);
  if (!canonicalUrl) {
    return "unknown";
  }

  const url = parseUrl(canonicalUrl);
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

export function isAllowedQuickerKnowledgeUrl(input: string, base?: string): boolean {
  const canonicalUrl = canonicalizeQuickerKnowledgeUrl(input, base);
  if (!canonicalUrl) {
    return false;
  }

  return classifyQuickerKnowledgeUrl(canonicalUrl) !== "unknown";
}
