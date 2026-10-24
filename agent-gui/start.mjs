import { runAgentStart } from "./scripts/start-agent-production.mjs";

runAgentStart().catch((error) => { console.error(error); process.exitCode = 1; });
