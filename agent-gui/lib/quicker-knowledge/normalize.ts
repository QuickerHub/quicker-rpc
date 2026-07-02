import { createHash } from "node:crypto";

import type {
  QuickerKnowledgeChunk,
  QuickerKnowledgePage,
} from "@/lib/quicker-knowledge/types";
import {
  canonicalizeQuickerKnowledgeUrl,
  classifyQuickerKnowledgeUrl,
  isAllowedQuickerKnowledgeUrl,
} from "@/lib/quicker-knowledge/url-policy";

export type NormalizeQuickerKnowledgeHtmlInput = {
  html: string;
  url: string;
  fetchedAt: string;
};

export type NormalizeQuickerKnowledgeHtmlResult = {
  page: QuickerKnowledgePage;
  chunks: QuickerKnowledgeChunk[];
};

const CHROME_TAGS = ["script", "style", "nav", "footer", "aside"];
const LIKELY_CONTENT_ATTRIBUTE_PATTERN =
  /\b(?:class|id)\s*=\s*(?:"[^"]*(?:article|content|markdown|doc|manual|kb|post)[^"]*"|'[^']*(?:article|content|markdown|doc|manual|kb|post)[^']*'|[^\s>]*(?:article|content|markdown|doc|manual|kb|post)[^\s>]*)/iu;

