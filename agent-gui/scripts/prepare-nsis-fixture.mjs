/** Explicit offline acceptance artifact. This entry never runs the final setup
 * or uninstaller. Production packaging has no fixture CLI switch. */
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, statSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const project = resolve(dirname(fileURLToPath(import.meta.url)), ".."), repository = resolve(project, "..");
const require = createRequire(import.meta.url);
export const NSIS_FIXTURE_ID = "4ad81d73-08a4-4f34-bdc9-c74adb8bfd63";
export const NSIS_FIXTURE_IDENTITY = Object.freeze({ guid: NSIS_FIXTURE_ID,
  appId: "ai.quicker.agent.nsisfixture.4ad81d73", productName: "QuickerAgent NSIS Fixture 4ad81d73",
  packageName: "quicker-agent-nsis-fixture-4ad81d73", versions: ["0.0.1", "0.0.2"] });
const sha = (buffer) => createHash("sha256").update(buffer).digest("hex");
const runRoot = join(repository, ".tmp", "nsis-fixture-4ad81d73");
const manifestPath = join(runRoot, "fixture.json");
const within = (root, candidate) => { const value = relative(root, candidate); return value && value !== ".." && !value.startsWith("..\\") && !value.startsWith("../") && !isAbsolute(value); };
export function parseFixtureArguments(argv) {
  const [action, ...arguments_] = argv;
  if (!["prepare", "audit", "build", "inspect"].includes(action)) throw new Error("Use prepare, audit, build or inspect (no install/launch command)");
  const options = { action };
  for (const item of arguments_) {
    const match = /^--(qkrpc-dir|rg-exe|builder-cache|version)=(.+)$/.exec(item);
    if (!match || options[match[1]]) throw new Error("Unknown or duplicate fixture option");
    options[match[1]] = match[2];
  }
  if (action === "prepare" && (!options["qkrpc-dir"] || !options["rg-exe"] || !options["builder-cache"])) throw new Error("prepare requires explicit known program sources");
  if (["audit", "build"].includes(action) && !NSIS_FIXTURE_IDENTITY.versions.includes(options.version)) throw new Error("Only the two fixture versions are accepted");
  return options;
}
function metadata(paths, trees = false) {
  const result = spawnSync("pwsh", ["-NoProfile", "-File", join(project, "scripts/Assert-NsisFixturePaths.ps1"), "-PathsJson", JSON.stringify(paths), ...(trees ? ["-Trees"] : [])],
    { windowsHide: true, encoding: "utf8", timeout: 60000 });
  if (result.status !== 0) throw new Error(`Fixture metadata rejected: ${result.stderr || result.stdout}`);
}
function safeOwned(path) {
  if (!within(join(repository, ".tmp"), path) || !within(runRoot, path)) throw new Error("Fixture path escaped its unique repository .tmp");
  metadata([path]); return path;
}
function sanitizeEnvironment() {
  const keep = new Set(["SystemRoot", "SystemDrive", "ComSpec", "PATH", "PATHEXT", "PROCESSOR_ARCHITECTURE", "NUMBER_OF_PROCESSORS", "WINDIR"].map((name) => name.toLowerCase()));
  for (const name of Object.keys(process.env)) if (!keep.has(name.toLowerCase())) delete process.env[name];
  for (const [name, suffix] of Object.entries({ APPDATA: "environment/roaming", LOCALAPPDATA: "environment/local", USERPROFILE: "environment/home", HOME: "environment/home", TEMP: "temp", TMP: "temp" })) {
    const directory = safeOwned(join(runRoot, suffix)); mkdirSync(directory, { recursive: true }); process.env[name] = directory;
  }
  process.env.ELECTRON_BUILDER_CACHE = join(runRoot, "tool-cache");
  process.env.CSC_IDENTITY_AUTO_DISCOVERY = "false";
}
function assertProgramSource(directory) {
  metadata([directory], true);
  function inspect(folder) {
    for (const entry of readdirSync(folder, { withFileTypes: true })) {
      if (entry.isSymbolicLink() || /^(?:\.local|local|cache|plugins|agent\.db(?:.*)?|llm[-.].*config.*|.*\.(?:sqlite|db))$/i.test(entry.name)) throw new Error("Fixture source contains user data or configuration");
      if (entry.isDirectory()) inspect(join(folder, entry.name));
    }
  }
  inspect(directory);
}
function writeJson(path, value) { writeFileSync(path, JSON.stringify(value, null, 2) + "\n"); }
function preparePreprocessorTools() {
  const original = join(runRoot, "tool-cache/nsis/nsis-3.0.4.1"), preprocessing = join(runRoot, "preprocess-tool/nsis");
  safeOwned(preprocessing); cpSync(original, preprocessing, { recursive: true });
  // NSIS 3.0.4.1 /PPO prints !addplugindir without executing it and scans its
  // default ANSI search path. This separate parser-only tool copy exposes the
  // same public Unicode plugin exports there. The real compiler tool/cache and
  // script remain unchanged and still select x86-unicode normally.
  const plugins = join(runRoot, "tool-cache/nsis/nsis-resources-3.4.1/plugins/x86-unicode");
  for (const entry of readdirSync(plugins, { withFileTypes: true })) {
    if (entry.isFile() && entry.name.endsWith(".dll")) cpSync(join(plugins, entry.name), join(preprocessing, "Plugins/x86-ansi", entry.name));
  }
  writeJson(join(runRoot, "preprocess-tool/provenance.json"), { mode: "PPO syntax only; never compiles or executes setup", compilerSource: original,
    pluginSource: plugins, realBuildCacheUnmodified: true, plugins: readdirSync(plugins).filter((name) => name.endsWith(".dll")).map((name) => ({ name, sha256: sha(readFileSync(join(plugins, name))) })) });
}
function createSyntheticData(directory, runtimeRoot) {
  mkdirSync(join(directory, "local"), { recursive: true }); mkdirSync(join(directory, "plugins"), { recursive: true }); mkdirSync(join(directory, "cache"), { recursive: true });
  const Database = createRequire(join(runtimeRoot, "package.json"))("better-sqlite3");
  const db = new Database(join(directory, "local/agent.db"));
  db.exec("CREATE TABLE fixture_sentinel (identity TEXT PRIMARY KEY, value TEXT NOT NULL)");
  db.prepare("INSERT INTO fixture_sentinel VALUES (?, ?)").run(NSIS_FIXTURE_ID, "synthetic existing data: must survive overlay"); db.close();
  writeFileSync(join(directory, "plugins/fixture-sentinel.txt"), "generated fixture plugin data\n");
  writeFileSync(join(directory, "cache/fixture-sentinel.txt"), "generated fixture cache data\n");
  return Object.fromEntries(["local/agent.db", "plugins/fixture-sentinel.txt", "cache/fixture-sentinel.txt"].map((file) => [file, sha(readFileSync(join(directory, file)))]));
}
export async function prepareNsisFixture(options) {
  if (process.platform !== "win32") throw new Error("Windows fixture only");
  metadata([repository, runRoot]);
  if (existsSync(runRoot)) throw new Error("Refusing to reuse an existing fixture root; evidence is retained");
  const sources = { qkrpc: realpathSync(options["qkrpc-dir"]), rg: realpathSync(options["rg-exe"]), node: realpathSync(process.execPath),
    electron: realpathSync(join(project, "node_modules/electron-binary/dist")), cache: realpathSync(options["builder-cache"]) };
  assertProgramSource(sources.qkrpc); metadata([sources.rg, sources.node, sources.electron], true);
  for (const component of ["nsis/nsis-3.0.4.1", "nsis/nsis-resources-3.4.1"]) metadata([join(sources.cache, component)], true);
  if (!existsSync(join(sources.qkrpc, "qkrpc.exe")) || statSync(join(sources.qkrpc, "Microsoft.AspNetCore.Server.Kestrel.Core.dll")).size < 100000) throw new Error("Incomplete explicit qkrpc runtime");
  mkdirSync(runRoot); sanitizeEnvironment();
  const resources = safeOwned(join(runRoot, "resources")), buildResources = safeOwned(join(runRoot, "build"));
  mkdirSync(buildResources); mkdirSync(resources);
  const { buildStaticRuntime, stageRuntimePackages } = await import("./build-static-runtime.mjs");
  const report = await buildStaticRuntime({ outputDirectory: join(resources, "app") });
  for (const [source, target] of [[sources.qkrpc, "qkrpc"], [sources.node, "node/node.exe"], [sources.rg, "rg/rg.exe"]]) {
    mkdirSync(dirname(join(resources, target)), { recursive: true }); cpSync(source, join(resources, target), { recursive: true });
  }
  const { verifyStaticRuntime } = await import("./verify-static-runtime.mjs");
  const verified = await verifyStaticRuntime(join(resources, "app"), { nodeExecutable: join(resources, "node/node.exe"), desktop: true });
  for (const component of ["nsis-3.0.4.1", "nsis-resources-3.4.1"]) cpSync(join(sources.cache, "nsis", component), join(runRoot, "tool-cache/nsis", component), { recursive: true });
  preparePreprocessorTools();
  for (const file of ["installerIcon.ico"]) { metadata([join(project, "electron/build", file)]); cpSync(join(project, "electron/build", file), join(buildResources, file)); }
  const { stageElectronShell } = await import("./electron-shell-staging.mjs");
  for (const version of NSIS_FIXTURE_IDENTITY.versions) stageElectronShell({ version, packageName: NSIS_FIXTURE_IDENTITY.packageName,
    outputDirectory: join(runRoot, "shell", version), installDependencies: (directory) => stageRuntimePackages(["electron-updater"], directory) });
  mkdirSync(join(runRoot, "builder-project"));
  writeJson(join(runRoot, "builder-project/package.json"), { name: NSIS_FIXTURE_IDENTITY.packageName, version: "0.0.1", private: true,
    description: "Isolated NSIS acceptance fixture", author: "Quicker" });
  const hashes = createSyntheticData(join(runRoot, "userdata-source"), join(resources, "app"));
  const identity = { ...NSIS_FIXTURE_IDENTITY, format: "quicker-agent-nsis-fixture-v1", runRoot, directory: join(runRoot, "installed"),
    cacheDirectory: join(runRoot, "installer-cache"), stubDirectory: join(runRoot, "stub-out"), buildResources, resources,
    registryKeys: [`Software\\${NSIS_FIXTURE_ID}`, `Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\${NSIS_FIXTURE_ID}`],
    sources, sourceHashes: { node: sha(readFileSync(sources.node)), rg: sha(readFileSync(sources.rg)), qkrpc: sha(readFileSync(join(sources.qkrpc, "qkrpc.exe"))) },
    syntheticDataHashes: hashes, staticRuntime: report, verified, commands: { finalSetupExecuted: false, trueUninstallerExecuted: false } };
  for (const path of [identity.directory, identity.cacheDirectory, identity.stubDirectory]) { safeOwned(path); mkdirSync(path, { recursive: true }); }
  writeJson(manifestPath, identity); return identity;
}
function readManifest() {
  metadata([manifestPath]); const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  if (manifest.format !== "quicker-agent-nsis-fixture-v1" || manifest.guid !== NSIS_FIXTURE_ID || manifest.runRoot !== runRoot || manifest.directory !== join(runRoot, "installed")) throw new Error("Unknown fixture identity");
  for (const name of ["guid", "appId", "productName", "packageName"]) if (manifest[name] !== NSIS_FIXTURE_IDENTITY[name]) throw new Error("Changed fixture product identity");
  for (const [name, suffix] of Object.entries({ directory: "installed", cacheDirectory: "installer-cache", stubDirectory: "stub-out", resources: "resources", buildResources: "build" })) {
    if (manifest[name] !== join(runRoot, suffix)) throw new Error("Changed fixture path identity");
    safeOwned(manifest[name]);
  }
  return manifest;
}
export function fixtureBuilderConfig(manifest, version) {
  if (!NSIS_FIXTURE_IDENTITY.versions.includes(version)) throw new Error("Unknown fixture version");
  const pkg = JSON.parse(readFileSync(join(project, "package.json"), "utf8"));
  return { ...pkg.build, appId: manifest.appId, productName: manifest.productName, publish: null, compression: "store", electronDist: manifest.sources.electron,
    extraMetadata: { name: manifest.packageName, version },
    directories: { app: join(runRoot, "shell", version), output: join(runRoot, "output", version), buildResources: manifest.buildResources },
    extraResources: [{ from: manifest.resources, to: ".", filter: ["**/*"] }, { from: join(project, "src-tauri/icons/icon.ico"), to: "app-icon.ico" }],
    nsis: { ...pkg.build.nsis, guid: manifest.guid, shortcutName: manifest.productName, menuCategory: manifest.productName,
      uninstallDisplayName: manifest.productName, artifactName: "nsis-fixture-4ad81d73-${version}-setup.${ext}",
      createDesktopShortcut: false, createStartMenuShortcut: false, runAfterFinish: false, allowElevation: false,
      deleteAppDataOnUninstall: false, differentialPackage: false } };
}
const AUDIT_DONE = "NSIS_FIXTURE_PREPROCESS_COMPLETE";
function assertNoOldUninstallerDispatch(script) {
  const functions = [...script.matchAll(/^Function ["']?uninstallOldVersion["']?\r?\n([^]*?)^FunctionEnd\s*$/gim)];
  if (functions.length > 1 || /^\s*(?:Call\s+["']?uninstallOldVersion["']?(?:\s|$)|GetFunctionAddress\s+\S+\s+["']?uninstallOldVersion["']?(?:\s|$))/im.test(script))
    throw new Error("Fixture retained an old-uninstaller dispatch/address or duplicate function");
  const knownWaits = [
    'ExecWait \'"$uninstallerFileNameTemp" /S /KEEP_APP_DATA $0 _?=$installationDir\' $R0',
    'ExecWait \'"$uninstallerFileName" /S /KEEP_APP_DATA $0 _?=$installationDir\' $R0',
  ];
  const fn = functions[0];
  const waits = [...script.matchAll(/^\s*ExecWait[^\r\n]*/gim)].filter((match) => /uninstall/i.test(match[0]));
  if (waits.length && (!fn || waits.length !== 2 || waits.some((wait, index) => wait.index < fn.index || wait.index >= fn.index + fn[0].length || wait[0].trim() !== knownWaits[index])))
    throw new Error("Fixture retained an unknown or reachable old-uninstaller wait");
}
export function assertFixturePreprocessed(script, manifest, { stub, uninstallerOutput } = {}) {
  if (/CreateShortCut|WinShell::|SHChangeNotify|ExecShellAsUser/.test(script)) throw new Error("Fixture preprocessing retained shell/start effects");
  // Upstream emits this unreferenced function into PPO; NSIS subsequently
  // removes it. Only its two exact existing waits are allowed, with no address
  // or Call referencing the function. This never authorizes executing it.
  assertNoOldUninstallerDispatch(script);
  for (const match of script.matchAll(/^\s*(?:WriteReg\w+|DeleteRegKey)\s+\S+\s+"([^"]+)"/gm))
    if (!manifest.registryKeys.includes(match[1])) throw new Error("Fixture preprocessing retained a foreign registry write");
  const initialization = /Function \.onInit\r?\n([^]*?)FunctionEnd/.exec(script)?.[1];
  if (!initialization) throw new Error("Fixture .onInit is unavailable");
  const fixed = (stub ? manifest.stubDirectory : manifest.directory).replaceAll("/", "\\");
  if (!initialization.includes(`StrCpy $INSTDIR "${fixed}"`) || initialization.indexOf("StrCpy $INSTDIR") > initialization.indexOf("SetOutPath $INSTDIR")) throw new Error("Fixture initial output is not confined");
  if (stub && (/WriteReg|DeleteReg|CreateShortCut|nsExec::|ExecShell|Call (?!setInstallSectionSpaceRequired)/.test(initialization)
      || !initialization.includes(`WriteUninstaller "${uninstallerOutput}"`))) throw new Error("Builder uninstaller-generation stub retained an external action");
  return initialization;
}
export async function buildNsisFixture(options) {
  const manifest = readManifest(); sanitizeEnvironment();
  const { runElectronInstaller, loadInstallerBuildApi } = await import("./build-electron-installer.mjs");
  const { installIsolatedNsisFixtureAdapter } = await import("./nsis-fixture-template.mjs");
  const { buildInstallerOwnershipHelper } = await import("./build-installer-ownership-helper.mjs");
  const { api, Target } = loadInstallerBuildApi();
  const builderRoot = dirname(require.resolve("app-builder-lib/package.json"));
  const originalExecute = Target.prototype.executeMakensis;
  Target.prototype.executeMakensis = async function(defines, commands, script) {
    const stub = "BUILD_UNINSTALLER" in defines;
    if (options.action === "audit" && !stub) throw new Error("Expected the signed uninstaller generation pass first");
    for (const [key, expected] of Object.entries({ APP_ID: manifest.appId, APP_GUID: manifest.guid, PRODUCT_NAME: manifest.productName }))
      if (String(defines[key]).toLowerCase() !== expected.toLowerCase()) throw new Error(`Fixture builder changed ${key}`);
    for (const key of ["DO_NOT_CREATE_DESKTOP_SHORTCUT", "DO_NOT_CREATE_START_MENU_SHORTCUT", "HIDE_RUN_AFTER_FINISH"]) if (!(key in defines)) throw new Error("Fixture builder did not disable shortcuts/finish launch");
    const directory = safeOwned(join(runRoot, options.action === "audit" ? "audit" : "build-records", options.version, stub ? "stub" : "installer")); mkdirSync(directory, { recursive: true });
    safeOwned(defines.UNINSTALLER_OUT_FILE); safeOwned(commands.OutFile.replaceAll('"', ""));
    writeFileSync(join(directory, "builder.nsi"), script); writeJson(join(directory, "defines.json"), defines); writeJson(join(directory, "commands.json"), commands);
    const args = ["/PPO", "/INPUTCHARSET", "UTF8"];
    for (const [name, value] of Object.entries(defines)) args.push(value == null ? `/D${name}` : `/D${name}=${value}`);
    for (const [name, value] of Object.entries(commands)) for (const item of Array.isArray(value) ? value : [value]) args.push(`/X${name} ${item}`);
    args.push("-");
    const nsisRoot = join(runRoot, "preprocess-tool/nsis");
    const result = spawnSync(join(nsisRoot, "Bin/makensis.exe"), args, { input: script, cwd: join(builderRoot, "templates/nsis"), env: { ...process.env, NSISDIR: nsisRoot }, windowsHide: true, encoding: "utf8", timeout: 60000, maxBuffer: 32 * 1024 * 1024 });
    writeFileSync(join(directory, "builder.preprocessed.nsi"), result.stdout ?? ""); writeFileSync(join(directory, "preprocess.stderr.log"), result.stderr ?? "");
    if (result.status !== 0) throw new Error(`NSIS preprocessing failed: ${result.stderr}`);
    const initialization = assertFixturePreprocessed(result.stdout, manifest, { stub, uninstallerOutput: defines.UNINSTALLER_OUT_FILE });
    writeFileSync(join(directory, "onInit.nsh"), initialization);
    if (options.action === "audit") throw new Error(AUDIT_DONE);
    return originalExecute.call(this, defines, commands, script);
  };
  try {
    await runElectronInstaller(["--win", "nsis", "--x64", "--publish", "never"], { root: project, api: { ...api, async build(base) {
      const config = fixtureBuilderConfig(manifest, options.version);
      // Retain the actual production before/after payload+icon gate.
      // A fresh config project avoids builder concatenating the production
      // extraResources array with this fixture's (concurrent duplicate copies).
      // It still packages the shared shell/statically built real application.
      return api.build({ ...base, projectDir: join(runRoot, "builder-project"), config: { ...config, afterPack: base.config.afterPack } });
    } }, Target,
    installAdapter(target, inputs) {
      const adapter = installIsolatedNsisFixtureAdapter(target, inputs, { ...manifest,
        customIncludeSource: readFileSync(join(project, "electron/build/installer.nsh"), "utf8"),
        payloadIncludeSource: readFileSync(join(builderRoot, "templates/nsis/include/installer.nsh"), "utf8"),
        generatedPayloadIncludePath: join(manifest.buildResources, "fixture-payload.nsh") });
      writeFileSync(join(manifest.buildResources, "installer.nsh"), adapter.generatedCustomInclude);
      writeFileSync(join(manifest.buildResources, "fixture-payload.nsh"), adapter.generatedPayloadInclude);
      return adapter;
    }, async compileHelper() { cpSync(await buildInstallerOwnershipHelper(project), join(manifest.buildResources, "installer-helper.exe")); } });
  } catch (error) { if (options.action !== "audit" || error.message !== AUDIT_DONE) throw error; }
  finally { Target.prototype.executeMakensis = originalExecute; }
  if (options.action === "build") {
    const output = join(runRoot, "output", options.version), setup = join(output, `nsis-fixture-4ad81d73-${options.version}-setup.exe`);
    safeOwned(setup); metadata([output], true);
    writeJson(join(output, "artifact-receipt.json"), { guid: manifest.guid, appId: manifest.appId, productName: manifest.productName, version: options.version,
      setup, setupSha256: sha(readFileSync(setup)), bytes: statSync(setup).size,
      unpackedExeSha256: sha(readFileSync(join(output, "win-unpacked/quicker-agent.exe"))),
      finalSetupExecuted: false, trueUninstallerExecuted: false, builderUninstallerGenerationStubExecuted: true });
  }
  return { ok: true, action: options.action, version: options.version, finalSetupExecuted: false, trueUninstallerExecuted: false, directory: manifest.directory };
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const options = parseFixtureArguments(process.argv.slice(2));
  (options.action === "prepare" ? prepareNsisFixture(options) : options.action === "inspect" ? Promise.resolve(readManifest()) : buildNsisFixture(options))
    .then((result) => console.log(JSON.stringify(result, null, 2))).catch((error) => { console.error(error); process.exitCode = 1; });
}
