// Explicit acceptance staging only. No installer, shared staging or dependency install.
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildAgentProductionRuntime } from "./build-agent-production.mjs";
import { stageRuntimePackages } from "./stage-runtime-packages.mjs";
import { stageElectronShell } from "./electron-shell-staging.mjs";

const agent = resolve(dirname(fileURLToPath(import.meta.url)), ".."), repo = dirname(agent);
const require = createRequire(import.meta.url);
const sha = (value) => createHash("sha256").update(value).digest("hex");
const within = (root, target) => { const rel = relative(root, target); return rel && rel !== ".." && !rel.startsWith("../") && !rel.startsWith("..\\") && !isAbsolute(rel); };

function inventory(root) {
  const entries = [];
  const visit = (directory) => {
    for (const name of readdirSync(directory).sort()) {
      const path = join(directory, name), stat = lstatSync(path);
      if (stat.isSymbolicLink()) throw new Error("Acceptance inventory refuses redirected entries");
      if (stat.isDirectory()) visit(path);
      else if (stat.isFile()) entries.push({ name: relative(root, path).replaceAll("\\", "/"), bytes: stat.size, sha256: sha(readFileSync(path)) });
      else throw new Error("Acceptance inventory requires ordinary files");
    }
  };
  visit(root);
  return entries;
}

export function verifyPreparedPackage(path) {
  path = assertLocalAncestry(path);
  const receipt = JSON.parse(readFileSync(path, "utf8"));
  const root = assertLocalAncestry(receipt.output);
  if (!within(join(repo, ".tmp"), root) || path !== join(root, "prepared.json") || receipt.format !== "quicker-agent.graceful-exit-staging.v1") throw new Error("Unknown acceptance package");
  const expected = JSON.parse(readFileSync(join(root, "package-files.json"), "utf8"));
  if (sha(JSON.stringify(expected)) !== receipt.inventorySha256 || JSON.stringify(inventory(join(root, "win-unpacked"))) !== JSON.stringify(expected)) throw new Error("Sealed acceptance package contents changed");
  return expected.length;
}

export function assertLocalAncestry(path) {
  path = resolve(path);
  if (/(^|[\\/])(OneDrive[^\\/]*|Dropbox|iCloud[^\\/]*)([\\/]|$)/i.test(path)) throw new Error("Cloud staging is not allowed");
  for (let current = path; ; current = dirname(current)) {
    let stat;
    try { stat = lstatSync(current); } catch (error) { if (error.code !== "ENOENT") throw error; }
    if (stat && (stat.isSymbolicLink() || realpathSync(current).toLowerCase() !== current.toLowerCase())) throw new Error("Redirected staging ancestry");
    if (dirname(current) === current) break;
  }
  return path;
}

