import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { argvToInvoke, type QkrpcInvoke } from "./qkrpc-argv";
import { invokeQkrpcHttp } from "./qkrpc-http";
import { runWithQkrpcCwdAsync } from "./qkrpc-request-context";

export const fakeBinding = {
  hostInstanceId: "fixture", hostSessionId: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  endpoint: "QuickerRpc_User_AAAAAAAAAAAAAAAAAAAAAAAA_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  protocolVersion: 1, schemaVersion: 1, hostKind: "v1", quickerVersion: "fixture",
  capabilities: { "action.source.read": true, "action.source.write": true },
};
type InvokeRequest = QkrpcInvoke & { timeoutSeconds: number; hostBinding?: typeof fakeBinding };
const fakeBase = "http://qkrpc-test.invalid:9477";

/** All discovery and invoke requests stay inside this fake transport. */
async function withFakeServe(
  dispatch: (request: InvokeRequest, init?: RequestInit) => Response | Promise<Response>,
  run: (requests: InvokeRequest[]) => Promise<void>,
  pluginConnected = true,
): Promise<void> {
  const previousFetch = globalThis.fetch;
  const previousBase = process.env.QKRPC_HTTP_URL;
  const requests: InvokeRequest[] = [];
  process.env.QKRPC_HTTP_URL = fakeBase;
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url === `${fakeBase}/health`) {
      return Response.json({ service: "qkrpc", ok: pluginConnected }, { status: pluginConnected ? 200 : 503 });
    }
    assert.equal(url, `${fakeBase}/v1/invoke`);
    assert.equal(init?.method, "POST");
    const request = JSON.parse(String(init?.body)) as InvokeRequest;
    if (request.op === "action.binding") return Response.json({ ok: true, data: { hostBinding: fakeBinding } });
    if (request.op === "host.list") return Response.json({ ok: true, data: { candidates: [fakeBinding] } });
    requests.push(request);
    return dispatch(request, init);
  };
  try {
    await run(requests);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousBase === undefined) delete process.env.QKRPC_HTTP_URL;
    else process.env.QKRPC_HTTP_URL = previousBase;
  }
}

function sourceInvoke(argv: string[]): QkrpcInvoke {
  const invoke = argvToInvoke(argv);
  assert.ok(invoke);
  return invoke;
}

test("source open forwards options and resolves relative directories in the request workspace", async () => {
  const cwd = "D:\\fixture\\workspace";
  const directory = ".tmp/action source";
  await withFakeServe(
    () => Response.json({ ok: true, data: { ok: true, sourcePath: "fixture/program.source.yaml" } }),
    async (requests) => {
      const invoke = sourceInvoke([
        "action", "open", "--id", "846b4132-ad73-42e8-b2f9-c42fe718ae20",
        "--dir", directory, "--min-lines", "0", "--no-auto-files",
      ]);
      const result = await runWithQkrpcCwdAsync(cwd, () => invokeQkrpcHttp(invoke));
      assert.equal(result?.ok, true);
      assert.deepEqual(requests, [{
        op: "action.open",
        args: {
          id: "846b4132-ad73-42e8-b2f9-c42fe718ae20",
          dir: directory,
          minLines: 0,
          noAutoFiles: true,
          workspaceRoot: cwd,
        },
        timeoutSeconds: 120,
        hostBinding: fakeBinding,
      }]);
      assert.equal(invoke.args.workspaceRoot, undefined);
    },
  );
});

test("source save preserves dry-run intent and explicit workspace roots", async () => {
  await withFakeServe(
    (request) => Response.json({ ok: true, data: { ok: true, dryRun: request.args.dryRun } }),
    async (requests) => {
      for (const dryRun of [true, false]) {
        const invoke = sourceInvoke([
          "action", "save", "--dir", ".tmp/source", ...(dryRun ? ["--dry-run"] : []),
        ]);
        invoke.args.workspaceRoot = "D:\\explicit\\workspace";
        const result = await runWithQkrpcCwdAsync("D:\\other\\workspace", () => invokeQkrpcHttp(invoke));
        assert.equal(result?.ok, true);
        assert.deepEqual(result.parsed, { ok: true, dryRun });
      }
      assert.deepEqual(requests.map((request) => request.args), [
        { dir: ".tmp/source", dryRun: true, workspaceRoot: "D:\\explicit\\workspace" },
        { dir: ".tmp/source", dryRun: false, workspaceRoot: "D:\\explicit\\workspace" },
      ]);
    },
  );
});

