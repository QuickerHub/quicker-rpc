import assert from "node:assert/strict";
import { test } from "node:test";
import { build } from "esbuild";
import { runInNewContext } from "node:vm";
import { fileURLToPath } from "node:url";
import { readHostBinding, sameHostBinding, type QkrpcHostBinding } from "./qkrpc-host-binding-contract";
import {
  ACTION_PROJECT_BINDING_PATH,
  ActionProjectBindingError,
  fingerprintActionProjectBinding,
  parseActionProjectBinding,
  sameActionProjectBinding,
} from "./action-project-binding";

const id = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const binding: QkrpcHostBinding = {
  hostInstanceId: "contract-fixture", hostSessionId: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  endpoint: "QuickerRpc_User_AAAAAAAAAAAAAAAAAAAAAAAA_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  protocolVersion: 1, schemaVersion: 1, hostKind: "v1", quickerVersion: "fixture",
  capabilities: { "action.source.write": true, "action.source.read": true },
};
const sidecar = { schemaVersion: 1, kind: "action", actionId: id, hostBinding: binding } as const;

test("host contract retains parser acceptance, immutable copies and transport equality", async () => {
  const input = { ...binding, capabilities: { ...binding.capabilities }, future: { enabled: true } };
  const parsed = readHostBinding(input)!;
  assert.deepEqual(parsed, input);
  assert.notEqual(parsed, input);
  assert.notEqual(parsed.capabilities, input.capabilities);
  assert.equal(Object.isFrozen(parsed), true);
  assert.equal(Object.isFrozen(parsed.capabilities), true);
  input.capabilities["action.source.read"] = false;
  assert.equal(parsed.capabilities["action.source.read"], true);
  // Existing transport equality deliberately ignores negotiated versions/capabilities.
  assert.equal(sameHostBinding(binding, { ...binding, quickerVersion: "changed", capabilities: {} }), true);
  for (const field of ["hostInstanceId", "hostSessionId", "endpoint"] as const) {
    assert.equal(sameHostBinding(binding, { ...binding, [field]: "other" }), false);
  }
  // Do not silently tighten fields that the existing parser did not validate.
  const { quickerVersion: _version, ...withoutVersion } = binding;
  assert.ok(readHostBinding(withoutVersion));
  assert.ok(readHostBinding({ ...binding, capabilities: {} }));
  for (const invalid of [null, [], {}, { ...binding, hostInstanceId: "" },
    { ...binding, hostSessionId: "invalid" }, { ...binding, endpoint: binding.endpoint.replace(/a$/, "b") },
    { ...binding, protocolVersion: 2 }, { ...binding, schemaVersion: 2 },
    { ...binding, hostKind: "unknown" }, { ...binding, capabilities: [] },
    { ...binding, capabilities: { read: "true" } }]) {
    assert.equal(readHostBinding(invalid), undefined);
  }
  const server = await import("./qkrpc-host-binding");
  assert.equal(server.readHostBinding, readHostBinding);
  assert.equal(server.sameHostBinding, sameHostBinding);
});

test("project parser retains the sidecar schema and structured failure contract", () => {
  assert.equal(ACTION_PROJECT_BINDING_PATH, ".qkrpc/project-binding.json");
  assert.deepEqual(parseActionProjectBinding({ ...sidecar, future: "ignored" }, id.toUpperCase()), sidecar);
  for (const invalid of [null, [], {}, { ...sidecar, schemaVersion: 2 }, { ...sidecar, kind: "subprogram" },
    { ...sidecar, actionId: "invalid" }, { ...sidecar, hostBinding: { ...binding, capabilities: [] } }]) {
    assert.throws(() => parseActionProjectBinding(invalid, id), (error: unknown) => {
      assert.ok(error instanceof ActionProjectBindingError);
      assert.equal(error.code, "HOST_HANDSHAKE_INVALID");
      assert.equal(error.message, "HOST_HANDSHAKE_INVALID: Project binding is invalid.");
      return true;
    });
  }
  assert.throws(() => parseActionProjectBinding(sidecar, "bbbbbbbb-bbbb-cccc-dddd-eeeeeeeeeeee"),
    (error: unknown) => error instanceof ActionProjectBindingError && error.code === "HOST_BINDING_MISMATCH"
      && error.message === "HOST_BINDING_MISMATCH: Project binding belongs to another action.");
  const failure = new ActionProjectBindingError("PROJECT_BINDING_WRITE_FAILED", "Local files were written.", { localProject: true, binding: false });
  assert.deepEqual(failure.persistedParts, { localProject: true, binding: false });
  assert.equal(failure.message, "PROJECT_BINDING_WRITE_FAILED: Local files were written.");
});

