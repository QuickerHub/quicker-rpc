import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { runWithQkrpcCwd } from "@/lib/qkrpc-request-context";
import {
  grepWorkspacePath,
  type WorkspaceGrepMatch,
} from "@/lib/workspace-fs";
import evalCases from "@/lib/workspace-grep-eval.json";

export type WorkspaceGrepEvalMatchExpect = {
  path: string;
  line: number;
  column?: number;
};

export type WorkspaceGrepEvalExpect = {
  minMatches?: number;
  maxMatches?: number;
  truncated?: boolean;
  paths?: string[];
  matches?: WorkspaceGrepEvalMatchExpect[];
};

export type WorkspaceGrepEvalCase = {
  id: string;
  category: string;
  files: Record<string, string>;
  path: string;
  query: string;
  options?: {
    maxMatches?: number;
    caseInsensitive?: boolean;
    literal?: boolean;
  };
  expect: WorkspaceGrepEvalExpect;
  knownIssue?: string;
};

export type WorkspaceGrepEvalDataset = {
  version: number;
  cases: WorkspaceGrepEvalCase[];
};

export type WorkspaceGrepEvalCaseResult = {
  id: string;
  category: string;
  passed: boolean;
  knownIssue?: string;
  failures: string[];
  matchCount: number;
  truncated: boolean;
  filesScanned: number;
  matches: WorkspaceGrepMatch[];
};

export type WorkspaceGrepEvalSummary = {
  total: number;
  passed: number;
  failed: number;
  blockingFailed: number;
  caseResults: WorkspaceGrepEvalCaseResult[];
};

export const DEFAULT_GREP_EVAL_DATASET =
  evalCases as unknown as WorkspaceGrepEvalDataset;

function normalizePath(p: string): string {
  return p.replace(/\\/g, "/");
}

async function writeFixtureFiles(
  root: string,
  files: Record<string, string>,
): Promise<void> {
  for (const [relPath, content] of Object.entries(files)) {
    const abs = join(root, relPath);
    await mkdir(dirname(abs), { recursive: true });
    await writeFile(abs, content, "utf8");
  }
}

export function evaluateWorkspaceGrepCase(
  testCase: WorkspaceGrepEvalCase,
  result:
    | { ok: true; matches: WorkspaceGrepMatch[]; truncated: boolean; filesScanned: number }
    | { ok: false; error: string },
): WorkspaceGrepEvalCaseResult {
  const failures: string[] = [];
  const expect = testCase.expect;

  if (!result.ok) {
    failures.push(result.error);
    return {
      id: testCase.id,
      category: testCase.category,
      passed: false,
      knownIssue: testCase.knownIssue,
      failures,
      matchCount: 0,
      truncated: false,
      filesScanned: 0,
      matches: [],
    };
  }

  const matches = result.matches;
  if (expect.minMatches != null && matches.length < expect.minMatches) {
    failures.push(`expected >= ${expect.minMatches} matches, got ${matches.length}`);
  }
  if (expect.maxMatches != null && matches.length > expect.maxMatches) {
    failures.push(`expected <= ${expect.maxMatches} matches, got ${matches.length}`);
  }
  if (expect.truncated != null && result.truncated !== expect.truncated) {
    failures.push(`expected truncated=${expect.truncated}, got ${result.truncated}`);
  }

  if (expect.paths) {
    const got = matches.map((m) => normalizePath(m.path)).sort();
    const want = expect.paths.map(normalizePath).sort();
    if (got.join("|") !== want.join("|")) {
      failures.push(`expected paths [${want.join(", ")}], got [${got.join(", ")}]`);
    }
  }

  if (expect.matches) {
    for (const spec of expect.matches) {
      const found = matches.some(
        (m) =>
          normalizePath(m.path) === normalizePath(spec.path)
          && m.line === spec.line
          && (spec.column == null || m.column === spec.column),
      );
      if (!found) {
        failures.push(
          `missing expected match ${normalizePath(spec.path)}:${spec.line}${spec.column != null ? `:${spec.column}` : ""}`,
        );
      }
    }
  }

  return {
    id: testCase.id,
    category: testCase.category,
    passed: failures.length === 0,
    knownIssue: testCase.knownIssue,
    failures,
    matchCount: matches.length,
    truncated: result.truncated,
    filesScanned: result.filesScanned,
    matches,
  };
}

export async function runWorkspaceGrepEvalCase(
  testCase: WorkspaceGrepEvalCase,
  root: string,
): Promise<WorkspaceGrepEvalCaseResult> {
  await writeFixtureFiles(root, testCase.files);
  return runWithQkrpcCwd(root, async () => {
    const result = await grepWorkspacePath(testCase.path, testCase.query, {
      maxMatches: testCase.options?.maxMatches,
      caseInsensitive: testCase.options?.caseInsensitive,
      literal: testCase.options?.literal ?? true,
    });
    return evaluateWorkspaceGrepCase(testCase, result);
  });
}

export async function runWorkspaceGrepEval(
  dataset: WorkspaceGrepEvalDataset = DEFAULT_GREP_EVAL_DATASET,
): Promise<WorkspaceGrepEvalSummary> {
  const caseResults: WorkspaceGrepEvalCaseResult[] = [];

  for (const testCase of dataset.cases) {
    const root = await mkdtemp(join(tmpdir(), "ws-grep-eval-"));
    try {
      caseResults.push(await runWorkspaceGrepEvalCase(testCase, root));
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }

  const blockingFailed = caseResults.filter(
    (r) => !r.passed && !r.knownIssue,
  ).length;

  return {
    total: caseResults.length,
    passed: caseResults.filter((r) => r.passed).length,
    failed: caseResults.filter((r) => !r.passed).length,
    blockingFailed,
    caseResults,
  };
}

export function formatWorkspaceGrepEvalReport(summary: WorkspaceGrepEvalSummary): string {
  const lines = [
    "Workspace grep eval",
    `Cases: ${summary.total} | passed ${summary.passed} | failed ${summary.failed} | blocking ${summary.blockingFailed}`,
    "",
  ];

  const failing = summary.caseResults.filter((r) => !r.passed);
  if (failing.length === 0) {
    lines.push("All cases passed.");
    return lines.join("\n");
  }

  lines.push("Failures:");
  for (const result of failing) {
    const tag = result.knownIssue ? " [known-issue]" : "";
    lines.push(`  - ${result.id}${tag}`);
    for (const failure of result.failures) {
      lines.push(`      ${failure}`);
    }
    if (result.matches.length > 0) {
      lines.push(
        `      actual: ${result.matches
          .slice(0, 5)
          .map((m) => `${normalizePath(m.path)}:${m.line}`)
          .join(", ")}`,
      );
    }
  }
  return lines.join("\n");
}