test("source dry-run reaches the serve dispatcher when the V1 plugin is disconnected", async () => {
  await withFakeServe(
    () => Response.json({ ok: true, data: { ok: true, dryRun: true } }),
    async (requests) => {
      const result = await runWithQkrpcCwdAsync("D:\\fixture\\workspace", () =>
        invokeQkrpcHttp(sourceInvoke(["action", "save", "--dir", ".tmp/source", "--dry-run"])),
      );
      assert.equal(result?.ok, true);
      assert.deepEqual(requests[0]?.args, {
        dir: ".tmp/source", dryRun: true, workspaceRoot: "D:\\fixture\\workspace",
      });
    },
    false,
  );
});

test("source save keeps absolute directories and propagates validation and persistence errors", async () => {
  const failures = [
    { ok: false, error: "SOURCE_SAVE_FAILED", message: "Missing source bundle." },
    { ok: false, error: "EDIT_VERSION_CONFLICT", message: "Action changed.", data: { versionConflict: true } },
    { ok: false, error: "SOURCE_CHECKPOINT_FAILED", message: "Reopen before saving again.", data: { persisted: true, editVersion: 9 } },
  ];
  await withFakeServe(
    () => Response.json(failures.shift()),
    async (requests) => {
      for (const expected of [...failures]) {
        const invoke = sourceInvoke([
          "action", "save", "--dir", "D:\\fixture\\source",
          ...(expected.error === "SOURCE_SAVE_FAILED" ? ["--dry-run"] : []),
        ]);
        const result = await runWithQkrpcCwdAsync("D:\\fixture\\workspace", () => invokeQkrpcHttp(invoke));
        assert.equal(result?.ok, false);
        assert.equal(result?.stderr, expected.message);
        assert.deepEqual(result?.parsed, expected);
      }
      assert.equal(requests.length, 3);
      assert.ok(requests.every((request) => request.args.dir === "D:\\fixture\\source"));
      assert.ok(requests.every((request) => request.args.workspaceRoot === "D:\\fixture\\workspace"));
    },
  );
});

test("source transport failures do not appear as successful saves", async () => {
  await withFakeServe(
    () => new Response("invalid source response"),
    async () => {
      const result = await runWithQkrpcCwdAsync("D:\\fixture\\workspace", () =>
        invokeQkrpcHttp(sourceInvoke(["action", "save", "--dir", ".tmp/source"])),
      );
      assert.equal(result?.ok, false);
      assert.match(result!.stderr, /^qkrpc serve returned invalid JSON/);
      assert.equal((result?.parsed as { error?: string })?.error, "WRITE_RESULT_UNKNOWN");
    },
  );
});

test("operation effects preserve uncertain local exports after empty, invalid or interrupted acknowledgements", async () => {
  const operations = [
    ["action", "open", "--id", "846b4132-ad73-42e8-b2f9-c42fe718ae20", "--dir", ".tmp/fixture-only"],
    ["action", "extract", "--id", "846b4132-ad73-42e8-b2f9-c42fe718ae20", "--dir", ".tmp/fixture-only"],
    ["subprogram", "export", "--id", "fixture-only", "--dir", ".tmp/fixture-only"],
  ];
  for (const argv of operations) {
    for (const response of [
      () => new Response(""),
      () => new Response("{incomplete"),
      () => Response.json({}),
      () => Response.json(null),
      () => new Response(new ReadableStream({ start(controller) { controller.error(new Error("fixture acknowledgement interrupted")); } })),
    ]) {
      await withFakeServe(response, async (requests) => {
        const result = await invokeQkrpcHttp(sourceInvoke(argv), { hostBinding: fakeBinding });
        const failure = result?.parsed as { error?: string; retryable?: boolean } | undefined;
        assert.equal(failure?.error, "WRITE_RESULT_UNKNOWN", argv.join(" "));
        assert.equal(failure?.retryable, false);
        assert.match(result!.stderr, /host|local|files|operation/i);
        assert.equal(requests.length, 1);
      });
    }
  }
});

