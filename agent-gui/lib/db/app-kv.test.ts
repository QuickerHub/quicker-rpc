import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

test("app_kv seeds from legacy json and reads back", async () => {
  const tempRoot = mkdtempSync(join(tmpdir(), "qa-app-kv-"));
  const client = await import("@/lib/db/client");
  const kv = await import("@/lib/db/app-kv");
  try {
    const legacyDirectory = join(tempRoot, "legacy");
    mkdirSync(legacyDirectory);
    writeFileSync(
      join(legacyDirectory, "llm-secrets.json"),
      '{"version":2,"providers":{"openai":{"apiKey":"sk-test"}}}\n',
      "utf8",
    );
    const dbPath = join(tempRoot, "agent.db");
    client.openChatDatabaseAt(dbPath, { legacyImport: { directory: legacyDirectory } });

    const secrets = kv.readAppKvJson<{ providers: { openai?: { apiKey?: string } } }>(
      kv.AppKvKey.llmSecrets,
    );
    assert.ok(secrets?.providers?.openai?.apiKey === "sk-test");

    kv.writeAppKvJson(kv.AppKvKey.deviceFingerprint, {
      version: 1,
      deviceId: "device-1",
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    assert.ok(existsSync(dbPath));
    assert.ok(readFileSync(dbPath).length > 0);
  } finally {
    client.resetChatDatabaseClientForTests();
    rmSync(tempRoot, { recursive: true, force: true });
  }
});
