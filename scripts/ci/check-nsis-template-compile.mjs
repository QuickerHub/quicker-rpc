import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { copyFile, lstat, mkdir, mkdtemp, readFile, realpath, stat, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { loadInstallerBuildApi, runElectronInstaller, verifyInstallerPayloadPaths } from "../../agent-gui/scripts/build-electron-installer.mjs";
import { buildInstallerOwnershipHelper } from "../../agent-gui/scripts/build-installer-ownership-helper.mjs";
import { installPinnedNsisOverlayAdapter, PINNED_NSIS_BUILDER } from "../../agent-gui/scripts/nsis-overlay-template.mjs";

const repository = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const agentRoot = join(repository, "agent-gui");
const require = createRequire(join(agentRoot, "package.json"));
export const COMPILE_IDENTITY = Object.freeze({
  appId: "ci.quicker.nsiscompile.7d701ef1", guid: "7d701ef1-61bc-42b5-903c-32ef5be97db3",
  productName: "NSIS Compile Fixture 7d701ef1", packageName: "nsis-compile-fixture-7d701ef1",
});
// Pin the narrow upstream handoff we replace and its non-executing PE reader.
export const PINNED_COMPILE_METHODS = Object.freeze({
  handoff: "d8a3f13889d00d88fc6ebdf1e055d21be082f5d32c52af787e7dea14210c22f7",
  reader: "51276c896ed722c1a8b4eb00435648c0510c0714a8b4f6408a8b7a6d3c9c82f3",
});
export const PINNED_NSIS_TOOLS = Object.freeze([
  { name: "nsis", version: "3.0.4.1", sha512: "VKMiizYdmNdJOWpRGz4trl4lD++BvYP2irAXpMilheUP0pc93iKlWAoP843Vlraj8YG19CVn0j+dCo/hURz9+Q==" },
  { name: "nsis-resources", version: "3.4.1", sha512: "Dqd6g+2buwwvoG1Vyf6BHR1b+25QMmPcwZx40atOT57gH27rkjOei1L0JTldxZu4NFoEmW4kJgZ3DlSWVON3+Q==" },
]);
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const methodHash = (method) => sha256(method.toString().replaceAll("\r\n", "\n"));
const writeJson = (path, value) => writeFile(path, JSON.stringify(value, null, 2) + "\n");

export function assertCompileOutput(root, path) {
  const suffix = relative(root, path);
  if (!isAbsolute(path) || !suffix || suffix === ".." || suffix.startsWith(".." + sep) || isAbsolute(suffix))
    throw new Error("NSIS compile output escaped its fresh fixture directory");
  return path;
}

/** Both scripts still come from the real builder and production adapter.
 * Only its Windows execute-stub/sign handoff is replaced by upstream PE parsing.
 * No executable fallback is permitted if extraction fails. */
export function installCompileOnlyHandoff(Target, { readScript, extractUninstaller, assertOutput, recordExtraction }) {
  const original = Target.prototype.computeScriptAndSignUninstaller;
  if (methodHash(original) !== PINNED_COMPILE_METHODS.handoff || methodHash(extractUninstaller) !== PINNED_COMPILE_METHODS.reader)
    throw new Error("Pinned NSIS compile handoff/reader changed; review before compiling");
  const signers = new Map();
  async function compileOnly(defines, commands, installerPath, sharedHeader, archs) {
    if (this.options.script || this.options.warningsAsErrors !== true) throw new Error("Compile fixture requires the default template and /WX");
    assertOutput(installerPath);
    if (!signers.has(this.packager)) {
      signers.set(this.packager, this.packager.sign);
      // Compile-only artifacts must not discover certificates or invoke signing hooks.
      this.packager.sign = async (path) => { assertOutput(path); };
    }
    const script = await readScript();
    const uninstaller = assertOutput(join(this.outDir, "compile-only-uninstaller.exe"));
    defines.BUILD_UNINSTALLER = null;
    defines.UNINSTALLER_OUT_FILE = uninstaller;
    await this.executeMakensis(defines, commands, sharedHeader + await this.computeFinalScript(script, false, archs));
    await extractUninstaller(installerPath, uninstaller);
    await recordExtraction(installerPath, uninstaller);
    delete defines.BUILD_UNINSTALLER;
    return script;
  }
  Target.prototype.computeScriptAndSignUninstaller = compileOnly;
  return { restore() {
    for (const [packager, sign] of signers) packager.sign = sign;
    if (Target.prototype.computeScriptAndSignUninstaller !== compileOnly) throw new Error("NSIS compile handoff ownership changed");
    Target.prototype.computeScriptAndSignUninstaller = original;
  } };
}

export function hasUnusedFunctionWarning(diagnostic, functionName) {
  return [...diagnostic.matchAll(/^warning[\t ]+6010:[\t ]*(?:install|uninstall) function "([^"\r\n]+)" not referenced\b/gim)]
    .some((match) => match[1] === functionName);
}

async function expectUnusedFunctionFailure({ target, compile, input, run, name, functionName, script }) {
  const commands = { ...input.commands, OutFile: `"${join(run, `${name}.exe`)}"` };
  await writeFile(join(run, `${name}.nsi`), script);
  let failure;
  try { await compile.call(target, input.defines, commands, script); }
  catch (error) { failure = error; }
  const diagnostic = failure?.stack ?? String(failure ?? "Compiler unexpectedly accepted the unused function");
  await writeFile(join(run, `${name}.log`), diagnostic);
  if (!failure || !hasUnusedFunctionWarning(diagnostic, functionName))
    throw new Error(`NSIS /WX negative control did not reject 6010 ${functionName}: ${diagnostic}`);
  return { name, warning: 6010, functionName, rejected: true };
}

async function ownedDirectory(parent, name) {
  const path = join(parent, name);
  await mkdir(path, { recursive: true });
  if ((await lstat(path)).isSymbolicLink() || relative(path, await realpath(path))) throw new Error("NSIS compile directories cannot be links");
  return path;
}

export async function checkNsisTemplateCompile() {
  if (process.platform !== "win32") throw new Error("Real NSIS template compilation requires Windows");
  const canonicalRepository = await realpath(repository);
  const temporary = await ownedDirectory(canonicalRepository, ".tmp");
  const outputRoot = await ownedDirectory(temporary, "nsis-template-compile");
  const run = await mkdtemp(join(outputRoot, "run-"));
  const assertOutput = (path) => assertCompileOutput(run, path);
  const cache = await ownedDirectory(temporary, "nsis-compile-cache");
  // Tool downloads use the pinned SHA512 checks below; no user tool/cache override.
  for (const name of Object.keys(process.env)) {
    if (/^(?:ELECTRON_BUILDER_NSIS_DIR|ELECTRON_BUILDER_BINARIES_|(?:NPM_CONFIG_|npm_config_|npm_package_config_)electron_builder_binaries_|(?:WIN_)?CSC_)/i.test(name)) delete process.env[name];
  }
  process.env.ELECTRON_BUILDER_CACHE = cache;
  process.env.CSC_IDENTITY_AUTO_DISCOVERY = "false";
  process.env.APP_BUILDER_TMP_DIR = await ownedDirectory(run, "builder-tmp");
  process.env.TEMP = process.env.APP_BUILDER_TMP_DIR;
  process.env.TMP = process.env.APP_BUILDER_TMP_DIR;
  const receipt = { builderVersion: PINNED_NSIS_BUILDER, tools: PINNED_NSIS_TOOLS, identity: COMPILE_IDENTITY, run,
    passes: [], generationStubExecuted: false, setupExecuted: false, uninstallerExecuted: false, signed: false };
  let handoff;
  let Target;
  let originalExecute;
  let finalInput;
  let compilerInputs;
  let compilerTarget;
  try {
    const loaded = loadInstallerBuildApi();
    Target = loaded.Target;
    const builderRoot = dirname(require.resolve("app-builder-lib/package.json"));
    if (JSON.parse(await readFile(join(builderRoot, "package.json"), "utf8")).version !== PINNED_NSIS_BUILDER) throw new Error("Unexpected NSIS builder version");
    const { UninstallerReader } = require("app-builder-lib/out/targets/nsis/nsisUtil.js");
    const { getBinFromUrl } = require("app-builder-lib/out/binDownload.js");
    const toolSources = await readFile(join(builderRoot, "out/targets/nsis/nsisUtil.js"), "utf8") + await readFile(join(builderRoot, "out/targets/nsis/NsisTarget.js"), "utf8");
    for (const tool of PINNED_NSIS_TOOLS) {
      if (!toolSources.includes(`getBinFromUrl)("${tool.name}", "${tool.version}", "${tool.sha512}")`)) throw new Error("Pinned NSIS tool download contract changed");
      await getBinFromUrl(tool.name, tool.version, tool.sha512);
    }
    const project = await ownedDirectory(run, "project"), resources = await ownedDirectory(run, "build-resources");
    const payload = await ownedDirectory(run, "payload"), output = await ownedDirectory(run, "output");
    await writeJson(join(project, "package.json"), { name: COMPILE_IDENTITY.packageName, version: "0.0.1", private: true,
      description: "Compile-only synthetic NSIS payload", author: "Quicker" });
    await copyFile(join(agentRoot, "electron/build/installer.nsh"), join(resources, "installer.nsh"));
    await copyFile(join(agentRoot, "src-tauri/icons/icon.ico"), join(resources, "installerIcon.ico"));
    const pkg = JSON.parse(await readFile(join(agentRoot, "package.json"), "utf8"));
    if (pkg.build.nsis.customNsisBinary || pkg.build.nsis.customNsisResources) throw new Error("Custom NSIS tools require a separate compiler review");
    async function checkNegativeControls() {
      // Modify disposable includes only. Arbitrary syntax/missing-file errors
      // cannot satisfy these controls. Run before builder cleans its message files.
      const assisted = join(run, "unused-StrContains.nsh");
      await writeFile(assisted, '!include "StrContains.nsh"\n' + await readFile(compilerInputs.generatedAssistedPath, "utf8"));
      const replaceInclude = (from, to) => {
        const anchor = `!include "${from.replaceAll("/", "\\")}"`;
        if (finalInput.script.split(anchor).length !== 2) throw new Error("NSIS regression include anchor changed");
        return finalInput.script.replace(anchor, `!include "${to.replaceAll("/", "\\")}"`);
      };
      const shared = { target: compilerTarget, compile: originalExecute, input: finalInput, run };
      receipt.negativeControls = [
        await expectUnusedFunctionFailure({ ...shared, name: "reject-StrContains", functionName: "StrContains",
          script: replaceInclude(compilerInputs.generatedAssistedPath, assisted) }),
        await expectUnusedFunctionFailure({ ...shared, name: "reject-handleUninstallResult", functionName: "handleUninstallResult",
          script: replaceInclude(compilerInputs.generatedInstallUtilitiesPath, join(builderRoot, "templates/nsis/include/installUtil.nsh")) }),
      ];
    }
    originalExecute = Target.prototype.executeMakensis;
    Target.prototype.executeMakensis = async function(defines, commands, script) {
      const pass = "BUILD_UNINSTALLER" in defines ? "uninstaller" : "installer";
      if (pass !== ["uninstaller", "installer"][receipt.passes.length] || this.options.warningsAsErrors !== true) throw new Error("Expected exactly two NSIS /WX compiler passes");
      for (const [key, expected] of Object.entries({ APP_ID: COMPILE_IDENTITY.appId, APP_GUID: COMPILE_IDENTITY.guid, PRODUCT_NAME: COMPILE_IDENTITY.productName }))
        if (defines[key] !== expected) throw new Error(`NSIS compile identity changed: ${key}`);
      const executable = assertOutput(commands.OutFile.replaceAll('"', ""));
      assertOutput(defines.UNINSTALLER_OUT_FILE);
      if (pass === "installer") {
        compilerTarget = this;
        await copyFile(defines.APP_64, join(run, "synthetic-payload.7z"));
        finalInput = { script, commands: structuredClone(commands),
          defines: { ...defines, APP_64: join(run, "synthetic-payload.7z"), UNINSTALLER_OUT_FILE: join(run, "extracted-uninstaller.exe") } };
      }
      await writeFile(join(run, `${pass}.nsi`), script);
      await writeJson(join(run, `${pass}.json`), { defines, commands, warningsAsErrors: true });
      await originalExecute.call(this, defines, commands, script);
      receipt.passes.push({ pass, warningsAsErrors: true, sha256: sha256(await readFile(executable)), bytes: (await stat(executable)).size });
      if (pass === "installer") await checkNegativeControls();
    };
    handoff = installCompileOnlyHandoff(Target, { assertOutput, extractUninstaller: UninstallerReader.exec,
      readScript: () => readFile(join(builderRoot, "templates/nsis/installer.nsi"), "utf8"),
      async recordExtraction(stub, uninstaller) {
        receipt.extractedUninstaller = { sha256: sha256(await readFile(uninstaller)), bytes: (await stat(uninstaller)).size };
        await copyFile(uninstaller, join(run, "extracted-uninstaller.exe"));
        await copyFile(stub, join(run, "uninstaller-generation.exe"));
      } });
    await runElectronInstaller(["--win", "nsis", "--x64", "--publish", "never"], { ...loaded,
      installAdapter(target, inputs) { compilerInputs = inputs; return installPinnedNsisOverlayAdapter(target, inputs); },
      async compileHelper() {
        const helper = await buildInstallerOwnershipHelper(agentRoot);
        await copyFile(helper, join(resources, "installer-helper.exe"));
        await copyFile(helper, join(payload, "quicker-agent.exe"));
        await ownedDirectory(payload, "resources");
        await writeFile(join(payload, "resources/compile-fixture.txt"), "Synthetic compiler input; never execute this package.\n");
        verifyInstallerPayloadPaths(["quicker-agent.exe", "resources/compile-fixture.txt"]);
      },
      api: { ...loaded.api, build: (base) => loaded.api.build({ ...base, projectDir: project, prepackaged: payload, publish: "never",
        config: { extends: null, appId: COMPILE_IDENTITY.appId, productName: COMPILE_IDENTITY.productName, electronVersion: pkg.build.electronVersion,
          directories: { output, buildResources: resources }, npmRebuild: false, compression: "store", publish: null,
          win: { ...pkg.build.win, icon: join(resources, "installerIcon.ico"), signAndEditExecutable: false },
          nsis: { ...pkg.build.nsis, guid: COMPILE_IDENTITY.guid, warningsAsErrors: true, differentialPackage: false,
            shortcutName: COMPILE_IDENTITY.productName, menuCategory: COMPILE_IDENTITY.productName,
            uninstallDisplayName: COMPILE_IDENTITY.productName, artifactName: "compile-only-setup.exe" } } }) },
    });
    if (receipt.passes.length !== 2 || !receipt.extractedUninstaller) throw new Error("Missing real NSIS compiler output");
    await writeJson(join(run, "receipt.json"), { ...receipt, ok: true });
    console.log(`NSIS /WX real compilation passed: two passes, ${receipt.passes.map((pass) => `${pass.pass} ${pass.bytes} bytes`).join(", ")}; both historical 6010 regressions rejected. No generated executable was run.\nReceipt: ${join(run, "receipt.json")}`);
    return receipt;
  } catch (error) {
    await writeFile(join(run, "failure.log"), error.stack ?? String(error));
    await writeJson(join(run, "receipt.json"), { ...receipt, ok: false });
    throw error;
  } finally {
    try { handoff?.restore(); }
    finally { if (originalExecute) Target.prototype.executeMakensis = originalExecute; }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  checkNsisTemplateCompile().catch((error) => { console.error(error); process.exit(1); });