test("operation effects distinguish a dispatched export timeout from a refused host binding", async () => {
  mock.timers.enable({ apis: ["setTimeout"] });
  try {
    let started!: () => void;
    const ready = new Promise<void>((resolve) => { started = resolve; });
    await withFakeServe((_request, init) => new Promise<Response>((_resolve, reject) => {
      init!.signal!.addEventListener("abort", () => reject(init!.signal!.reason), { once: true });
      started();
    }), async (requests) => {
      const pending = invokeQkrpcHttp(sourceInvoke(["action", "open", "--id", "846b4132-ad73-42e8-b2f9-c42fe718ae20", "--dir", ".tmp/fixture-only"]), {
        hostBinding: fakeBinding, timeoutMs: 1,
      });
      await ready;
      mock.timers.tick(5_001);
      const result = await pending;
      assert.equal((result?.parsed as { error?: string })?.error, "WRITE_RESULT_UNKNOWN");
      assert.match(result!.stderr, /timed out/);
      assert.equal(requests.length, 1);
    });
    await withFakeServe(() => { throw new Error("Must not dispatch an export"); }, async (requests) => {
      const previous = process.env.QKRPC_HOST_BINDING;
      process.env.QKRPC_HOST_BINDING = "{invalid";
      try {
        const result = await invokeQkrpcHttp(sourceInvoke(["action", "open", "--id", "846b4132-ad73-42e8-b2f9-c42fe718ae20", "--dir", ".tmp/fixture-only"]));
        assert.equal((result?.parsed as { error?: string })?.error, "HOST_HANDSHAKE_INVALID");
        assert.equal(requests.length, 0);
      } finally {
        if (previous === undefined) delete process.env.QKRPC_HOST_BINDING; else process.env.QKRPC_HOST_BINDING = previous;
      }
    });
  } finally { mock.timers.reset(); }
});

test("server RPC timeouts retain uncertain write receipts while pure reads and explicit refusals stay unchanged", async () => {
  const receipt = { ok: false, error: "RPC_TIMEOUT", message: "RPC timed out after 1s.", data: { requestId: "fixture-deadline" } };
  for (const argv of [
    ["action", "open", "--id", "fixture-only", "--dir", ".tmp/fixture-only"],
    ["action", "set-metadata", "--id", "fixture-only", "--icon", "fa:Light_Flask"],
  ]) {
    await withFakeServe(() => Response.json(receipt), async (requests) => {
      const result = await invokeQkrpcHttp(sourceInvoke(argv), { hostBinding: fakeBinding });
      const parsed = result?.parsed as { error?: string; retryable?: boolean; cause?: unknown };
      assert.equal(parsed.error, "WRITE_RESULT_UNKNOWN");
      assert.equal(parsed.retryable, false);
      assert.deepEqual(parsed.cause, receipt);
      assert.match(result!.stderr, /host.*local|local.*host/i);
      assert.equal(requests.length, 1);
    });
  }
  await withFakeServe(() => Response.json(receipt), async () => {
    const result = await invokeQkrpcHttp(sourceInvoke(["fa", "search", "--query", "fixture-only"]), { hostBinding: fakeBinding });
    assert.deepEqual(result?.parsed, receipt);
    assert.equal(result?.stderr, receipt.message);
  });
  for (const error of ["INVALID_ARGS", "HOST_BINDING_MISMATCH", "EDIT_VERSION_CONFLICT"]) {
    const rejected = { ok: false, error, message: "Explicit fixture refusal.", data: { persisted: false } };
    await withFakeServe(() => Response.json(rejected), async () => {
      const result = await invokeQkrpcHttp(sourceInvoke(["action", "open", "--id", "fixture-only", "--dir", ".tmp/fixture-only"]), { hostBinding: fakeBinding });
      assert.deepEqual(result?.parsed, rejected);
      assert.equal(result?.stderr, rejected.message);
    });
  }
});

test("FA page HTTP forwards exact binding/criteria and reports disconnect as a read failure", async () => {
  const invoke = sourceInvoke(["fa", "page", "--query", "camera", "--style", "Light", "--skip", "24", "--take", "2"]);
  await withFakeServe(() => Response.json({ ok: true, data: { ok: true, payload: { names: ["Light_Camera"], totalCount: 25, hasMore: false } } }), async (requests) => {
    const result = await invokeQkrpcHttp(invoke, { hostBinding: fakeBinding, timeoutMs: 7000 });
    assert.equal(result?.ok, true);
    assert.deepEqual(requests, [{ ...invoke, hostBinding: fakeBinding, timeoutSeconds: 7 }]);
  });
  await withFakeServe(() => { throw new TypeError("fetch failed"); }, async (requests) => {
    const result = await invokeQkrpcHttp(invoke, { hostBinding: fakeBinding });
    assert.equal((result?.parsed as { error: string }).error, "HOST_UNAVAILABLE");
    assert.equal(requests.length, 1);
  });
  await withFakeServe(() => { throw new Error("No dispatch after preabort"); }, async (requests) => {
    const abort = new AbortController(), reason = new Error("page cancelled"); abort.abort(reason);
    await assert.rejects(invokeQkrpcHttp(invoke, { hostBinding: fakeBinding, abortSignal: abort.signal }), (error) => error === reason);
    assert.equal(requests.length, 0);
  });
});
