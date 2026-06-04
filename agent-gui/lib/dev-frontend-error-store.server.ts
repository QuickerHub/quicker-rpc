import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type {
  ClientFrontendErrorReport,
  DevServerInfo,
  FrontendBuildErrorSnapshot,
  FrontendIssue,
} from "@/lib/dev-frontend-types";

const LOCAL_DIR = join(process.cwd(), ".local");
const CLIENT_ERRORS_PATH = join(LOCAL_DIR, "frontend-client-errors.json");
const BUILD_ERROR_PATH = join(LOCAL_DIR, "frontend-build-error.json");
const DEV_SERVER_PATH = join(LOCAL_DIR, "dev-server.json");
const SMOKE_LAST_PATH = join(LOCAL_DIR, "frontend-smoke-last.json");

function ensureLocalDir(): void {
  if (!existsSync(LOCAL_DIR)) {
    mkdirSync(LOCAL_DIR, { recursive: true });
  }
}

function readJsonFile<T>(path: string): T | null {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8")) as T;
  } catch {
    return null;
  }
}

function writeJsonFile(path: string, value: unknown): void {
  ensureLocalDir();
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export function readDevServerInfo(): DevServerInfo | null {
  return readJsonFile<DevServerInfo>(DEV_SERVER_PATH);
}

export function writeDevServerInfo(info: DevServerInfo): void {
  writeJsonFile(DEV_SERVER_PATH, info);
}

export function readClientFrontendErrors(): ClientFrontendErrorReport[] {
  const data = readJsonFile<{ errors?: ClientFrontendErrorReport[] }>(
    CLIENT_ERRORS_PATH,
  );
  return Array.isArray(data?.errors) ? data.errors : [];
}

export function appendClientFrontendErrors(
  incoming: ClientFrontendErrorReport[],
): ClientFrontendErrorReport[] {
  if (incoming.length === 0) return readClientFrontendErrors();

  const existing = readClientFrontendErrors();
  const merged = [...existing, ...incoming].slice(-100);
  writeJsonFile(CLIENT_ERRORS_PATH, {
    updatedAt: new Date().toISOString(),
    errors: merged,
  });
  return merged;
}

export function clearClientFrontendErrors(): void {
  writeJsonFile(CLIENT_ERRORS_PATH, {
    updatedAt: new Date().toISOString(),
    errors: [],
  });
}

export function readFrontendBuildError(): FrontendBuildErrorSnapshot | null {
  return readJsonFile<FrontendBuildErrorSnapshot>(BUILD_ERROR_PATH);
}

export function writeFrontendBuildError(snapshot: FrontendBuildErrorSnapshot): void {
  writeJsonFile(BUILD_ERROR_PATH, snapshot);
}

export function clearFrontendBuildError(): void {
  if (existsSync(BUILD_ERROR_PATH)) {
    writeJsonFile(BUILD_ERROR_PATH, {
      capturedAt: new Date().toISOString(),
      excerpt: "",
      issues: [],
    });
  }
}

export function writeFrontendSmokeLast(result: unknown): void {
  writeJsonFile(SMOKE_LAST_PATH, result);
}

export function clientErrorsToIssues(
  errors: ClientFrontendErrorReport[],
): FrontendIssue[] {
  return errors.slice(-20).map((entry) => ({
    kind: entry.kind === "console" ? "console" : "runtime",
    message: entry.message,
    stack: entry.stack,
    source: entry.source,
    url: entry.url,
    at: entry.at,
  }));
}

export function mergeUniqueIssues(issues: FrontendIssue[]): FrontendIssue[] {
  const seen = new Set<string>();
  const merged: FrontendIssue[] = [];
  for (const issue of issues) {
    const key = `${issue.kind}|${issue.message}|${issue.source ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(issue);
  }
  return merged;
}
