import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

test("resolveLlmUsageIdentityFromAccount prefers quicker userId", async () => {
  const { resolveLlmUsageIdentityFromAccount } = await import(
    "@/lib/llm-usage-identity.server"
  );

  const identity = resolveLlmUsageIdentityFromAccount({
    loggedIn: true,
    userId: "qk-user-1",
  });
  assert.equal(identity.kind, "quicker");
  assert.equal(identity.id, "qk-user-1");
  assert.equal(identity.storageKey, "qk-user-1");
});

test("resolveLlmUsageIdentityFromAccount falls back to device fingerprint", async () => {
  const previousRoot = process.env.AGENT_GUI_ROOT;
  const tempRoot = mkdtempSync(join(tmpdir(), "agent-gui-device-"));
  process.env.AGENT_GUI_ROOT = tempRoot;

  try {
    const { resolveLlmUsageIdentityFromAccount } = await import(
      "@/lib/llm-usage-identity.server"
    );

    const first = resolveLlmUsageIdentityFromAccount({ loggedIn: false });
    const second = resolveLlmUsageIdentityFromAccount({ loggedIn: false });

    assert.equal(first.kind, "device");
    assert.equal(second.kind, "device");
    assert.equal(first.id, second.id);
    assert.match(first.storageKey, /^device-/);
    assert.equal(first.storageKey, `device-${first.id}`);
  } finally {
    if (previousRoot === undefined) {
      delete process.env.AGENT_GUI_ROOT;
    } else {
      process.env.AGENT_GUI_ROOT = previousRoot;
    }
    rmSync(tempRoot, { recursive: true, force: true });
  }
});
