import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeActionProjectSyncVersion, stampActionProjectInfoVersion, syncActionProjectBodyAndMetadata } from "./action-project-sync-metadata";
import type { QkrpcRunResult } from "./qkrpc-types";

const actionId = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const infoContent = '{"ID":"native","EditVersion":10,"Title":"Local","Description":"raw ","Icon":"fa:old","Future":{"number":9007199254740993}}';
const response = (data: Record<string, unknown>, ok = true): QkrpcRunResult => ({ ok, exitCode: ok ? 0 : 1, stdout: "", stderr: "", truncated: false, parsed: { ok, payload: data } });
const metadata = (fields: Record<string, unknown> = {}) => response({ success: true, editVersion: 10, compressed: { title: "Local", description: "raw ", icon: "fa:old", ...fields } });
const body = (fields: Record<string, unknown> = {}) => response({ success: true, editVersion: 11, ...fields });
function fixture(results: Array<QkrpcRunResult | Error>, stampError?: Error) {
  const calls: string[][] = [];
  const stamps: string[] = [];
  return { calls, stamps, ports: {
    run: async (args: string[]) => { calls.push([...args]); const next = results.shift(); if (!next) throw new Error("Unexpected host call"); if (next instanceof Error) throw next; return next; },
    stampVersion: async (version: string) => { stamps.push(version); if (stampError) throw stampError; },
  } };
}
const options = { actionId, infoContent, applyArgs: ["action", "apply", "--dir", "fixture", "--force"] };

test("explicit Sync with unchanged appearance writes only body and absorbs its version", async () => {
  const fake = fixture([metadata(), body()]);
  const result = await syncActionProjectBodyAndMetadata(options, fake.ports);
  assert.equal(result.ok, true);
  assert.deepEqual(fake.calls, [["action", "get", "--id", actionId, "--return-mode", "metadata", "--json"], options.applyArgs]);
  assert.deepEqual(fake.stamps, ["11"]);
  if (result.ok) assert.equal(result.editVersion, "11");
});

test("changed presentation uses only changed fields and the body response version, never force or old local version", async () => {
  const fake = fixture([metadata({ title: "Remote", icon: "fa:new" }), body(), response({ success: true, editVersion: 12 })]);
  const result = await syncActionProjectBodyAndMetadata(options, fake.ports);
  assert.equal(result.ok, true);
  assert.deepEqual(fake.calls[2], ["action", "set-metadata", "--id", actionId, "--expected-edit-version", "11", "--json", "--title", "Local", "--icon", "fa:old"]);
  assert.equal(fake.calls[2]!.includes("--force"), false);
  assert.equal(fake.calls[2]!.includes("--description"), false);
  assert.deepEqual(fake.stamps, ["12"]);
  if (result.ok) assert.equal(result.editVersion, "12");
});

test("empty title and failed or malformed metadata read never reach body apply", async () => {
  const empty = fixture([]);
  const invalid = await syncActionProjectBodyAndMetadata({ ...options, infoContent: infoContent.replace('"Local"', '" "') }, empty.ports);
  assert.equal(invalid.ok, false);
  assert.deepEqual(empty.calls, []);
  for (const read of [response({ success: false, errorMessage: "unavailable" }, false), response({ success: true, compressed: {} }), new Error("read rejected")]) {
    const fake = fixture([read]);
    const result = await syncActionProjectBodyAndMetadata(options, fake.ports);
    assert.equal(result.ok, false);
    if (!result.ok) { assert.equal(result.phase, "metadata-read"); assert.deepEqual(result.persistedParts, {}); }
    assert.equal(fake.calls.length, 1);
    assert.deepEqual(fake.stamps, []);
  }
});

test("body failure never submits presentation or advances local version", async () => {
  const fake = fixture([metadata({ title: "Remote" }), response({ success: false, errorMessage: "Version conflict", versionConflict: true }, false)]);
  const result = await syncActionProjectBodyAndMetadata(options, fake.ports);
  assert.equal(result.ok, false);
  if (!result.ok) { assert.equal(result.phase, "apply"); assert.match(result.error, /Version conflict/); assert.deepEqual(result.persistedParts, {}); }
  assert.equal(fake.calls.length, 2);
  assert.deepEqual(fake.stamps, []);
});

test("missing or imprecise body versions cannot trigger an unguarded presentation write", async () => {
  for (const version of [undefined, 0, Number.MAX_SAFE_INTEGER + 1, "invalid"]) {
    const fake = fixture([metadata({ title: "Remote" }), body({ editVersion: version })]);
    const result = await syncActionProjectBodyAndMetadata(options, fake.ports);
    assert.equal(result.ok, false);
    if (!result.ok) { assert.equal(result.phase, "version-stamp"); assert.deepEqual(result.persistedParts, { body: true }); }
    assert.equal(fake.calls.length, 2);
    assert.deepEqual(fake.stamps, []);
  }
  const fake = fixture([metadata({ title: "Remote" }), body({ editVersion: "9223372036854775806" }), response({ success: true, editVersion: "9223372036854775807" })]);
  assert.equal((await syncActionProjectBodyAndMetadata(options, fake.ports)).ok, true);
  assert.equal(fake.calls[2]![fake.calls[2]!.indexOf("--expected-edit-version") + 1], "9223372036854775806");
  assert.deepEqual(fake.stamps, ["9223372036854775807"]);
});

