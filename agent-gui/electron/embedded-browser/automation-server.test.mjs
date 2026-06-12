import assert from "node:assert/strict";
import { createServer } from "node:http";
import { test } from "node:test";
import {
  isEmbeddedBrowserPortFree,
  resolveEmbeddedBrowserListenPort,
} from "./automation-server.mjs";

/** @returns {Promise<number>} */
async function pickEphemeralPort(host = "127.0.0.1") {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, host, resolve);
  });
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  await new Promise((resolve) => server.close(() => resolve(undefined)));
  assert.ok(port > 0);
  return port;
}

test("resolveEmbeddedBrowserListenPort uses preferred port when free", async () => {
  const host = "127.0.0.1";
  const preferred = await pickEphemeralPort(host);
  const port = await resolveEmbeddedBrowserListenPort(host, preferred);
  assert.equal(port, preferred);
});

test("resolveEmbeddedBrowserListenPort skips a busy preferred port", async () => {
  const host = "127.0.0.1";
  const preferred = await pickEphemeralPort(host);
  const blocker = createServer((_req, res) => {
    res.statusCode = 200;
    res.end("busy");
  });
  await new Promise((resolve, reject) => {
    blocker.once("error", reject);
    blocker.listen(preferred, host, resolve);
  });

  try {
    const port = await resolveEmbeddedBrowserListenPort(host, preferred);
    assert.ok(port > preferred);
    assert.equal(await isEmbeddedBrowserPortFree(host, port), true);
  } finally {
    await new Promise((resolve) => blocker.close(() => resolve(undefined)));
  }
});
