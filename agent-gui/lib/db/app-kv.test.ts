import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

test("app_kv seeds from legacy json and reads back", async () => {
  const prevAppData = process.env.APPDATA;
  const prevLocal = process.env.LOCALAPPDATA;
  const tempRoot = mkdtempSync(join(tmpdir(), "qa-app-kv-"));
  process.env.APPDATA = join(tempRoot, "appdata");
  process.env.LOCALAPPDATA = join(tempRoot, "install-local");

  const { mkdirSync } = await import("node:fs");
  const appData = join(tempRoot, "appdata", "QuickerAgent");
  mkdirSync(join(appData, "local"), { recursive: true });
  writeFileSync(
    join(appData, "local", "llm-secrets.json"),
    '{"version":2,"providers":{"openai":{"apiKey":"sk-test"}}}\n',
    "utf8",
  );

  const client = await import("@/lib/db/client");
  const kv = await import("@/lib/db/app-kv");
  const persisted = await import("@/lib/quicker-agent-persisted-data");

  persisted.resetPersistedDataMigrationForTests();
  client.resetChatDatabaseClientForTests();
  client.openChatDatabaseAt(join(appData, "agent.db"));

  const secrets = kv.readAppKvJson<{ providers: { openai?: { apiKey?: string } } }>(
    kv.AppKvKey.llmSecrets,
  );
  assert.ok(secrets?.providers?.openai?.apiKey === "sk-test");

  kv.writeAppKvJson(kv.AppKvKey.deviceFingerprint, {
    version: 1,
    deviceId: "device-1",
    createdAt: "2026-01-01T00:00:00.000Z",
  });
  assert.ok(existsSync(join(appData, "agent.db")));
  const dbText = readFileSync(join(appData, "agent.db"));
  assert.ok(dbText.length > 0);

  client.resetChatDatabaseClientForTests();
  persisted.resetPersistedDataMigrationForTests();
  if (prevAppData === undefined) delete process.env.APPDATA;
  else process.env.APPDATA = prevAppData;
  if (prevLocal === undefined) delete process.env.LOCALAPPDATA;
  else process.env.LOCALAPPDATA = prevLocal;
  rmSync(tempRoot, { recursive: true, force: true });
});
