import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdir, mkdtemp, writeFile, symlink } from "node:fs/promises";
import { join, resolve } from "node:path";
import { createStaticRendererHandler } from "./static-renderer";

test("static resources expose only renderer files with real-path bounds and cache semantics", async () => {
  const parent = resolve("../.tmp");
  await mkdir(parent, { recursive: true });
  const root = await mkdtemp(join(parent, "renderer-handler-"));
  const renderer = join(root, "renderer");
  await mkdir(renderer);
  await writeFile(join(renderer, "index.html"), "<div>renderer</div>");
  await writeFile(join(renderer, "asset.js"), "export const app = true");
  await writeFile(join(root, "secret.txt"), "private");
  await symlink(root, join(renderer, "outside"), process.platform === "win32" ? "junction" : "dir");
  const handle = createStaticRendererHandler(renderer);
  const get = (path: string, options?: RequestInit) => handle(new Request("http://agent.test" + path, options));
  for (const path of ["/", "/launcher", "/bench", "/tool-test"]) assert.match(await (await get(path)).text(), /renderer/);
  for (const path of ["/.env", "/outside/secret.txt", "/%2e%2e%5csecret.txt", "/unknown", "/api/chat"]) assert.equal((await get(path)).status, 404);
  const asset = await get("/asset.js");
  assert.match(asset.headers.get("content-type")!, /javascript/);
  assert.equal((await get("/asset.js", { headers: { "if-none-match": asset.headers.get("etag")! } })).status, 304);
  assert.equal(await (await get("/asset.js", { method: "HEAD" })).text(), "");
  assert.equal((await get("/", { method: "POST" })).status, 405);
});