export async function prepareGracefulExit(argv) {
  const options = {};
  for (const arg of argv) {
    if (arg.startsWith("--runtime-dir=") && !options.runtime) options.runtime = arg.slice(14);
    else if (arg.startsWith("--out=") && !options.output) options.output = arg.slice(6);
    else if (arg === "--use-bundle" && !options.bundle) options.bundle = true;
    else throw new Error(`Unknown acceptance staging argument: ${arg}`);
  }
  if (!options.runtime || !options.output) throw new Error("Provide --runtime-dir=<production win-unpacked> --out=<new repo .tmp directory>");
  const source = assertLocalAncestry(options.runtime), output = assertLocalAncestry(options.output);
  if (!within(join(repo, ".tmp"), output) || existsSync(output)) throw new Error("Acceptance output must be a fresh repository .tmp directory");
  if (source === output || within(source, output) || within(output, source)) throw new Error("Acceptance source and output must not overlap");
  if (process.platform === "win32") execFileSync("pwsh", ["-NoProfile", "-File", join(agent, "scripts/Assert-NsisFixturePaths.ps1"), "-PathsJson", JSON.stringify([source, output]), "-Trees"], { stdio: "pipe", windowsHide: true });
  const facts = [];
  for (const name of ["quicker-agent.exe", "resources/app.asar", "resources/node/node.exe"]) {
    const path = assertLocalAncestry(join(source, name));
    if (!lstatSync(path).isFile()) throw new Error(`Missing production runtime: ${name}`);
    facts.push({ path, sha256: sha(readFileSync(path)) });
  }
  mkdirSync(output, { recursive: true });
  const unpacked = join(output, "win-unpacked"), resources = join(unpacked, "resources"), app = join(resources, "app");
  mkdirSync(resources, { recursive: true });
  // Copy ordinary Electron files and portable tools, never update the supplied package.
  for (const entry of readdirSync(source, { withFileTypes: true })) {
    if (entry.name === "resources") continue;
    cpSync(join(source, entry.name), join(unpacked, entry.name), { recursive: true, dereference: false });
  }
  for (const name of ["node", "rg", "qkrpc", "app-icon.ico"]) {
    const path = join(source, "resources", name);
    if (existsSync(path)) cpSync(path, join(resources, name), { recursive: true, dereference: false });
  }
  let shell;
  if (options.bundle) {
    cpSync(join(source, "resources/app.asar"), join(resources, "app.asar"));
    cpSync(join(source, "resources/app"), app, { recursive: true, dereference: false });
  } else {
    await buildAgentProductionRuntime({ outputDirectory: app });
    shell = stageElectronShell({ version: JSON.parse(readFileSync(join(agent, "package.json"), "utf8")).version,
      outputDirectory: join(output, "shell"), installDependencies: (directory) => stageRuntimePackages(["electron-updater"], directory, agent) });
    await require("@electron/asar").createPackage(shell, join(resources, "app.asar"));
  }
  // This is the only runtime instrumentation: block credentials/config refresh and
  // outbound fetch before any business module loads. Cleanup code stays untouched.
  if (existsSync(join(app, "service.acceptance-original.mjs")) || existsSync(join(app, "acceptance-egress-guard.mjs"))) throw new Error("Package is already instrumented");
  const beforeGuard = inventory(app);
  writeFileSync(join(output, "app-before-guard.json"), JSON.stringify(beforeGuard));
  const service = join(app, "service.mjs"), original = readFileSync(service, "utf8");
  writeFileSync(join(app, "service.acceptance-original.mjs"), original);
  writeFileSync(join(app, "acceptance-egress-guard.mjs"), `import { appendFileSync } from 'node:fs';
import { join } from 'node:path';
process.env.BUNDLED_LLM_REMOTE_CONFIG_DISABLED='1';
process.env.BUNDLED_LLM_CONFIG='{}';
process.env.LLM_CONFIG_PATH=join(process.env.QUICKER_AGENT_SMOKE_ROOT,'absent-model-config.json');
const original=globalThis.fetch;
globalThis.fetch=(input, options)=>{
  const url=new URL(typeof input==='string'||input instanceof URL?input:input.url);
  const allowed=[process.env.QKRPC_HTTP_URL,...['PORT','QUICKER_BROWSER_PORT','QUICKER_TERMINAL_PORT'].map(k=>'http://127.0.0.1:'+process.env[k])];
  const permitted=allowed.includes(url.origin);
  appendFileSync(join(process.env.QUICKER_AGENT_SMOKE_ROOT,'service-egress.jsonl'),JSON.stringify({origin:url.origin,permitted})+'\\n');
  if(!permitted) throw new Error('Acceptance denied outbound origin '+url.origin);
  return original(input,{...options,redirect:'error'});
};
`);
  writeFileSync(service, "import './acceptance-egress-guard.mjs';\n" + original);
  const afterGuard = inventory(app);
  const remaining = afterGuard.filter(entry => !["acceptance-egress-guard.mjs", "service.acceptance-original.mjs", "service.mjs"].includes(entry.name));
  if (JSON.stringify(remaining) !== JSON.stringify(beforeGuard.filter(entry => entry.name !== "service.mjs"))) throw new Error("Unexpected runtime instrumentation delta");
  const files = inventory(unpacked);
  writeFileSync(join(output, "package-files.json"), JSON.stringify(files));
  const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo, encoding: "utf8" }).trim();
  const receipt = { format: "quicker-agent.graceful-exit-staging.v1", sourceCommit: head, mode: options.bundle ? "supplied-bundle" : "current-production-build",
    sourceRuntime: source, output, executable: join(unpacked, "quicker-agent.exe"), shell, sourceRuntimeFacts: facts,
    sourceChanges: execFileSync("git", ["diff", "--name-only"], { cwd: repo, encoding: "utf8" }).trim().split(/\r?\n/).filter(Boolean),
    inventorySha256: sha(JSON.stringify(files)), packageFileCount: files.length, beforeGuardInventorySha256: sha(JSON.stringify(beforeGuard)),
    instrumentation: { modified: ["service.mjs"], added: ["service.acceptance-original.mjs", "acceptance-egress-guard.mjs"], allOtherAppFilesIdentical: true },
    artifacts: ["resources/app.asar", "resources/app/service.mjs", "resources/app/service.acceptance-original.mjs", "resources/app/lib/service-main.mjs", "resources/app/runtime-manifest.json"].map(name => ({ name, sha256: sha(readFileSync(join(unpacked, name))) })),
    limits: ["No installer executed or user upgrade tested", "Fresh source build is a local acceptance package, not a published release", "Only service fetch/config isolation is instrumented; product cleanup is unchanged"] };
  writeFileSync(join(output, "prepared.json"), JSON.stringify(receipt, null, 2));
  for (const fact of facts) if (sha(readFileSync(fact.path)) !== fact.sha256) throw new Error("Supplied production package changed during staging");
  console.log(`Graceful exit package: ${join(output, "prepared.json")}`);
  return receipt;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv[2]?.startsWith("--verify=") && process.argv.length === 3) console.log(`Verified sealed package: ${verifyPreparedPackage(process.argv[2].slice(9))} files`);
  else prepareGracefulExit(process.argv.slice(2)).catch(error => { console.error(error); process.exitCode = 1; });
}
