/**
 * Smoke test: local Cursor SDK agent against quicker-rpc workspace.
 *
 *   npm run hello
 *   npm run hello -- --with-qkrpc
 */
import { Agent } from "@cursor/sdk";
import { defaultModelId, requireApiKey, REPO_ROOT, workspaceRoot } from "./config.js";
import { parseSettingSources } from "./setting-sources.js";
import { createQuickerRpcAgent } from "./create-agent.js";
import { logStreamEvent } from "./stream-log.js";

function parseArgs(argv: string[]): { withQkrpc: boolean; minimal: boolean } {
  return {
    withQkrpc: argv.includes("--with-qkrpc"),
    minimal: argv.includes("--minimal"),
  };
}

async function main(): Promise<void> {
  const { withQkrpc, minimal } = parseArgs(process.argv.slice(2));
  requireApiKey();

  const prompt = withQkrpc
    ? "Call qkrpc_health once. Reply in one sentence: ok or the error message."
    : "In one sentence, what is the quicker-rpc repo primarily for?";

  console.error(
    `cursor-sdk hello: repo=${workspaceRoot()} model=${defaultModelId()} qkrpc=${withQkrpc} minimal=${minimal}`,
  );

  const agent = withQkrpc
    ? await createQuickerRpcAgent({ name: "qkrpc-sdk-smoke" })
    : await Agent.create({
        apiKey: process.env.CURSOR_API_KEY!,
        model: { id: defaultModelId() },
        local: minimal
          ? { cwd: REPO_ROOT }
          : {
              cwd: REPO_ROOT,
              settingSources: parseSettingSources(),
            },
        name: "sdk-smoke",
      });

  try {
    const run = await agent.send(prompt);
    for await (const event of run.stream()) {
      if (event.type === "status") {
        process.stderr.write(
          `[status] ${event.status}${event.message ? `: ${event.message}` : ""}\n`,
        );
      }
      logStreamEvent(event);
    }
    const result = await run.wait();
    console.error(
      `\n---\nstatus=${result.status} requestId=${result.requestId ?? "n/a"}`,
    );
    if (result.result) {
      console.error(`result=${result.result.slice(0, 500)}`);
    }
    if (result.status !== "finished") {
      process.exitCode = 1;
    }
  } finally {
    await agent[Symbol.asyncDispose]();
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exitCode = 1;
});
