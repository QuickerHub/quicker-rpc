import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { normalizeEditVersion } from "@/lib/action-project-info-from-get";
import { resolveWorkspacePath } from "@/lib/workspace-fs";

export type ActionProjectSyncTrust = {
  editVersion: number;
  updatedUtc: string;
};

const TRUST_REL = ".qkrpc/sync-trust.json";

export async function readActionProjectSyncTrust(
  projectDirectory: string,
): Promise<ActionProjectSyncTrust | undefined> {
  const resolved = resolveWorkspacePath(join(projectDirectory, TRUST_REL));
  if (!resolved.ok || !existsSync(resolved.absolute)) return undefined;

  try {
    const raw = await readFile(resolved.absolute, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== "object" || parsed === null) return undefined;
    const record = parsed as Record<string, unknown>;
    const editVersion = normalizeEditVersion(
      typeof record.editVersion === "number" ? record.editVersion : undefined,
    );
    const updatedUtc =
      typeof record.updatedUtc === "string" ? record.updatedUtc.trim() : "";
    if (editVersion == null || !updatedUtc) return undefined;
    return { editVersion, updatedUtc };
  } catch {
    return undefined;
  }
}

export async function writeActionProjectSyncTrust(
  projectDirectory: string,
  editVersion: number,
): Promise<void> {
  const normalized = normalizeEditVersion(editVersion);
  if (normalized == null) return;

  const trustPath = join(projectDirectory, TRUST_REL);
  const resolved = resolveWorkspacePath(trustPath);
  if (!resolved.ok) return;

  const dirResolved = resolveWorkspacePath(join(projectDirectory, ".qkrpc"));
  if (!dirResolved.ok) return;

  const payload: ActionProjectSyncTrust = {
    editVersion: normalized,
    updatedUtc: new Date().toISOString(),
  };

  try {
    await mkdir(dirResolved.absolute, { recursive: true });
    await writeFile(
      resolved.absolute,
      `${JSON.stringify(payload, null, 2)}\n`,
      "utf8",
    );
  } catch {
    /* best-effort */
  }
}
