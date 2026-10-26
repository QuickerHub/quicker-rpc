import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { test } from "node:test";
import { createQkrpcSchemaReadRunner } from "./qkrpc-schema-read.server";
import { bindQkrpcTarget, readHostBinding } from "./qkrpc-host-binding";
import { runWithAgentRequestContextAsync } from "./qkrpc-request-context";
import { STEP_RUNNER_SCHEMA_READ_FORMAT } from "./step-runner-schema-read";

// Only fixture-owned loopback listeners; separate from the offline no-TCP group.
const session = "a".repeat(32);
const binding = readHostBinding({ hostInstanceId: "schema-reader-owner", hostSessionId: session,
  endpoint: `QuickerRpc_User_${"A".repeat(24)}_${session}`, protocolVersion: 1, schemaVersion: 1,
  hostKind: "v1", quickerVersion: "fixture", capabilities: {} })!;
const read = { pointer: "", mode: "value", offset: 0 };
const args = ["step-runner", "get", "--key", "sys:fixture", "--control-field-json", JSON.stringify(" "),
  "--schema-read", JSON.stringify(read)];
const listen = async (server: Server) => {
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert.ok(address && typeof address !== "string");
  return `http://127.0.0.1:${address.port}`;
};
const close = (server: Server) => new Promise<void>((resolve, reject) => {
  server.closeAllConnections(); server.close(error => error ? reject(error) : resolve());
});
async function owned(gateway: string) {
  return runWithAgentRequestContextAsync({}, async () => {
    bindQkrpcTarget({ gateway, binding });
    return createQkrpcSchemaReadRunner({ cli: async () => { assert.fail("no CLI"); },
      binary: () => { assert.fail("no binary staging"); } })(args);
  });
}

test("actual HTTP sends one bound read and retains numeric JSON fragment text", async () => {
  const requests: Record<string, unknown>[] = [];
  const content = '{"large":9007199254740993,"decimal":0.1000000000000000001,"negativeZero":-0}';
  const observation = `sha256:${"a".repeat(64)}`;
  const page = { format: STEP_RUNNER_SCHEMA_READ_FORMAT, status: "available", observation,
    ...read, offsetUnit: "utf16", total: content.length, nextOffset: null, content,
    selectedComplete: true, agentSchemaComplete: true,
    input: { key: "sys:fixture", controlField: " ", read: { ...read, expectedObservation: observation } },
  };
  const server = createServer((request, response) => {
    let body = "";
    request.on("data", chunk => { body += chunk; });
    request.on("end", () => {
      assert.equal(request.url, "/v1/invoke"); requests.push(JSON.parse(body));
      response.setHeader("Content-Type", "application/json");
      response.end(JSON.stringify({ ok: true, data: { ok: true, action: "step-runner-get",
        payload: { success: true, schemaRead: page } } }));
    });
  });
  const base = await listen(server);
  try {
    const result = await owned(base);
    assert.equal(result.ok, true);
    assert.equal(requests.length, 1);
    assert.equal(requests[0].op, "step-runner.get");
    assert.deepEqual(requests[0].hostBinding, binding);
    assert.deepEqual((requests[0].args as Record<string, unknown>).read, read);
    assert.equal((result.parsed as { payload: { schemaRead: { content: string } } }).payload.schemaRead.content, content);
  } finally { await close(server); }
});

test("an actual HTTP redirect cannot move a schema read to a different gateway", async () => {
  let otherRequests = 0;
  let firstRequests = 0;
  const other = createServer((_request, response) => { otherRequests++; response.end("{}"); });
  const otherBase = await listen(other);
  const first = createServer((_request, response) => { firstRequests++; response.writeHead(307, { Location: `${otherBase}/v1/invoke` }); response.end(); });
  const firstBase = await listen(first);
  try {
    assert.equal((await owned(firstBase)).ok, false);
    assert.equal(firstRequests, 1);
    assert.equal(otherRequests, 0);
  } finally { await Promise.all([close(first), close(other)]); }
});
