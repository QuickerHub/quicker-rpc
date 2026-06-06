import type {
  FrontendIssue,
  FrontendIssueKind,
  FrontendSmokeResult,
} from "@/lib/dev-frontend-types";
import {
  clientErrorsToIssues,
  mergeUniqueIssues,
  readClientFrontendErrors,
  readDevServerInfo,
  readFrontendBuildError,
  writeFrontendSmokeLast,
} from "@/lib/dev-frontend-error-store.server";

const NEXT_ERROR_MARKERS = [
  "Module build failed",
  "Failed to compile",
  "Unhandled Runtime Error",
  "Application error: a client-side exception",
  "Internal Server Error",
  "UnhandledSchemeError",
  "Syntax Error",
  "Hydration failed",
  "Maximum update depth exceeded",
  "Cannot find module",
  "ENOENT: no such file or directory",
  "Build Error",
];

const HTML_ERROR_PATTERNS: Array<{ kind: FrontendIssueKind; pattern: RegExp }> = [
  { kind: "compile", pattern: /Module build failed[\s\S]{0,2000}/i },
  { kind: "compile", pattern: /Failed to compile[\s\S]{0,2000}/i },
  { kind: "runtime", pattern: /Unhandled Runtime Error[\s\S]{0,2000}/i },
  { kind: "hydration", pattern: /Hydration failed[\s\S]{0,1200}/i },
  { kind: "runtime", pattern: /Maximum update depth exceeded[\s\S]{0,800}/i },
];

function resolveBaseUrl(explicit?: string): string {
  const trimmed = explicit?.trim();
  if (trimmed) return trimmed.replace(/\/$/, "");

  // Prefer the live Next dev process (frontend-check runs inside it).
  const port = process.env.PORT?.trim();
  const host = process.env.HOSTNAME?.trim() || "127.0.0.1";
  if (port) return `http://${host}:${port}`;

  const fromFile = readDevServerInfo()?.url?.trim();
  if (fromFile) return fromFile.replace(/\/$/, "");

  return "http://127.0.0.1:3000";
}

function extractIssuesFromHtml(html: string, url: string): FrontendIssue[] {
  const issues: FrontendIssue[] = [];
  const text = html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/\s+/g, " ");

  for (const marker of NEXT_ERROR_MARKERS) {
    if (!text.includes(marker) && !html.includes(marker)) continue;
    issues.push({
      kind: marker.includes("Hydration") ? "hydration" : "compile",
      message: marker,
      url,
      at: new Date().toISOString(),
    });
  }

  for (const { kind, pattern } of HTML_ERROR_PATTERNS) {
    const match = html.match(pattern);
    if (!match) continue;
    const snippet = match[0].replace(/\s+/g, " ").trim().slice(0, 1200);
    issues.push({
      kind,
      message: snippet,
      url,
      at: new Date().toISOString(),
    });
  }

  return issues;
}

async function fetchPageIssues(
  url: string,
  timeoutMs: number,
): Promise<{ statusCode?: number; issues: FrontendIssue[] }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: "GET",
      signal: controller.signal,
      cache: "no-store",
      headers: { Accept: "text/html" },
    });
    const html = await res.text();
    const issues: FrontendIssue[] = [];

    if (res.status >= 400) {
      issues.push({
        kind: "http",
        message: `GET ${url} returned HTTP ${res.status}`,
        url,
        at: new Date().toISOString(),
      });
    }

    issues.push(...extractIssuesFromHtml(html, url));
    return { statusCode: res.status, issues };
  } catch (err) {
    return {
      issues: [
        {
          kind: "http",
          message: err instanceof Error ? err.message : String(err),
          url,
          at: new Date().toISOString(),
        },
      ],
    };
  } finally {
    clearTimeout(timer);
  }
}

function buildErrorSnapshotToIssues(): FrontendIssue[] {
  const snapshot = readFrontendBuildError();
  if (!snapshot?.issues?.length) {
    if (!snapshot?.excerpt?.trim()) return [];
    return [
      {
        kind: "compile",
        message: snapshot.excerpt.trim().slice(0, 2000),
        at: snapshot.capturedAt,
      },
    ];
  }
  return snapshot.issues;
}

export async function runFrontendSmokeCheck(options?: {
  baseUrl?: string;
  timeoutMs?: number;
  paths?: string[];
}): Promise<FrontendSmokeResult> {
  const baseUrl = resolveBaseUrl(options?.baseUrl);
  const timeoutMs = options?.timeoutMs ?? 90_000;
  const paths = options?.paths ?? ["/", "/api/llm", "/api/ping"];
  const checkedAt = new Date().toISOString();
  const issues: FrontendIssue[] = [];
  let homeStatus: number | undefined;

  for (const path of paths) {
    const url = `${baseUrl}${path.startsWith("/") ? path : `/${path}`}`;
    const page = await fetchPageIssues(url, timeoutMs);
    if (path === "/") {
      homeStatus = page.statusCode;
    }
    if (page.statusCode !== undefined && page.statusCode >= 400) {
      issues.push({
        kind: "http",
        message: `GET ${url} returned HTTP ${page.statusCode}`,
        url,
        at: checkedAt,
      });
    }
    issues.push(...page.issues);
  }

  issues.push(...buildErrorSnapshotToIssues());
  issues.push(...clientErrorsToIssues(readClientFrontendErrors()));

  const merged = mergeUniqueIssues(issues);
  const ok = merged.length === 0 && (homeStatus ?? 500) < 400;

  const result: FrontendSmokeResult = {
    ok,
    url: baseUrl,
    statusCode: homeStatus,
    issues: merged,
    checkedAt,
  };

  writeFrontendSmokeLast(result);
  return result;
}

export function parseNextDevLogChunk(chunk: string): FrontendIssue[] {
  const text = chunk.replace(/\u001b\[[0-9;]*m/g, "");
  const issues: FrontendIssue[] = [];
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);

  for (const line of lines) {
    if (
      line.startsWith("⨯")
      || line.includes("Module build failed")
      || line.includes("Failed to compile")
      || line.includes("Syntax Error")
      || line.includes("UnhandledSchemeError")
      || line.includes("Maximum update depth exceeded")
    ) {
      issues.push({
        kind: "compile",
        message: line.replace(/^⨯\s*/, ""),
        at: new Date().toISOString(),
      });
    }
  }

  return issues;
}
