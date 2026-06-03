import assert from "node:assert/strict";
import test from "node:test";
import {
  isCliTransportForced,
  mustNotSpawnCli,
} from "./qkrpc-transport.ts";

test("mustNotSpawnCli is true by default", () => {
  const prev = process.env.QKRPC_TRANSPORT;
  delete process.env.QKRPC_TRANSPORT;
  try {
    assert.equal(mustNotSpawnCli(), true);
    assert.equal(isCliTransportForced(), false);
  } finally {
    if (prev === undefined) delete process.env.QKRPC_TRANSPORT;
    else process.env.QKRPC_TRANSPORT = prev;
  }
});

test("QKRPC_TRANSPORT=cli allows subprocess fallback", () => {
  const prev = process.env.QKRPC_TRANSPORT;
  process.env.QKRPC_TRANSPORT = "cli";
  try {
    assert.equal(mustNotSpawnCli(), false);
    assert.equal(isCliTransportForced(), true);
  } finally {
    if (prev === undefined) delete process.env.QKRPC_TRANSPORT;
    else process.env.QKRPC_TRANSPORT = prev;
  }
});
