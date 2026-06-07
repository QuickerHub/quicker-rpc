import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  isQkrpcBinMissingFailure,
  isQkrpcConnectivityFailure,
  QKRPC_BIN_MISSING_GUIDANCE,
  QKRPC_CONNECTIVITY_FAILURE_GUIDANCE,
} from "@/lib/qkrpc-connectivity";
import { formatQkrpcResultForAgent } from "@/lib/qkrpc";

describe("qkrpc-connectivity", () => {
  it("detects plugin not running from parsed error code", () => {
    assert.equal(
      isQkrpcConnectivityFailure({
        ok: false,
        exitCode: 1,
        stdout: "",
        stderr: "",
        parsed: { ok: false, error: "PLUGIN_NOT_RUNNING", message: "pipe down" },
        truncated: false,
      }),
      true,
    );
  });

  it("detects Chinese plugin message in stderr", () => {
    assert.equal(
      isQkrpcConnectivityFailure({
        ok: false,
        exitCode: 1,
        stdout: "",
        stderr: "QuickerRpc 插件未运行（命名管道不可用）。",
        parsed: null,
        truncated: false,
      }),
      true,
    );
  });

  it("returns connectivity_failure guidance for agent payloads", () => {
    const payload = formatQkrpcResultForAgent({
      ok: false,
      exitCode: 1,
      stdout: "",
      stderr: "fetch failed",
      parsed: null,
      truncated: false,
    });
    const data = payload.data as Record<string, unknown>;
    assert.equal(data.status, "connectivity_failure");
    assert.equal(data.guidance, QKRPC_CONNECTIVITY_FAILURE_GUIDANCE);
  });

  it("detects missing qkrpc binary on PATH", () => {
    assert.equal(
      isQkrpcBinMissingFailure({
        ok: false,
        exitCode: -1,
        stdout: "",
        stderr: "spawn qkrpc.exe ENOENT — 找不到 qkrpc",
        parsed: null,
        truncated: false,
      }),
      true,
    );
  });

  it("returns bin_missing guidance for agent payloads", () => {
    const payload = formatQkrpcResultForAgent({
      ok: false,
      exitCode: -1,
      stdout: "",
      stderr: "spawn qkrpc.exe ENOENT",
      parsed: null,
      truncated: false,
    });
    const data = payload.data as Record<string, unknown>;
    assert.equal(data.status, "bin_missing");
    assert.equal(data.guidance, QKRPC_BIN_MISSING_GUIDANCE);
  });
});
