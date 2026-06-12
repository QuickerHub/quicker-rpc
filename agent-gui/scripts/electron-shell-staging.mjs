/**
 * Stage a minimal Electron shell app for electron-builder.
 * Next / Playwright / SWC live in extraResources standalone — not in app.asar.
 */
import { spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const agentGuiRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const electronRoot = join(agentGuiRoot, "electron");
const shellAppRoot = join(electronRoot, "shell-app");

const SKIP_DIRS = new Set(["resources", "dist", "build", "shell-app"]);

/** @param {string} agentGuiRoot */
function stageBrowserRuntimeForShell(agentGuiRoot) {
  const src = join(agentGuiRoot, "browser-runtime");
  const dest = join(shellAppRoot, "browser-runtime");
  if (!existsSync(src)) {
    throw new Error(`Missing browser-runtime sources: ${src}`);
  }
  if (existsSync(dest)) {
    rmSync(dest, { recursive: true, force: true });
  }
  mkdirSync(dest, { recursive: true });
  for (const ent of readdirSync(src, { withFileTypes: true })) {
    if (!ent.isFile() || !ent.name.endsWith(".mjs") || ent.name.endsWith(".test.mjs")) {
      continue;
    }
    cpSync(join(src, ent.name), join(dest, ent.name));
  }
  const protocol = join(dest, "protocol.mjs");
  if (!existsSync(protocol)) {
    throw new Error(`browser-runtime staging incomplete: ${protocol}`);
  }
  console.log(`electron-shell-staging: browser-runtime -> ${dest}`);
}

/** @param {string} srcDir @param {string} destDir */
function copyElectronSources(srcDir, destDir) {
  mkdirSync(destDir, { recursive: true });
  for (const ent of readdirSync(srcDir, { withFileTypes: true })) {
    const src = join(srcDir, ent.name);
    const dest = join(destDir, ent.name);
    if (ent.isDirectory()) {
      if (SKIP_DIRS.has(ent.name)) continue;
      copyElectronSources(src, dest);
      continue;
    }
    if (ent.name.endsWith(".mjs") || ent.name.endsWith(".cjs")) {
      cpSync(src, dest);
    }
  }
}

/** @param {string} version */
function writeShellPackageJson(version) {
  const pkg = {
    name: "quicker-agent-electron-shell",
    version,
    private: true,
    description: "QuickerAgent desktop shell",
    author: "Quicker",
    main: "electron/bootstrap.cjs",
    dependencies: {
      "electron-updater": "^6.8.9",
    },
  };
  writeFileSync(join(shellAppRoot, "package.json"), `${JSON.stringify(pkg, null, 2)}\n`, "utf8");
}

function installShellDeps() {
  const npm = process.platform === "win32" ? "npm.cmd" : "npm";
  const result = spawnSync(
    npm,
    ["install", "--omit=dev", "--no-package-lock", "--no-fund", "--no-audit"],
    {
      cwd: shellAppRoot,
      stdio: "inherit",
      shell: process.platform === "win32",
    },
  );
  if (result.status !== 0) {
    throw new Error("npm install failed in electron/shell-app");
  }
}

/**
 * @param {{ version?: string }} [opts]
 */
export function stageElectronShell({ version = "0.1.0" } = {}) {
  console.log("electron-shell-staging: preparing minimal shell app...");
  if (existsSync(shellAppRoot)) {
    rmSync(shellAppRoot, { recursive: true, force: true });
  }
  mkdirSync(shellAppRoot, { recursive: true });
  copyElectronSources(electronRoot, join(shellAppRoot, "electron"));
  stageBrowserRuntimeForShell(agentGuiRoot);
  writeShellPackageJson(version);
  installShellDeps();
  console.log(`electron-shell-staging: done -> ${shellAppRoot}`);
}
