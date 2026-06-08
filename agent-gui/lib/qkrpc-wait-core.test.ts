import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildWaitCliArgs } from "@/lib/qkrpc-wait-core";

describe("qkrpc-wait-core", () => {
  it("buildWaitCliArgs uses defaults", () => {
    assert.deepEqual(buildWaitCliArgs({}), [
      "wait",
      "--timeout",
      "120",
      "--interval",
      "2",
      "--json",
    ]);
  });

  it("buildWaitCliArgs respects noBootstrap", () => {
    assert.deepEqual(
      buildWaitCliArgs({ timeoutSeconds: 60, intervalSeconds: 5, noBootstrap: true }),
      ["wait", "--timeout", "60", "--interval", "5", "--json", "--no-bootstrap"],
    );
  });
});
