import { Agent } from "@cursor/sdk";
import { requireApiKey, REPO_ROOT, defaultModelId } from "./config.js";

async function main(): Promise<void> {
  requireApiKey();
  const result = await Agent.prompt(
    "Reply with exactly: pong",
    {
      apiKey: process.env.CURSOR_API_KEY!,
      model: { id: defaultModelId() },
      local: { cwd: REPO_ROOT },
      name: "sdk-minimal-probe",
    },
  );
  console.log(JSON.stringify(result, null, 2));
  if (result.status !== "finished") {
    process.exitCode = 1;
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exitCode = 1;
});
