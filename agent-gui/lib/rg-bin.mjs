import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";

const RG_EXE = process.platform === "win32" ? "rg.exe" : "rg";

function rgExists(dir) {
  return existsSync(join(dir, RG_EXE));
}

/** Tauri bundle: resources/rg next to resources/app (Node cwd). */
function resolveTauriBundledRgDir(agentGuiRoot) {
  const sibling = join(agentGuiRoot, "..", "rg");
  return rgExists(sibling) ? sibling : null;
}

/** Candidate directories that may ship a bundled ripgrep binary. */
export function listBundledRgSourceDirs(agentGuiRoot) {
  const tauriBundled = resolveTauriBundledRgDir(agentGuiRoot);
  return [
    ...(tauriBundled ? [tauriBundled] : []),
    join(agentGuiRoot, ".runtime", "rg"),
    join(agentGuiRoot, "rg"),
  ];
}

function resolveFromPath() {
  try {
    if (process.platform === "win32") {
      const out = execSync("where.exe rg", {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }).trim();
      for (const line of out.split(/\r?\n/)) {
        const candidate = line.trim();
        if (candidate && existsSync(candidate)) {
          return candidate;
        }
      }
      return null;
    }
    const out = execSync("command -v rg", {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    return out && existsSync(out) ? out : null;
  } catch {
    return null;
  }
}

function listEditorBundledRgCandidates() {
  /** @type {string[]} */
  const candidates = [];
  const localAppData = process.env.LOCALAPPDATA?.trim();
  if (localAppData) {
    candidates.push(
      join(
        localAppData,
        "Programs",
        "cursor",
        "resources",
        "app",
        "node_modules",
        "@vscode",
        "ripgrep",
        "bin",
        RG_EXE,
      ),
      join(
        localAppData,
        "Programs",
        "Microsoft VS Code",
        "resources",
        "app",
        "node_modules",
        "@vscode",
        "ripgrep",
        "bin",
        RG_EXE,
      ),
    );
  }
  const home = process.env.USERPROFILE?.trim() || process.env.HOME?.trim();
  if (home) {
    candidates.push(join(home, ".cargo", "bin", RG_EXE));
  }
  return candidates;
}

/** Resolve ripgrep executable for shell_exec (null when unavailable). */
export function resolveRgBin(agentGuiRoot) {
  for (const dir of listBundledRgSourceDirs(agentGuiRoot)) {
    const exe = join(dir, RG_EXE);
    if (existsSync(exe)) return exe;
  }

  const fromPath = resolveFromPath();
  if (fromPath) return fromPath;

  for (const exe of listEditorBundledRgCandidates()) {
    if (existsSync(exe)) return exe;
  }

  return null;
}

/** Directories to prepend so `rg` resolves in agent shells. */
export function listRgPathDirs(agentGuiRoot) {
  const bin = resolveRgBin(agentGuiRoot);
  return bin ? [dirname(bin)] : [];
}
