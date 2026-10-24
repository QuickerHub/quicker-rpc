import { spawnSync } from "node:child_process";
import { mkdir, copyFile, realpath, mkdtemp } from "node:fs/promises";
import path, { join, resolve } from "node:path";

export function isWithinInstallerWorkspace(root, candidate, api = path) {
  const difference = api.relative(root, candidate);
  return !api.isAbsolute(difference) && difference !== ".." && !difference.startsWith(".." + api.sep);
}

export async function buildInstallerOwnershipHelper(root, { compile = spawnSync } = {}) {
  if (process.platform !== "win32") throw new Error("The NSIS ownership helper requires the Windows .NET Framework compiler");
  const canonical = await realpath(root), outputDirectory = await realpath(join(root, "electron/build"));
  if (!isWithinInstallerWorkspace(canonical, outputDirectory)) throw new Error("Installer helper output escaped the project");
  const repositoryRoot = await realpath(resolve(canonical, "..")), temporaryParent = join(repositoryRoot, ".tmp");
  await mkdir(temporaryParent, { recursive: true });
  const canonicalTemporary = await realpath(temporaryParent);
  if (!isWithinInstallerWorkspace(repositoryRoot, canonicalTemporary)) throw new Error("Installer helper temporary output escaped the repository");
  const temporary = await mkdtemp(join(canonicalTemporary, "installer-helper-"));
  const temporaryExe = join(temporary, "installer-helper.exe");
  const compiler = join(process.env.WINDIR ?? "C:/Windows", "Microsoft.NET/Framework64/v4.0.30319/csc.exe");
  const sources = ["ProcessOwnershipPolicy.cs", "PayloadPolicy.cs", "NativeOwnership.cs", "InstallerOwnership.cs"].map((name) => join(root, "electron/build/installer-helper", name));
  const manifest = join(root, "electron/build/installer-helper/payload-policy.json");
  const result = compile(compiler, ["/nologo", "/target:exe", "/platform:anycpu", "/optimize+", "/r:System.Runtime.Serialization.dll",
    `/resource:${manifest},QuickerAgent.Installer.Payload`, `/out:${temporaryExe}`, ...sources],
    { windowsHide: true, timeout: 60000, encoding: "utf8" });
  if (result.error || result.status !== 0) throw new Error(`Installer helper compilation failed: ${result.error?.message ?? result.stdout ?? result.stderr}`);
  const target = join(outputDirectory, "installer-helper.exe"); await copyFile(temporaryExe, target);
  return target;
}
