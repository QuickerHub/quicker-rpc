import assert from "node:assert/strict";
import { test } from "node:test";

import { qkrpcRequestContext } from "@/lib/qkrpc-request-context";
import {
  clearQkrpcConnectivityGateForTests,
  isQkrpcConnectivityBlockedThisTurn,
  markQkrpcConnectivityBlockedThisTurn,
  clearQkrpcConnectivityBlockedThisTurn,
} from "@/lib/qkrpc-connectivity-gate";
import { isQkrpcConnectivityFailure } from "@/lib/qkrpc-connectivity";

test("isQkrpcConnectivityFailure matches Chinese serve unreachable message", () => {
  assert.equal(
    isQkrpcConnectivityFailure({
      ok: false,
      exitCode: 1,
      stdout: "",
      stderr: "无法连接 qkrpc serve（http://127.0.0.1:9477）。",
      parsed: null,
      truncated: false,
    }),
    true,
  );
});

test("connectivity gate blocks until qkrpc_wait clears it", () => {
  clearQkrpcConnectivityGateForTests();
  qkrpcRequestContext.run({ threadId: "t-conn-gate" }, () => {
    assert.equal(isQkrpcConnectivityBlockedThisTurn(), false);
    markQkrpcConnectivityBlockedThisTurn();
    assert.equal(isQkrpcConnectivityBlockedThisTurn(), true);
    clearQkrpcConnectivityBlockedThisTurn();
    assert.equal(isQkrpcConnectivityBlockedThisTurn(), false);
  });
});
