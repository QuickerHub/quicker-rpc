import assert from "node:assert/strict";
import { test } from "node:test";
import { resolve } from "node:path";
import { parseAgentServiceOptions } from "./cli";

test("service defaults are ephemeral loopback and explicit ports are validated", () => {
  assert.deepEqual(parseAgentServiceOptions([]), { host: "127.0.0.1", port: 0, help: false });
  assert.deepEqual(parseAgentServiceOptions(["--host", "::1", "--port", "12345"]), { host: "::1", port: 12345, help: false });
  for (const args of [["--host", "0.0.0.0"], ["--port", "-1"], ["--port", "2.5"], ["--port", "65536"], ["--port"], ["--unknown"]]) {
    assert.throws(() => parseAgentServiceOptions(args));
  }
});

test("data-dir requires an absolute dedicated profile without altering default options", () => {
  const profile = resolve(".tmp", "service profile");
  assert.equal(parseAgentServiceOptions(["--data-dir", profile]).dataDir, profile);
  for (const args of [["--data-dir"], ["--data-dir", "relative/profile"], ["--data-dir", " "]]) {
    assert.throws(() => parseAgentServiceOptions(args), /absolute|Missing value/);
  }
  if (process.platform === "win32") assert.throws(() => parseAgentServiceOptions(["--data-dir", "\\profile"]), /absolute/);
});
