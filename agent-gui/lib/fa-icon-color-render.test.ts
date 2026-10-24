import assert from "node:assert/strict";
import { test } from "node:test";
import { build } from "esbuild";
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

test("production SVG, composer DOM and both legacy vector boundaries share one native color conversion", async () => {
  const gui = fileURLToPath(new URL("../", import.meta.url));
  const parent = join(dirname(gui), ".tmp", "fa-native-color");
  await mkdir(parent, { recursive: true });
  const root = await mkdtemp(join(parent, "fixture-"));
  try {
    const compiled = await build({ absWorkingDir: gui, bundle: true, platform: "node", format: "cjs", packages: "external", jsx: "automatic", write: false, alias: { "@": gui },
      tsconfig: join(gui, "tsconfig.json"), stdin: { resolveDir: gui, loader: "tsx", contents: `
        import assert from "node:assert/strict";
        import React from "react";
        import { renderToStaticMarkup } from "react-dom/server";
        import { ActionIcon } from "./components/chat/ActionIcon";
        import { FaVectorSvg } from "./lib/action-editor/shared/FaVectorSvg";
        import { createComposerTagIconElement } from "./lib/composer-tag-present";
        import { peekFaVectorCache } from "./lib/action-editor/shared/faVector";
        import { GET } from "./app/api/icons/fa-vector/route";
        globalThis.document = { createElementNS: (_ns, tag) => ({ tag, attributes: {}, children: [],
          setAttribute(key, value) { this.attributes[key] = value; }, append(child) { this.children.push(child); } }) };
        (async () => {
          for (const [native, expected] of [["#80112233", "#11223380"], ["#FF112233", "#112233"],
            ["#00112233", "#11223300"], ["#abc", "#AABBCC"]]) {
            for (const color of [native, expected]) {
              const spec = "fa:Light_Flask:" + native;
              const geometry = Object.freeze({ spec, color, enumName: "Light_Flask", path: "M0 0h1v1Z", width: 31, height: 17 });
              globalThis.fixtureGeometry = geometry;
              for (const Component of [ActionIcon, FaVectorSvg]) {
                const html = renderToStaticMarkup(React.createElement(Component, { spec, title: "Original label" }));
                assert.ok(html.includes('fill="' + expected + '"'), html);
                assert.ok(html.includes('viewBox="0 0 31 17"'), html);
                assert.ok(html.includes("Original label"), html);
              }
              const node = createComposerTagIconElement({ kind: "action", id: "fixture", title: "Fixture", icon: spec });
              assert.equal(node.children[0].attributes.fill, expected);
              assert.equal(peekFaVectorCache(spec, "")?.fill, expected);
              globalThis.fixtureWire = { ok: true, payload: { items: [geometry] } };
              const response = await GET(new Request("http://fixture.invalid/api/icons/fa-vector?spec=" + encodeURIComponent(spec)));
              assert.equal(response.status, 200); assert.equal((await response.json()).fill, expected);
              assert.equal(geometry.color, color); assert.equal(geometry.spec, spec);
            }
          }
          // Old responses may lack a spec; their CSS alpha must not be interpreted as native ARGB.
          globalThis.fixtureWire = { items: [{ path: "M0 0", width: 31, height: 17, color: "#11223380" }] };
          assert.equal((await (await GET(new Request("http://fixture.invalid/api/icons/fa-vector?spec=fa:Light_Flask"))).json()).fill, "#11223380");
        })().catch(error => { console.error(error); process.exitCode = 1; });
      ` }, plugins: [{ name: "owned-fake-read-ports", setup(plugin) {
        plugin.onResolve({ filter: /(?:^|\/)use-fa-icon-geometry$/u }, () => ({ path: "geometry", namespace: "fixture" }));
        plugin.onResolve({ filter: /(?:^|\/)fa-icon-cache$/u }, () => ({ path: "cache", namespace: "fixture" }));
        plugin.onResolve({ filter: /^@\/lib\/qkrpc$/u }, () => ({ path: "qkrpc", namespace: "fixture" }));
        plugin.onLoad({ filter: /.*/u, namespace: "fixture" }, ({ path }) => ({ loader: "js", contents: path === "geometry"
          ? "export const useFaIconGeometry = () => globalThis.fixtureGeometry;"
          : path === "qkrpc" ? "export const runQkrpc = async () => ({ ok: true, parsed: globalThis.fixtureWire });"
          : "export const getFaIconFromCache = () => globalThis.fixtureGeometry; export const ensureFaIconsResolved = () => { throw new Error('Unexpected host read'); }; export const flushFaIconCache = async () => {};" }));
      } }] });
    const entry = join(root, "render.cjs");
    await writeFile(entry, compiled.outputFiles[0]!.contents);
    execFileSync(process.execPath, ["--import", pathToFileURL(join(gui, "scripts/agent-offline-network-guard.mjs")).href, entry], {
      cwd: gui, env: { ...process.env, NODE_PATH: join(gui, "node_modules") }, timeout: 20_000, encoding: "utf8", stdio: "pipe",
    });
  } finally {
    assert.ok(root.startsWith(join(parent, "fixture-")));
    await rm(root, { recursive: true, force: true });
  }
});
