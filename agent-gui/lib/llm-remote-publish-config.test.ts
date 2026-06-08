import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { wrapRemotePublishConfigForUpload } from "@/lib/llm-remote-publish-payload";

const TEST_PEPPER = "test-remote-publish-pepper-v1";
process.env.LLM_REMOTE_PUBLISH_CIPHER_PEPPER = TEST_PEPPER;

function startJsonServer(
  body: unknown,
  headers: Record<string, string> = {},
): Promise<{ server: Server; port: number }> {
  return new Promise((resolve, reject) => {
    const server = createServer((_req, res) => {
      for (const [key, value] of Object.entries(headers)) {
        res.setHeader(key, value);
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(body));
    });
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("Failed to bind test server"));
        return;
      }
      resolve({ server, port: address.port });
    });
  });
}

test("refreshRemotePublishConfig decrypts encrypted OSS payload", async () => {
  const tempRoot = mkdtempSync(join(tmpdir(), "llm-remote-publish-"));
  const priorHome = process.env.LOCALAPPDATA;
  const priorUrl = process.env.BUNDLED_LLM_REMOTE_CONFIG_URL;
  process.env.LOCALAPPDATA = tempRoot;

  const config = {
    version: 2,
    endpoints: [{ apiKey: "sk-encrypted", baseURL: "https://enc/v1", model: "gpt-5.5" }],
  };
  const wrapped = wrapRemotePublishConfigForUpload(config);

  const { server, port } = await startJsonServer(wrapped);
  process.env.BUNDLED_LLM_REMOTE_CONFIG_URL = `http://127.0.0.1:${port}/llm-publish.config.json`;

  try {
    const mod = await import("@/lib/llm-remote-publish-config");
    mod.invalidateRemotePublishConfigCache();
    const result = await mod.refreshRemotePublishConfig({ force: true });
    assert.equal(result.ok, true);
    if (!result.ok) return;

    const groups = mod.loadRemotePublishGroupsConfig();
    const endpoints = Array.from(groups.endpointsByGroup.values()).flat();
    assert.equal(endpoints[0]?.apiKey, "sk-encrypted");
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
    if (priorHome === undefined) delete process.env.LOCALAPPDATA;
    else process.env.LOCALAPPDATA = priorHome;
    if (priorUrl === undefined) delete process.env.BUNDLED_LLM_REMOTE_CONFIG_URL;
    else process.env.BUNDLED_LLM_REMOTE_CONFIG_URL = priorUrl;
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("refreshRemotePublishConfig writes cache and loadRemotePublishGroupsConfig reads it", async () => {
  const tempRoot = mkdtempSync(join(tmpdir(), "llm-remote-publish-"));
  const priorHome = process.env.LOCALAPPDATA;
  const priorUrl = process.env.BUNDLED_LLM_REMOTE_CONFIG_URL;
  process.env.LOCALAPPDATA = tempRoot;

  const config = {
    version: 2,
    groups: {
      gpt55: { label: "OpenAI", model: "gpt-5.5" },
    },
    endpoints: [
      {
        group: "gpt55",
        apiKey: "sk-remote-test",
        baseURL: "https://example.com/v1",
        model: "gpt-5.5",
      },
    ],
  };

  const { server, port } = await startJsonServer(config, { ETag: '"remote-v1"' });
  process.env.BUNDLED_LLM_REMOTE_CONFIG_URL = `http://127.0.0.1:${port}/llm-publish.config.json`;

  try {
    const mod = await import("@/lib/llm-remote-publish-config");
    mod.invalidateRemotePublishConfigCache();
    const result = await mod.refreshRemotePublishConfig({ force: true });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.changed, true);
    assert.equal(result.meta.endpointCount, 1);

    const groups = mod.loadRemotePublishGroupsConfig();
    const endpoints = Array.from(groups.endpointsByGroup.values()).flat();
    assert.equal(endpoints[0]?.apiKey, "sk-remote-test");

    const status = mod.getRemotePublishConfigStatus();
    assert.equal(status?.cached, true);
    assert.equal(status?.endpointCount, 1);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
    if (priorHome === undefined) {
      delete process.env.LOCALAPPDATA;
    } else {
      process.env.LOCALAPPDATA = priorHome;
    }
    if (priorUrl === undefined) {
      delete process.env.BUNDLED_LLM_REMOTE_CONFIG_URL;
    } else {
      process.env.BUNDLED_LLM_REMOTE_CONFIG_URL = priorUrl;
    }
    rmSync(tempRoot, { recursive: true, force: true });
  }
});
