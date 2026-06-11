import { resolveAgentGuiRoot } from "@/lib/agent-gui-root";
import { resolveEffectiveWorkingDirectory } from "@/lib/default-working-directory";
import { getRequestCwd } from "@/lib/qkrpc-request-context";
import { resolveQuickerRpcRepoRoot } from "@/lib/repo-root";

const { applyQkrpcToolchainEnv } = require("./qkrpc-toolchain-env.mjs") as {
  applyQkrpcToolchainEnv: (
    env: NodeJS.ProcessEnv,
    options?: { agentGuiRoot?: string; cwd?: string; repoRoot?: string },
  ) => NodeJS.ProcessEnv;
};

/** Child-process env for shell_exec: prepend qkrpc + rg dirs to PATH + QKRPC_* / RG_BIN defaults. */
export function buildShellProcessEnv(
  extra?: Record<string, string>,
): NodeJS.ProcessEnv {
  const agentGuiRoot = resolveAgentGuiRoot();
  const cwd = resolveEffectiveWorkingDirectory(getRequestCwd());
  const repoRoot = resolveQuickerRpcRepoRoot();
  return applyQkrpcToolchainEnv(
    { ...process.env, ...extra },
    {
      agentGuiRoot,
      cwd,
      repoRoot: repoRoot ?? undefined,
    },
  );
}
