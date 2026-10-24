import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeRuntimeMode } from "../electron/runtime-mode.mjs";
import { readDesktopBundleSemver } from "./desktop-bundle-prepare.mjs";
import { generateElectronInstallerAssets } from "./generate-electron-installer-assets.mjs";
import { stageElectronShell } from "./electron-shell-staging.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export function parseElectronPrepareArguments(argv) {
  const options = { runtimeMode: "static", reuseApp: false };
  let explicitMode = false;
  for (const arg of argv) {
    if (arg.startsWith("--runtime=") && !explicitMode) { options.runtimeMode = normalizeRuntimeMode(arg.slice(10)); explicitMode = true; }
    else if (arg === "--reuse-app" && !options.reuseApp) options.reuseApp = true;
    else throw new Error(`Unknown or duplicate Electron prepare argument ${arg}; use --runtime=static|legacy-next and --reuse-app`);
  }
  return options;
}

function syncPackageVersion(agentGuiRoot, version) {
  const pkgPath = join(agentGuiRoot, "package.json"), pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
  if (pkg.version !== version) {
    pkg.version = version;
    writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`, "utf8");
    console.log(`package.json version -> ${version}`);
  }
}

export async function prepareElectronBundle(options = {}, dependencies = {}) {
  const runtimeMode = normalizeRuntimeMode(options.runtimeMode);
  const agentGuiRoot = options.agentGuiRoot ?? root, repoRoot = options.repoRoot ?? resolve(agentGuiRoot, "..");
  const ctx = { ...options, agentGuiRoot, repoRoot, resourcesDir: options.resourcesDir ?? join(agentGuiRoot, "electron/resources") };
  console.log(`electron-prepare: staging ${runtimeMode} runtime...`);
  if (runtimeMode === "static") {
    const prepare = dependencies.prepareStatic ?? (await import("./electron-prepare-static.mjs")).prepareStaticElectronBundle;
    await prepare(ctx, dependencies.staticDependencies);
  } else {
    const prepare = dependencies.prepareLegacy ?? (await import("./desktop-bundle-prepare.mjs")).prepareDesktopBundle;
    await prepare({ ...ctx, label: "electron-staged" });
  }
  const version = (dependencies.readVersion ?? readDesktopBundleSemver)(repoRoot);
  (dependencies.syncPackageVersion ?? syncPackageVersion)(agentGuiRoot, version);
  await (dependencies.generateAssets ?? generateElectronInstallerAssets)({ regenFromSvg: false });
  const shellDirectory = (dependencies.stageShell ?? stageElectronShell)({ version, runtimeMode });
  console.log(`electron-prepare: ${runtimeMode} ready (installer/upgrade acceptance is separate).`);
  return { ...ctx, mode: runtimeMode, shellDirectory };
}

export function runElectronPrepare(argv = process.argv.slice(2), dependencies = {}) {
  return prepareElectronBundle(parseElectronPrepareArguments(argv), dependencies);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  Promise.resolve().then(() => runElectronPrepare()).catch((error) => { console.error(error); process.exitCode = 1; });
}
