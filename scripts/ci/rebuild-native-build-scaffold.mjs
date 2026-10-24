import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { lstatSync, readlinkSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

// Exercise the native source-build shape even when pnpm restores cached outputs.
// These are the same locked packages used by the production runtime stager.
assert.equal(process.platform, "linux", "The retained Python shim fixture is Linux-only");
const require = createRequire(new URL("../../agent-gui/package.json", import.meta.url));
assert.equal(require("node-pty/package.json").version, "1.1.0");
assert.equal(require("node-gyp/package.json").version, "9.4.1");
const nativeRoot = dirname(require.resolve("node-pty/package.json"));
const result = spawnSync(process.execPath, [require.resolve("node-gyp/bin/node-gyp.js"), "rebuild"], {
  cwd: nativeRoot, stdio: "inherit", timeout: 150_000,
});
if (result.error) throw result.error;
assert.equal(result.status, 0, `Locked node-pty source rebuild failed (${result.signal ?? result.status})`);
const helper = join(nativeRoot, "build/node_gyp_bins"), python = join(helper, "python3");
assert.ok(lstatSync(helper).isDirectory() && !lstatSync(helper).isSymbolicLink());
assert.ok(lstatSync(python).isSymbolicLink());
assert.ok(lstatSync(join(nativeRoot, "build/Release/pty.node")).isFile());
console.log(JSON.stringify({ event: "locked-native-build-scaffold", nodePty: "1.1.0", nodeGyp: "9.4.1",
  pythonLink: readlinkSync(python), nativeRuntimeFiles: ["build/Release/pty.node"] }));
