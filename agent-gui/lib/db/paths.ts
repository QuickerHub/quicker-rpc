import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const moduleDir = dirname(fileURLToPath(import.meta.url));
const agentGuiRoot = join(moduleDir, "..", "..");

/** Resolve Drizzle SQL migrations (dev cwd, standalone app root, or package-relative). */
export function resolveMigrationsFolder(): string {
  const candidates = [
    join(process.cwd(), "drizzle", "migrations"),
    join(agentGuiRoot, "drizzle", "migrations"),
  ];
  for (const path of candidates) {
    if (existsSync(join(path, "meta", "_journal.json"))) {
      return path;
    }
  }
  throw new Error(
    `Chat DB migrations not found. Checked:\n${candidates.map((p) => `  - ${p}`).join("\n")}`,
  );
}
