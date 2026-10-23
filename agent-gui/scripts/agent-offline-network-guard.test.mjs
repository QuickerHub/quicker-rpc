import assert from "node:assert/strict";
import test from "node:test";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import tls from "node:tls";
import dgram from "node:dgram";
import "./agent-offline-network-guard.mjs";

test("offline tripwire rejects model/host requests through fetch, HTTP and raw sockets", async () => {
  await assert.rejects(fetch("https://offline-fixture.invalid"), /real network request/);
  for (const request of [
    () => http.request("http://offline-fixture.invalid"),
    () => https.get("https://offline-fixture.invalid"),
    () => net.connect({ host: "127.0.0.1", port: 9477 }),
    () => net.connect({ path: "\\\\network-fixture.invalid\\pipe\\fixture" }),
    () => tls.connect({ host: "offline-fixture.invalid", port: 443 }),
  ]) assert.throws(request, /real network request/);
  const socket = dgram.createSocket("udp4");
  try { assert.throws(() => socket.send("fixture", 9477, "127.0.0.1"), /real network request/); }
  finally { socket.close(); }
});