function hashText(text: string): string {
  return createHash("sha256").update(text).digest("hex").slice(0, 16);
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&nbsp;/giu, " ")
    .replace(/&amp;/giu, "&")
    .replace(/&lt;/giu, "<")
    .replace(/&gt;/giu, ">")
    .replace(/&quot;/giu, '"')
    .replace(/&#39;|&apos;/giu, "'")
    .replace(/&#(\d+);/gu, (entity: string, code: string) => decodeNumericEntity(entity, code, 10))
    .replace(/&#x([\da-f]+);/giu, (entity: string, code: string) => decodeNumericEntity(entity, code, 16));
}

function decodeNumericEntity(entity: string, code: string, radix: number): string {
  const codePoint = Number.parseInt(code, radix);
  if (!Number.isInteger(codePoint) || codePoint < 0 || codePoint > 0x10ffff) {
    return entity;
  }

  try {
    return String.fromCodePoint(codePoint);
  } catch {
    return entity;
  }
}

function stripTags(html: string): string {
  return decodeHtmlEntities(html.replace(/<[^>]*>/gu, " "));
}

function stripChrome(html: string): string {
  let cleaned = html.replace(/<!--[\s\S]*?-->/gu, " ");
  for (const tag of CHROME_TAGS) {
    cleaned = cleaned.replace(new RegExp(`<${tag}\\b[\\s\\S]*?<\\/${tag}>`, "giu"), " ");
  }

  return cleaned;
}

function extractMainHtml(html: string): string {
  const cleaned = stripChrome(html);
  return (
    extractFirstElementByTag(cleaned, "main") ??
    extractFirstElementByTag(cleaned, "article") ??
    extractLikelyContentElement(cleaned) ??
    cleaned
  );
}

function extractFirstElementByTag(html: string, tag: string): string | null {
  const match = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, "iu").exec(html);
  return match?.[1] ?? null;
}

function extractLikelyContentElement(html: string): string | null {
  for (const match of html.matchAll(/<([a-z][\w:-]*)\b([^>]*)>/giu)) {
    const [openTag, tagName, attributes] = match;
    if (!LIKELY_CONTENT_ATTRIBUTE_PATTERN.test(attributes)) {
      continue;
    }

    const afterOpenTagIndex = match.index + openTag.length;
    const closeMatch = new RegExp(`<\\/${tagName}\\s*>`, "iu").exec(html.slice(afterOpenTagIndex));
    if (closeMatch) {
      return html.slice(afterOpenTagIndex, afterOpenTagIndex + closeMatch.index);
    }
  }

  return null;
}

function extractTitleFromTag(html: string): string | null {
  const titleMatch = /<title\b[^>]*>([\s\S]*?)<\/title>/iu.exec(html);
  const title = titleMatch ? normalizeInlineText(titleMatch[1]) : "";
  return title || null;
}

function normalizeInlineText(html: string): string {
  return stripTags(html).replace(/\s+/gu, " ").trim();
}

function extractFirstH1Heading(markdown: string): string | null {
  for (const line of markdown.split("\n")) {
    const match = /^#\s+(.+)$/u.exec(line.trim());
    if (match) {
      return match[1].trim();
    }
  }

  return null;
}

function htmlToReadableText(html: string): string {
  const withBlocks = html
    .replace(/<pre\b[^>]*>([\s\S]*?)<\/pre>/giu, (_, content: string) => {
      const text = normalizeInlineText(content);
      return `\n\n\`\`\`\n${text}\n\`\`\`\n\n`;
    })
    .replace(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/giu, (_, level: string, content: string) => {
      const text = normalizeInlineText(content);
      return text ? `\n\n${"#".repeat(Number(level))} ${text}\n\n` : "\n\n";
    })
    .replace(/<li\b[^>]*>([\s\S]*?)<\/li>/giu, (_, content: string) => {
      const text = normalizeInlineText(content);
      return text ? `\n- ${text}\n` : "\n";
    })
    .replace(/<br\s*\/?>/giu, "\n")
    .replace(/<\/p\s*>/giu, "\n\n")
    .replace(/<p\b[^>]*>/giu, "")
    .replace(/<\/(?:div|section|article|ul|ol|table|thead|tbody|tr)\s*>/giu, "\n\n")
    .replace(/<code\b[^>]*>([\s\S]*?)<\/code>/giu, (_, content: string) => {
      const text = normalizeInlineText(content);
      return text ? ` ${text} ` : " ";
    })
    .replace(/<\/(?:td|th)\s*>/giu, " ");

  return decodeHtmlEntities(withBlocks.replace(/<[^>]*>/gu, " "))
    .split("\n")
    .map((line) => line.replace(/[ \t]+/gu, " ").trim())
    .join("\n")
    .replace(/\n{3,}/gu, "\n\n")
    .trim();
}

function extractLinks(html: string, baseUrl: string): string[] {
  const links: string[] = [];
  const seen = new Set<string>();

  for (const match of html.matchAll(/\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/giu)) {
    const href = match[1] ?? match[2] ?? match[3] ?? "";
    const canonicalUrl = canonicalizeQuickerKnowledgeUrl(decodeHtmlEntities(href), baseUrl);
    if (!canonicalUrl || !isAllowedQuickerKnowledgeUrl(canonicalUrl)) {
      continue;
    }

    if (!seen.has(canonicalUrl)) {
      seen.add(canonicalUrl);
      links.push(canonicalUrl);
    }
  }

  return links;
}

function makeChunk(
  page: QuickerKnowledgePage,
  sectionPath: string[],
  text: string,
): QuickerKnowledgeChunk {
  const contentHash = hashText(text);
  return {
    id: `${page.id}:${contentHash}`,
    pageId: page.id,
    url: page.canonicalUrl,
    title: page.title,
    sectionPath,
    sourceType: page.sourceType,
    text,
    tokenEstimate: Math.ceil(text.length / 3),
    contentHash,
  };
}

function chunkByHeadingBoundaries(page: QuickerKnowledgePage, text: string): QuickerKnowledgeChunk[] {
  const chunks: QuickerKnowledgeChunk[] = [];
  const headingPath: string[] = [];
  let currentSectionPath: string[] = [];
  let currentLines: string[] = [];

  const flush = () => {
    const chunkText = currentLines.join("\n").trim();
    if (chunkText) {
      chunks.push(makeChunk(page, currentSectionPath, chunkText));
    }
    currentLines = [];
  };

  for (const line of text.split("\n")) {
    const headingMatch = /^(#{1,6})\s+(.+)$/u.exec(line);
    if (headingMatch) {
      flush();
      const level = headingMatch[1].length;
      headingPath[level - 1] = headingMatch[2].trim();
      headingPath.length = level;
      currentSectionPath = headingPath.filter(Boolean);
      currentLines.push(line);
      continue;
    }

    currentLines.push(line);
  }

  flush();

  if (chunks.length > 0) {
    return chunks;
  }

  const fallbackText = text.trim();
  return fallbackText ? [makeChunk(page, [page.title], fallbackText)] : [];
}

export function normalizeQuickerKnowledgeHtml(
  input: NormalizeQuickerKnowledgeHtmlInput,
): NormalizeQuickerKnowledgeHtmlResult {
  const canonicalUrl = canonicalizeQuickerKnowledgeUrl(input.url) ?? input.url;
  const selectedHtml = extractMainHtml(input.html);
  const readableText = htmlToReadableText(selectedHtml);
  const title = extractFirstH1Heading(readableText) ?? extractTitleFromTag(input.html) ?? "Quicker documentation";
  const sourceType = classifyQuickerKnowledgeUrl(canonicalUrl);
  const contentHash = hashText(readableText);
  const page: QuickerKnowledgePage = {
    id: hashText(canonicalUrl),
    url: input.url,
    canonicalUrl,
    title,
    sourceType,
    fetchedAt: input.fetchedAt,
    contentHash,
    links: extractLinks(selectedHtml, canonicalUrl),
  };

  return {
    page,
    chunks: chunkByHeadingBoundaries(page, readableText),
  };
}
