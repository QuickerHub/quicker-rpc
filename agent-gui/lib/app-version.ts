import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { formatDisplayVersion } from "@/lib/app-version-format";
import { isBundledAgentRuntime } from "@/lib/default-working-directory";
import { resolveAgentGuiRoot } from "@/lib/agent-gui-root";
import { resolveQuickerRpcRepoRoot } from "@/lib/repo-root";
import { runQkrpc } from "@/lib/qkrpc";

export type AppVersionSnapshot = {
  quickerAgent: string;
  qkrpc: string | null;
  runtime: "bundled" | "dev";
};

export { formatDisplayVersion } from "@/lib/app-version-format";

function readQuickerRpcVersionFromJson(dir: string): string | null {
  const path = join(dir, "version.json");
  if (!existsSync(path)) return null;
  try {
    const data = JSON.parse(readFileSync(path, "utf8")) as { QuickerRpc?: string };
    const raw = String(data.QuickerRpc ?? "").trim();
    if (!raw) return null;
    const parts = formatDisplayVersion(raw).split(".");
    if (parts.length >= 3) return parts.slice(0, 3).join(".");
    return formatDisplayVersion(raw);
  } catch {
    return null;
  }
}

function readPackageVersion(): string | null {
  const pkgPath = join(resolveAgentGuiRoot(), "package.json");
  if (!existsSync(pkgPath)) return null;
  try {
    const data = JSON.parse(readFileSync(pkgPath, "utf8")) as { version?: string };
    const raw = String(data.version ?? "").trim();
    return raw ? formatDisplayVersion(raw) : null;
  } catch {
    return null;
  }
}

/** QuickerAgent semver aligned with repo version.json / Tauri bundle. */
export function resolveQuickerAgentVersion(): string {
  const bundled = readQuickerRpcVersionFromJson(process.cwd());
  if (bundled) return bundled;

  const repo = resolveQuickerRpcRepoRoot();
  if (repo) {
    const fromRepo = readQuickerRpcVersionFromJson(repo);
    if (fromRepo) return fromRepo;
  }

  return readPackageVersion() ?? "dev";
}

export async function resolveQkrpcCliVersion(): Promise<string | null> {
  const result = await runQkrpc(["help", "--json"], { timeoutMs: 8_000 });
  if (!result.ok) return null;
  const parsed = result.parsed;
  if (typeof parsed !== "object" || parsed === null) return null;
  const version = (parsed as { version?: unknown }).version;
  if (typeof version !== "string" || !version.trim()) return null;
  return formatDisplayVersion(version);
}

export async function resolveAppVersionSnapshot(): Promise<AppVersionSnapshot> {
  const [qkrpc] = await Promise.all([resolveQkrpcCliVersion()]);
  return {
    quickerAgent: resolveQuickerAgentVersion(),
    qkrpc,
    runtime: isBundledAgentRuntime() ? "bundled" : "dev",
  };
}
