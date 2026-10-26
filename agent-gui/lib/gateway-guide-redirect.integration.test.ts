import assert from "node:assert/strict";
import { test } from "node:test";
import { createHash } from "node:crypto";
import { createServer, type Server } from "node:http";
import { readGatewayProgramSourceGuide } from "./gateway-guide.server";

// Uses only two test-owned loopback HTTP servers; run separately from the no-TCP offline gate.
test("an actual HTTP redirect cannot substitute another gateway", { timeout: 5000 }, async () => {
  const servers: Server[] = []; let firstRequests = 0, otherRequests = 0;
  const originalFetch = globalThis.fetch;
  const originalBase = process.env.QKRPC_HTTP_URL, originalMode = process.env.QKRPC_TRANSPORT;
  const listen = async (server: Server) => { servers.push(server); await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve)); return `http://127.0.0.1:${(server.address() as { port: number }).port}`; };
  try {
    const other = await listen(createServer((_req, res) => { otherRequests++; res.end('{}'); }));
    const first = await listen(createServer((_req, res) => { firstRequests++; res.writeHead(307, { Location: `${other}/v1/invoke` }); res.end(); }));
    process.env.QKRPC_HTTP_URL = first; process.env.QKRPC_TRANSPORT = "http";
    globalThis.fetch = async (url, init) => { assert.equal(String(url), `${first}/v1/invoke`); return originalFetch(url, init); };
    const result = await readGatewayProgramSourceGuide();
    assert.equal(result.gatewayKnowledge?.status, "unavailable");
    assert.equal(result.gatewayKnowledge.gateway.identity, `sha256:${createHash("sha256").update(`http:${first}`).digest("hex")}`);
    assert.equal(firstRequests, 1); assert.equal(otherRequests, 0);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalBase === undefined) delete process.env.QKRPC_HTTP_URL; else process.env.QKRPC_HTTP_URL = originalBase;
    if (originalMode === undefined) delete process.env.QKRPC_TRANSPORT; else process.env.QKRPC_TRANSPORT = originalMode;
    await Promise.all(servers.map(server => new Promise<void>((resolve, reject) => { server.closeAllConnections(); server.close(error => error ? reject(error) : resolve()); })));
  }
});
