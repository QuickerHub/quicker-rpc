import type { SDKMessage } from "@cursor/sdk";

export function logStreamEvent(event: SDKMessage): void {
  switch (event.type) {
    case "assistant":
      for (const block of event.message.content) {
        if (block.type === "text" && block.text.trim()) {
          process.stdout.write(block.text);
        }
      }
      break;
    case "thinking":
      process.stderr.write(`[thinking] ${event.text.slice(0, 120)}…\n`);
      break;
    case "tool_call":
      process.stderr.write(`[tool] ${event.name} ${event.status}\n`);
      break;
    case "status":
      process.stderr.write(`[status] ${event.status}\n`);
      break;
    default:
      break;
  }
}
