import assert from "node:assert/strict";
import { test } from "node:test";
import { argvToInvoke } from "../../qkrpc-argv";
import { isQkrpcReadOnlyInvoke } from "../../qkrpc-host-binding";

test("catalog list and UI detail CLI argv map to the existing read-only host operations", () => {
  assert.deepEqual(argvToInvoke(["step-runner", "list", "--limit", "500", "--json"]), { op: "step-runner.list", args: { limit: 500 } });
  assert.deepEqual(argvToInvoke(["step-runner", "get-ui", "--key", "sys:fixture", "--control-field", "mode", "--json"]),
    { op: "step-runner.getUi", args: { key: "sys:fixture", controlField: "mode" } });
  for (const op of ["list", "search", "get", "getUi", "getui", "summaries", "quickinsertsearch", "toolboxsearch"])
    assert.equal(isQkrpcReadOnlyInvoke({ op: `step-runner.${op}`, args: {} }), true, op);
  for (const op of ["getOrCreate", "unknown", "delete", "listAndModify"])
    assert.equal(isQkrpcReadOnlyInvoke({ op: `step-runner.${op}`, args: {} }), false, op);
});
