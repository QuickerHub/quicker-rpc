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
  return original(input,options);
};
`);
  writeFileSync(service, "import './acceptance-egress-guard.mjs';\n" + original);
  const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo, encoding: "utf8" }).trim();
  const receipt = { format: "quicker-agent.graceful-exit-staging.v1", sourceCommit: head, mode: options.bundle ? "supplied-bundle" : "current-production-build",
    sourceRuntime: source, output, executable: join(unpacked, "quicker-agent.exe"), shell, sourceRuntimeFacts: facts,
    sourceChanges: execFileSync("git", ["diff", "--name-only"], { cwd: repo, encoding: "utf8" }).trim().split(/\r?\n/).filter(Boolean),
    artifacts: ["resources/app.asar", "resources/app/service.mjs", "resources/app/service.acceptance-original.mjs", "resources/app/lib/service-main.mjs", "resources/app/runtime-manifest.json"].map(name => ({ name, sha256: sha(readFileSync(join(unpacked, name))) })),
    limits: ["No installer executed or user upgrade tested", "Fresh source build is a local acceptance package, not a published release", "Only service fetch/config isolation is instrumented; product cleanup is unchanged"] };
  writeFileSync(join(output, "prepared.json"), JSON.stringify(receipt, null, 2));
  for (const fact of facts) if (sha(readFileSync(fact.path)) !== fact.sha256) throw new Error("Supplied production package changed during staging");
  console.log(`Graceful exit package: ${join(output, "prepared.json")}`);
  return receipt;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  prepareGracefulExit(process.argv.slice(2)).catch(error => { console.error(error); process.exitCode = 1; });
}
