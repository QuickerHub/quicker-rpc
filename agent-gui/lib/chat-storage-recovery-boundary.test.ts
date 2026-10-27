import assert from "node:assert/strict";
import { test } from "node:test";
import { defaultChatStore, updateThreadMessages } from "./chat-store";
import { CHAT_STORAGE_KEY } from "./chat-store-persist";
import { fetchChatStoreFromApi, resetClientPersistedSnapshotForTests } from "./chat-store-api.client";
import { getChatStorePersistenceMode, setChatStorePersistenceModeForTests } from "./chat-store-backend";
import { fetchLegacyChatStoreCandidatesFromDisk } from "./legacy-chat-restore-client";

function memoryStorage() {
  const values = new Map<string, string>();
  return { values, get length() { return values.size; }, key: (index: number) => [...values.keys()][index] ?? null,
    getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); }, clear: () => values.clear() };
}
function persisted(text: string) {
  const empty = defaultChatStore();
  return updateThreadMessages(empty, empty.activeThreadId, [{ id: text, role: "user", parts: [{ type: "text", text }] }]);
}
async function isolated(run: (browser: Record<string, any>, storage: ReturnType<typeof memoryStorage>) => Promise<void>) {
  const previous = (["window", "localStorage", "fetch"] as const).map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)] as const);
  const storage = memoryStorage();
  const browser: Record<string, any> = { location: { search: "", port: "43127" }, localStorage: storage,
    setTimeout: globalThis.setTimeout.bind(globalThis), clearTimeout: globalThis.clearTimeout.bind(globalThis) };
  Object.defineProperty(globalThis, "window", { configurable: true, writable: true, value: browser });
  Object.defineProperty(globalThis, "localStorage", { configurable: true, writable: true, value: storage });
  setChatStorePersistenceModeForTests("api"); resetClientPersistedSnapshotForTests();
  try { await run(browser, storage); }
  finally {
    resetClientPersistedSnapshotForTests(); setChatStorePersistenceModeForTests("api");
    for (const [name, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else Reflect.deleteProperty(globalThis, name);
    }
  }
}

test("chat storage mode follows API/embed/explicit policy rather than the page port or desktop shell", async () => {
  await isolated(async browser => {
    assert.equal(getChatStorePersistenceMode(), "api");
    browser.__TAURI_INTERNALS__ = {}; assert.equal(getChatStorePersistenceMode(), "api");
    delete browser.__TAURI_INTERNALS__; browser.__ELECTRON__ = {}; assert.equal(getChatStorePersistenceMode(), "api");
    browser.location.search = "?embed=action-designer&entityId=fixture"; assert.equal(getChatStorePersistenceMode(), "localStorage");
    browser.location.search = ""; setChatStorePersistenceModeForTests("localStorage"); assert.equal(getChatStorePersistenceMode(), "localStorage");
  });
});

test("chat API keeps server authority, empty-DB local migration and error fallbacks on relative requests", async () => {
  await isolated(async (_browser, storage) => {
    const local = persisted("legacy local snapshot"), server = persisted("server SQLite snapshot");
    storage.setItem(CHAT_STORAGE_KEY, JSON.stringify({ ...local, version: 2 }));
    for (const kind of ["server", "empty-migrate", "failed-migrate", "http-error", "throw", "payload-error"]) {
      const requests: string[] = [];
      globalThis.fetch = async (input, init) => {
        const url = String(input); requests.push(url);
        assert.ok(url.startsWith("/api/chat-store"), "storage IO stays relative to the selected runtime");
        if (url === "/api/chat-store/migrate") {
          assert.equal(init?.method, "POST");
          const sent = JSON.parse(String(init?.body)); assert.equal(sent.merge, false);
          assert.equal(sent.threads.some((thread: any) => thread.messages.some((message: any) => message.id === "legacy local snapshot")), true);
          return kind === "failed-migrate" ? new Response("", { status: 503 }) : Response.json({ store: local });
        }
        assert.equal(url, "/api/chat-store?scope=active");
        if (kind === "throw") throw Error("controlled API failure");
        if (kind === "http-error") return new Response("", { status: 503 });
        if (kind === "payload-error") return Response.json({ ok: false, error: "controlled payload failure" });
        return Response.json(kind === "server" ? { ok: true, store: server } : { ok: true, empty: true, store: defaultChatStore() });
      };
      resetClientPersistedSnapshotForTests();
      const loaded = await fetchChatStoreFromApi();
      assert.equal(loaded.threads.some(thread => thread.messages.some(message => message.id === (kind === "server" ? "server SQLite snapshot" : "legacy local snapshot"))), true, kind);
      assert.deepEqual(requests, kind === "empty-migrate" || kind === "failed-migrate"
        ? ["/api/chat-store?scope=active", "/api/chat-store/migrate"] : ["/api/chat-store?scope=active"], kind);
      // The existing legacy loader may upgrade v2 inline data to v3 chunks.
      // Preserve that behavior while ensuring the local message is not lost or
      // replaced by the independent server snapshot.
      const localBytes = [...storage.values.values()].join("\n");
      assert.ok(localBytes.includes("legacy local snapshot"), kind);
      assert.equal(localBytes.includes("server SQLite snapshot"), false, kind);
    }
  });
});

test("explicit chat recovery retains relative HTTP and desktop scan provenance without a preferred-port probe", async () => {
  await isolated(async (browser, storage) => {
    const candidate = persisted("synthetic recovered message");
    const hits = [{ source: "synthetic-profile/Local Storage/leveldb", storageKey: CHAT_STORAGE_KEY, json: JSON.stringify({ ...candidate, version: 2 }) }];
    const requests: string[] = [];
    globalThis.fetch = async (input, init) => {
      requests.push(String(input)); assert.equal(String(input), "/api/chat-store/scan-legacy"); assert.equal(init?.method, "POST");
      return Response.json({ hits, scannedRoots: ["synthetic-web-profile"] });
    };
    assert.deepEqual(requests, [], "the explicit client has not been invoked");
    const web = await fetchLegacyChatStoreCandidatesFromDisk();
    assert.deepEqual(requests, ["/api/chat-store/scan-legacy"]); assert.deepEqual(web.scannedRoots, ["synthetic-web-profile"]);
    assert.equal(web.candidates.length, 1); assert.match(web.candidates[0]!.source, /synthetic-profile/);
    assert.equal(web.candidates[0]!.data.threads.some(thread => thread.messages.some(message => message.id === "synthetic recovered message")), true);
    const commands: string[] = [];
    browser.__ELECTRON__ = { invoke: async (command: string) => { commands.push(command); return { hits, scannedRoots: ["synthetic-desktop-profile"] }; } };
    const desktop = await fetchLegacyChatStoreCandidatesFromDisk();
    assert.deepEqual(commands, ["legacy_chat_store_scan"]); assert.deepEqual(desktop.scannedRoots, ["synthetic-desktop-profile"]);
    assert.equal(desktop.candidates.length, 1); assert.deepEqual(requests, ["/api/chat-store/scan-legacy"]);
    assert.equal(storage.length, 0, "recovery discovery does not itself persist a store");
  });
});