test("body success plus rejected or unknown metadata is partial and never certifies a whole-project version", async () => {
  for (const failure of [response({ success: false, errorMessage: "Designer open", errorCode: "DESIGNER_OPEN" }, false), new Error("metadata connection lost")]) {
    const fake = fixture([metadata({ title: "Remote" }), body(), failure]);
    const result = await syncActionProjectBodyAndMetadata(options, fake.ports);
    assert.equal(result.ok, false);
    if (!result.ok) { assert.equal(result.phase, "metadata"); assert.deepEqual(result.persistedParts, { body: true }); assert.match(result.error, /正文已写入/); }
    assert.deepEqual(fake.stamps, []);
    assert.equal(fake.calls.length, 3);
  }
});

test("metadata success without its new version never stamps the now stale body version", async () => {
  const fake = fixture([metadata({ title: "Remote" }), body(), response({ success: true })]);
  const result = await syncActionProjectBodyAndMetadata(options, fake.ports);
  assert.equal(result.ok, false);
  if (!result.ok) { assert.deepEqual(result.persistedParts, { body: true, metadata: true }); assert.match(result.error, /属性已写入.*缺少精确/); }
  assert.deepEqual(fake.stamps, []);
});

test("local version stamp failure retains confirmed host persistence and never reports whole success", async () => {
  const fake = fixture([metadata({ title: "Remote" }), body(), response({ success: true, editVersion: 12 })], new Error("disk write refused"));
  const result = await syncActionProjectBodyAndMetadata(options, fake.ports);
  assert.equal(result.ok, false);
  if (!result.ok) { assert.equal(result.phase, "version-stamp"); assert.deepEqual(result.persistedParts, { body: true, metadata: true }); assert.match(result.error, /disk write refused/); }
});

test("raw version stamp preserves casing, numeric representation of other fields and every unknown byte", () => {
  const original = '\uFEFF{ "EditVersion" : 9223372036854775806, "Title":"A", "opaque":{"editVersion":77,"n":9007199254740993} }\r\n';
  assert.equal(stampActionProjectInfoVersion(original, "9223372036854775807"), original.replace("9223372036854775806", "9223372036854775807"));
  assert.equal(stampActionProjectInfoVersion('{"editVersion":"11","unknown":true}', 12), '{"editVersion":"12","unknown":true}');
  assert.equal(stampActionProjectInfoVersion('{"EditVersion":0}', 12), '{"EditVersion":12}');
  assert.deepEqual(JSON.parse(stampActionProjectInfoVersion('{"id":"native"}', 12)), { id: "native", editVersion: "12" });
  assert.throws(() => stampActionProjectInfoVersion('{"EditVersion":1,"EditVersion":2}', 12), /duplicate/);
  assert.throws(() => stampActionProjectInfoVersion('{"editVersion":{}}', 12), /integer/);
  assert.throws(() => stampActionProjectInfoVersion('{}', Number.MAX_SAFE_INTEGER + 1), /precise/);
  assert.equal(normalizeActionProjectSyncVersion("9223372036854775808"), undefined);
});

test("request cancellation keeps the original reason and cannot continue to a later host write or local stamp", async () => {
  for (const abortAt of ["initial", "get", "apply", "set-metadata"]) {
    const controller = new AbortController();
    const reason = new Error(`cancelled at ${abortAt}`);
    const calls: string[] = [];
    const stamps: string[] = [];
    if (abortAt === "initial") controller.abort(reason);
    const promise = syncActionProjectBodyAndMetadata(options, {
      signal: controller.signal,
      run: async (args) => {
        calls.push(args[1]!);
        if (args[1] === abortAt) controller.abort(reason);
        return args[1] === "get" ? metadata({ title: "Remote" }) : body();
      },
      stampVersion: async (version) => { stamps.push(version); },
    });
    await assert.rejects(promise, (error) => error === reason);
    assert.deepEqual(stamps, []);
    const count = ["initial", "get", "apply", "set-metadata"].indexOf(abortAt);
    assert.equal(calls.length, count);
  }
  const abort = new DOMException("transport cancelled", "AbortError");
  const fake = fixture([metadata({ title: "Remote" }), body(), abort]);
  await assert.rejects(syncActionProjectBodyAndMetadata(options, fake.ports), (error) => error === abort);
  assert.deepEqual(fake.stamps, []);
  const controller = new AbortController();
  const reason = new Error("cancelled with failed metadata response");
  const stamps: string[] = [];
  await assert.rejects(syncActionProjectBodyAndMetadata(options, {
    signal: controller.signal,
    run: async (args) => {
      if (args[1] === "get") return metadata({ title: "Remote" });
      if (args[1] === "apply") return body();
      controller.abort(reason);
      return response({ success: false, errorMessage: "failed response after cancellation" }, false);
    },
    stampVersion: async (version) => { stamps.push(version); },
  }), (error) => error === reason);
  assert.deepEqual(stamps, []);
});