test("project fingerprints compare complete bindings with stable property order", () => {
  const a = parseActionProjectBinding(sidecar, id);
  const reordered = parseActionProjectBinding({ hostBinding: { capabilities: { "action.source.read": true, "action.source.write": true },
    quickerVersion: binding.quickerVersion, hostKind: binding.hostKind, schemaVersion: 1, protocolVersion: 1,
    endpoint: binding.endpoint, hostSessionId: binding.hostSessionId, hostInstanceId: binding.hostInstanceId },
  actionId: id.toUpperCase(), kind: "action", schemaVersion: 1 }, id);
  assert.equal(sameActionProjectBinding(a, reordered), true);
  assert.equal(fingerprintActionProjectBinding(a), fingerprintActionProjectBinding(structuredClone(reordered)));
  for (const changed of [
    { ...a, actionId: "bbbbbbbb-bbbb-cccc-dddd-eeeeeeeeeeee" },
    ...["hostInstanceId", "hostSessionId", "endpoint", "quickerVersion"].map((field) => ({ ...a, hostBinding: { ...a.hostBinding, [field]: "changed" } })),
    { ...a, hostBinding: { ...a.hostBinding, hostKind: "v2" as const } },
    { ...a, hostBinding: { ...a.hostBinding, protocolVersion: 2 } },
    { ...a, hostBinding: { ...a.hostBinding, schemaVersion: 2 } },
    { ...a, hostBinding: { ...a.hostBinding, capabilities: { ...a.hostBinding.capabilities, "action.source.read": false } } },
  ]) assert.equal(sameActionProjectBinding(a, changed), false);
  const withFuture = parseActionProjectBinding({ ...sidecar, hostBinding: { ...binding, future: { revision: 1 } } }, id);
  assert.equal(sameActionProjectBinding(a, withFuture), false, "Retained host extensions belong to the full document identity");
});

test("browser bundle has only the two pure contracts and executes without Node globals", async () => {
  const result = await build({
    stdin: { contents: 'export * from "./qkrpc-host-binding-contract"; export * from "./action-project-binding";',
      resolveDir: fileURLToPath(new URL(".", import.meta.url)), sourcefile: "contract-browser-entry.ts" },
    bundle: true, platform: "browser", format: "iife", globalName: "bindingContract", write: false, metafile: true,
  });
  const inputs = Object.keys(result.metafile!.inputs).filter((path) => !/(?:^|\/)contract-browser-entry\.ts$/.test(path));
  assert.equal(inputs.length, 2, JSON.stringify(inputs));
  assert.ok(inputs.every((path) => /(?:qkrpc-host-binding-contract|action-project-binding)\.ts$/.test(path)));
  const output = result.outputFiles[0]!.text;
  assert.doesNotMatch(output, /node:|async_hooks|server-only|qkrpc-request-context|\brequire\(/);
  const context: { bindingContract?: typeof import("./action-project-binding") & typeof import("./qkrpc-host-binding-contract") } = {};
  runInNewContext(output, context, { timeout: 1000 });
  const api = context.bindingContract!;
  const parsed = api.parseActionProjectBinding(sidecar, id);
  assert.equal(api.fingerprintActionProjectBinding(parsed), fingerprintActionProjectBinding(parseActionProjectBinding(sidecar, id)));
  assert.equal(api.sameHostBinding(parsed.hostBinding, binding), true);
});
