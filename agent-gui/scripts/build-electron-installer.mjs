import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { readFile, writeFile, mkdtemp, mkdir, readdir, realpath } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { installPinnedNsisOverlayAdapter } from "./nsis-overlay-template.mjs";
import { buildInstallerOwnershipHelper, isWithinInstallerWorkspace } from "./build-installer-ownership-helper.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), ".."), require = createRequire(import.meta.url);
const payloadPolicy = JSON.parse(readFileSync(new URL("../electron/build/installer-helper/payload-policy.json", import.meta.url), "utf8"));
const isCloudDirectory = (name) => payloadPolicy.cloudDirectories.some((pattern) => pattern.endsWith("*") ? name.toLowerCase().startsWith(pattern.slice(0, -1)) : name.toLowerCase() === pattern);
export function loadInstallerBuildApi() {
  // Initialize the public entry first. Loading NsisTarget directly first creates
  // a platformPackager/index circular import in the pinned builder version.
  const api = require("electron-builder");
  return { api, Target: require("app-builder-lib/out/targets/nsis/NsisTarget.js").NsisTarget };
}
export function parseInstallerArguments(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index++) {
    if (argv[index] === "--win" && argv[index + 1] === "nsis") { index++; continue; }
    if (argv[index] === "--x64") continue;
    if (argv[index].startsWith("--config.directories.output=")) { options.output = argv[index].slice(28); continue; }
    if (argv[index] === "--publish" && ["never", "always", "onTag", "onTagOrDraft"].includes(argv[index + 1])) { options.publish = argv[++index]; continue; }
    throw new Error(`Unsupported installer argument: ${argv[index]}`);
  }
  return options;
}
export function verifyInstallerPayloadPaths(paths) {
  const roots = new Set(payloadPolicy.files), seen = new Set();
  for (const raw of paths) {
    const name = raw.replaceAll("\\", "/").toLowerCase(), first = name.split("/")[0];
    if (!name || name.startsWith("/") || name.split("/").some((part) => !part || part === ".." || part === ".") || seen.has(name)) throw new Error("Invalid or conflicting installer payload path");
    if (name.split("/").slice(0, -1).some(isCloudDirectory)) throw new Error("Installer payload cloud directories are not traversed");
    seen.add(name);
    if (payloadPolicy.directories.includes(first)) continue;
    if (name.includes("/") || (!roots.has(name) && !payloadPolicy.extensions.some((extension) => name.endsWith(extension)) && !payloadPolicy.patterns.some((pattern) => new RegExp(pattern).test(name))))
      throw new Error(`Installer payload overlaps an unowned/user-data path: ${raw}`);
  }
}
async function verifyPayloadTree(directory) {
  const paths = [];
  async function walk(folder, prefix = "") {
    for (const entry of await readdir(folder, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) throw new Error("Installer payload links require a separate ownership review");
      const name = prefix + entry.name;
      if (entry.isDirectory()) {
        if ((!prefix && !payloadPolicy.directories.includes(name.toLowerCase())) || isCloudDirectory(entry.name)) throw new Error("Installer payload contains an unowned/user-data or cloud directory");
        verifyInstallerPayloadPaths([name]); await walk(join(folder, entry.name), name + "/");
      }
      else if (entry.isFile()) {
        if (!prefix && payloadPolicy.directories.includes(name.toLowerCase())) throw new Error("Installer resource directory became a file");
        paths.push(name);
      }
      else throw new Error("Unknown installer payload entry");
    }
  }
  await walk(directory); verifyInstallerPayloadPaths(paths);
}
export async function runElectronInstaller(argv, dependencies = {}) {
  const options = parseInstallerArguments(argv), project = await realpath(dependencies.root ?? root);
  const pkg = JSON.parse(await readFile(join(project, "package.json"), "utf8"));
  if (pkg.build.nsis.script || pkg.build.afterPack !== "scripts/patch-electron-exe-icon.mjs" || pkg.build.nsis.perMachine !== false)
    throw new Error("Custom installer scripts/hooks or machine-wide installation require a separate review");
  const builderRoot = dependencies.builderRoot ?? dirname(require.resolve("app-builder-lib/package.json"));
  const version = JSON.parse(await readFile(join(builderRoot, "package.json"), "utf8")).version;
  const repository = await realpath(resolve(project, "..")), temporaryParent = join(repository, ".tmp"); await mkdir(temporaryParent, { recursive: true });
  const canonicalTemporary = await realpath(temporaryParent);
  if (!isWithinInstallerWorkspace(repository, canonicalTemporary)) throw new Error("NSIS generated includes escaped the repository");
  const temporary = await mkdtemp(join(canonicalTemporary, "nsis-overlay-"));
  const input = { builderVersion: version, mainTemplate: await readFile(join(builderRoot, "templates/nsis/installer.nsi"), "utf8"),
    installSection: await readFile(join(builderRoot, "templates/nsis/installSection.nsh"), "utf8"),
    assistedInstaller: await readFile(join(builderRoot, "templates/nsis/assistedInstaller.nsh"), "utf8"),
    multiUser: await readFile(join(builderRoot, "templates/nsis/multiUser.nsh"), "utf8"),
    uninstaller: await readFile(join(builderRoot, "templates/nsis/uninstaller.nsh"), "utf8"),
    installUtilities: await readFile(join(builderRoot, "templates/nsis/include/installUtil.nsh"), "utf8"),
    generatedSectionPath: join(temporary, "installSection.nsh"), generatedAssistedPath: join(temporary, "assistedInstaller.nsh"),
    generatedMultiUserPath: join(temporary, "multiUser.nsh"), generatedUninstallerPath: join(temporary, "uninstaller.nsh"), generatedInstallUtilitiesPath: join(temporary, "installUtil.nsh") };
  const loaded = dependencies.Target && dependencies.api ? dependencies : loadInstallerBuildApi();
  const Target = dependencies.Target ?? loaded.Target;
  const adapter = (dependencies.installAdapter ?? installPinnedNsisOverlayAdapter)(Target, input);
  try {
    await writeFile(input.generatedSectionPath, adapter.generatedSection);
    await writeFile(input.generatedAssistedPath, adapter.generatedLayout.assisted);
    await writeFile(input.generatedMultiUserPath, adapter.generatedLayout.multiUser);
    await writeFile(input.generatedUninstallerPath, adapter.generatedLayout.uninstaller);
    await writeFile(input.generatedInstallUtilitiesPath, adapter.generatedInstallUtilities);
    await (dependencies.compileHelper ?? buildInstallerOwnershipHelper)(project);
    const api = dependencies.api ?? loaded.api;
    const afterPack = dependencies.afterPack ?? (await import(pathToFileURL(join(project, pkg.build.afterPack)).href)).default;
    return await api.build({ projectDir: project, targets: api.Platform.WINDOWS.createTarget(["nsis"], api.Arch.x64), ...(options.publish ? { publish: options.publish } : {}),
      config: { directories: { output: options.output ?? pkg.build.directories.output }, afterPack: async (context) => {
        await verifyPayloadTree(context.appOutDir); await afterPack(context); await verifyPayloadTree(context.appOutDir);
      } } });
  } finally { adapter.restore(); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  runElectronInstaller(process.argv.slice(2)).catch((error) => { console.error(error); process.exitCode = 1; });
}
