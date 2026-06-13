import { Agent } from "@cursor/sdk";
import { requireApiKey, REPO_ROOT, defaultModelId } from "./config.js";
import { parseSettingSources } from "./setting-sources.js";

async function main(): Promise<void> {
  requireApiKey();
  const sources = parseSettingSources(process.argv[2] ?? "project");
  console.error(`probe-settings: sources=${sources.join(",")}`);

  const agent = await Agent.create({
    apiKey: process.env.CURSOR_API_KEY!,
    model: { id: defaultModelId() },
    local: { cwd: REPO_ROOT, settingSources: sources },
    name: "sdk-settings-probe",
  });

  try {
    const run = await agent.send("Reply with exactly: pong");
    for await (const event of run.stream()) {
      if (event.type === "status") {
        console.error(`[status] ${event.status}${event.message ? ` ${event.message}` : ""}`);
      }
    }
    const result = await run.wait();
    console.log(JSON.stringify(result, null, 2));
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
