import { existsSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export async function verifyStaticRuntime(appDirectory, { nodeExecutable = process.execPath, desktop = false } = {}) {
  const root = realpathSync(appDirectory);
  const manifest = JSON.parse(readFileSync(join(root, "runtime-manifest.json"), "utf8"));
  if (manifest.format !== "quicker-agent-static-runtime" || manifest.version !== 1 || manifest.next !== false) throw new Error("Invalid static runtime manifest");
  const required = ["service.mjs", "lib/service-main.mjs", "renderer/index.html", "drizzle/migrations/meta/_journal.json", "docs/skills/quicker-authoring/SKILL.md", "docs/skills/quicker-eval-expression/SKILL.md", "browser-runtime/server.mjs", "terminal-runtime/server.mjs", "lib/qkrpc-bin.mjs", "lib/qkrpc-toolchain-env.mjs"];
  for (const file of required) if (!existsSync(join(root, file))) throw new Error(`Missing static runtime resource: ${file}`);
  for (const file of ["node_modules/next", ".next", "server.js", "llm-publish.config.json", ".local", "agent.db"]) {
    if (existsSync(join(root, file))) throw new Error(`Unexpected private or Next resource: ${file}`);
  }
  // Native modules are probed using the exact Node executable which will own them.
  const result = spawnSync(nodeExecutable, ["-e", "const D=require('better-sqlite3'); const db=new D(':memory:'); db.exec('select 1'); db.close(); require('node-pty'); require('ws'); require('playwright'); console.log('native-runtime-ok')"], { cwd: root, encoding: "utf8", windowsHide: true });
  if (result.status !== 0 || !result.stdout.includes("native-runtime-ok")) throw new Error(`Native runtime failed: ${result.stderr || result.error}`);
  let files = 0;
  const inspect = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      const rel = relative(root, realpathSync(path));
      if (rel.startsWith("..") || isAbsolute(rel)) throw new Error(`Runtime resource escapes its directory: ${path}`);
      if (entry.isDirectory()) inspect(path); else files++;
    }
  };
  inspect(root);
  if (desktop) {
    for (const file of ["qkrpc/qkrpc.exe", "rg/rg.exe"]) if (!existsSync(join(root, "..", file))) throw new Error(`Missing desktop runtime: ${file}`);
  }
  return { ok: true, files, native: "sqlite/pty/ws/playwright loaded", next: false };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  void verifyStaticRuntime(resolve(process.argv[2])).then((report) => console.log(JSON.stringify(report, null, 2))).catch((error) => { console.error(error); process.exitCode = 1; });
}
