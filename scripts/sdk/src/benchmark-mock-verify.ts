import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { QKRPC_EXE, REPO_ROOT } from "./config.js";

export type MockVerifyResult = {
  ok: boolean;
  exitCode: number;
  stdout: string;
  stderr: string;
  profileId: string;
  actionId?: string;
};

export function runMockVerify(options: {
  actionId: string;
  mockProfile: string;
  param?: string;
}): MockVerifyResult {
  const args = [
    "action",
    "run",
    "--id",
    options.actionId,
    "--mock",
    "--mock-profile",
    options.mockProfile,
    "--assert",
    "--json",
  ];
  if (options.param) {
    args.push("--param", options.param);
  }

  const result = spawnSync(QKRPC_EXE, args, {
    cwd: REPO_ROOT,
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
  });

  return {
    ok: result.status === 0,
    exitCode: result.status ?? 1,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    profileId: options.mockProfile,
    actionId: options.actionId,
  };
}

export function parseMockRunJson(stdout: string): {
  ok?: boolean;
  assertions?: { passed?: boolean };
} | null {
  try {
    return JSON.parse(stdout.trim()) as {
      ok?: boolean;
      assertions?: { passed?: boolean };
    };
  } catch {
    return null;
  }
}

export function extractActionIdFromBenchmarkResult(text: string): string | null {
  const guid =
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
  const matches = text.match(guid);
  return matches?.at(-1) ?? null;
}

export function mockProfilePath(profileId: string): string {
  return join(
    REPO_ROOT,
    "agent-gui",
    "benchmarks",
    "mock-profiles",
    `${profileId}.json`,
  );
}
