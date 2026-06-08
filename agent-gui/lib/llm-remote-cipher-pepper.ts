import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { resolveAgentGuiRoot } from "@/lib/agent-gui-root";

const PEPPER_FILE = "llm-remote-cipher-pepper.json";

let cache: string | undefined;

/** Pepper for Bitiful OSS publish config; never commit — use GitHub publish env + publish/.env. */
export function resolveRemotePublishCipherPepper(): string {
  if (cache) return cache;

  const fromEnv = process.env.LLM_REMOTE_PUBLISH_CIPHER_PEPPER?.trim();
  if (fromEnv) {
    cache = fromEnv;
    return fromEnv;
  }

  const path = join(resolveAgentGuiRoot(), PEPPER_FILE);
  if (existsSync(path)) {
    try {
      const raw = JSON.parse(readFileSync(path, "utf8")) as unknown;
      if (typeof raw === "object" && raw !== null) {
        const pepper = (raw as { pepper?: unknown }).pepper;
        if (typeof pepper === "string" && pepper.trim()) {
          cache = pepper.trim();
          return cache;
        }
      }
    } catch {
      // fall through
    }
  }

  throw new Error(
    "LLM_REMOTE_PUBLISH_CIPHER_PEPPER is not configured (env or llm-remote-cipher-pepper.json).",
  );
}

export function invalidateRemotePublishCipherPepperCache(): void {
  cache = undefined;
}
