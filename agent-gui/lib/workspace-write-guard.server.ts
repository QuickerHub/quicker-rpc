import { lstat, realpath } from "node:fs/promises";
import { parse, relative } from "node:path";
import { resolveWorkspacePathChain } from "@/lib/workspace-path-chain";
import { isActionSourceManagedPath } from "@/lib/qkrpc-action-source";
import { resolveWorkspacePath, resolveWorkspaceRoot } from "@/lib/workspace-fs";
import { getRequestAbortSignal } from "@/lib/qkrpc-request-context";

/** Writes may not address protected files through junctions, symlinks, hardlinks or NTFS streams. */
export async function validateWorkspaceWritePath(path: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const lexical = resolveWorkspacePath(path);
  if (!lexical.ok) return lexical;
  if (lexical.absolute.slice(parse(lexical.absolute).root.length).includes(":")) {
    return { ok: false, error: "Write/StrReplace do not support NTFS alternate data stream paths." };
  }
  const checked = await resolveWorkspacePathChain(resolveWorkspaceRoot(), lexical, { lstat, realpath }, getRequestAbortSignal());
  if (!checked.ok) return checked;
  const canonical = relative(checked.root, checked.absolute).replace(/\\/g, "/");
  if (/(?:^|\/)\.qkrpc\/project-binding\.json$/i.test(canonical)) {
    return { ok: false, error: "project-binding.json is tool-managed; reopen the action explicitly instead of changing host provenance." };
  }
  if (isActionSourceManagedPath(canonical)) {
    return { ok: false, error: "quicker.source.json and .qkrpc/baseline.json are tool-managed; edit program.source.yaml/files/ and use qkrpc_action_save." };
  }
  if (/^\.quicker\/(?:actions|subprograms)(?:\/|$)/i.test(canonical)) {
    return { ok: false, error: "Legacy .quicker program bodies require workspace_program, not Write/StrReplace." };
  }
  if (checked.metadata && !checked.metadata.isDirectory() && (checked.metadata.nlink ?? 1) > 1) {
    return { ok: false, error: "文件有多个硬链接，此工具不能安全写入，请选择独立文件。" };
  }
  return { ok: true };
}
