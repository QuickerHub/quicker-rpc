import { createHash } from "node:crypto";
import { win32 } from "node:path";
import { installPinnedNsisOverlayAdapter } from "./nsis-overlay-template.mjs";

// This adapter is exclusively for a uniquely identified, caller-owned fixture.
// Production templates and their installed node_modules copies remain unchanged.
export const PINNED_NSIS_FIXTURE_HASHES = Object.freeze({
  customInclude: "52442b0230ae2618c954d4add5e82607265271cf8bf238bf25c6f7e450cbe9a0",
  payloadInclude: "83c821c0f5b8a9c157af000b97f06b7ee99ab852fc2c9ccf7e5ad62dd8acc87a",
});
const normalize = (source) => source.replaceAll("\r\n", "\n");
const hash = (source) => createHash("sha256").update(normalize(source)).digest("hex");
function pinned(source, expected, label) {
  if (typeof source !== "string" || hash(source) !== expected) throw new Error(`NSIS fixture ${label} source mismatch`);
  return normalize(source);
}
function exactlyOnce(source, anchor, label) {
  if (source.split(anchor).length !== 2) throw new Error(`NSIS fixture ${label} anchor must occur exactly once`);
}
function replaceOnce(source, anchor, replacement, label) {
  exactlyOnce(source, anchor, label);
  return source.replace(anchor, () => replacement);
}
function removeSpan(source, start, end, label) {
  exactlyOnce(source, start, label + " start"); exactlyOnce(source, end, label + " end");
  const from = source.indexOf(start), to = source.indexOf(end);
  if (to <= from) throw new Error(`NSIS fixture ${label} ordering changed`);
  return source.slice(0, from) + source.slice(to);
}

/** Realpath/ancestor ownership must already be verified by the fixture runner. */
function literalTemporaryPath(value) {
  if (typeof value !== "string" || !/^[a-z]:[\\/]/i.test(value) || /["$<>|?*\x00-\x1f]/.test(value))
    throw new Error("NSIS fixture requires a literal absolute local temporary path");
  const path = value.replaceAll("/", "\\"), segments = path.slice(3).split("\\");
  if (segments.some((segment) => !segment || segment === "." || segment === ".." || /[. :]$|:/.test(segment))
    || !segments.slice(0, -1).some((segment) => segment.toLowerCase() === ".tmp") || win32.normalize(path) !== path)
    throw new Error("NSIS fixture path must be a canonical descendant of a caller-owned .tmp directory");
  return path;
}
function emptyMacro(source, name) {
  const pattern = new RegExp(`^!macro ${name}\\n[^]*?^!macroend(?:\\n|$)`, "gm"), matches = [...source.matchAll(pattern)];
  if (matches.length !== 1) throw new Error(`NSIS fixture ${name} macro anchor must occur exactly once`);
  return source.replace(pattern, () => `!macro ${name}\n!macroend\n`);
}
function removeFunction(source, name) {
  const pattern = new RegExp(`^Function ${name}\\n[^]*?^FunctionEnd(?:\\n|$)`, "gm"), matches = [...source.matchAll(pattern)];
  if (matches.length !== 1) throw new Error(`NSIS fixture ${name} function anchor must occur exactly once`);
  return source.replace(pattern, "");
}

export function createIsolatedCustomInclude(source, directory) {
  const fixedDirectory = literalTemporaryPath(directory);
  let output = pinned(source, PINNED_NSIS_FIXTURE_HASHES.customInclude, "custom include");
  for (const name of ["customInit", "customInstall", "customUnInstall", "customPageAfterChangeDir",
    "InitQuickerAgentShortcutChoices", "ApplyQuickerAgentShortcutChoices", "CreateQuickerAgentStartMenuShortcut",
    "RemoveQuickerAgentStartMenuShortcut", "RemoveQuickerAgentShortcuts"])
    output = emptyMacro(output, name);
  for (const name of ["QuickerAgentShortcutsPageCreate", "QuickerAgentShortcutsPageLeave"]) output = removeFunction(output, name);
  for (const name of ["QA_WantDesktopShortcut", "QA_WantStartMenuShortcut", "QA_ShortcutDialog", "QA_CB_Desktop", "QA_CB_StartMenu"])
    output = replaceOnce(output, `Var ${name}\n`, "", name + " variable");
  const anchor = "!macro QA_RunOwnership MODE\n";
  const gate = `  \u0024{If} $INSTDIR != "${fixedDirectory}"\n    SetErrorLevel 2\n    Abort "The isolated fixture installation directory cannot change."\n  \u0024{EndIf}\n`;
  output = replaceOnce(output, anchor, anchor + gate, "final-directory ownership gate");
  return output;
}

function isolatePayload(source, cacheDirectory) {
  let output = pinned(source, PINNED_NSIS_FIXTURE_HASHES.payloadInclude, "payload include");
  for (const name of ["APP_PACKAGE_STORE_FILE", "APP_INSTALLER_STORE_FILE"])
    output = replaceOnce(output, `$LOCALAPPDATA\\\u0024{${name}}`, `${cacheDirectory}\\\u0024{${name}}`, name + " cache");
  return output;
}
function isolateSection(source, payloadPath) {
  let output = replaceOnce(source, "!include installer.nsh\n", `!include "${payloadPath}"\n`, "payload include");
  const startCalls = /^[ \t]*!insertmacro doStartApp$/gm;
  if ([...output.matchAll(startCalls)].length !== 3) throw new Error("NSIS fixture automatic-launch anchors changed");
  return output.replace(startCalls, "    ; Isolated fixture never launches the application.");
}
function isolateUninstaller(source, directory) {
  let output = replaceOnce(source, "Function un.onInit\n  SetOutPath $INSTDIR", `Function un.onInit\n  StrCpy $INSTDIR "${directory}"\n  SetOutPath $INSTDIR`, "uninstaller initial directory");
  output = removeSpan(output, "  \u0024{ifNot} \u0024{isKeepShortcuts}\n", "  !ifmacrodef unregisterFileAssociations\n", "uninstaller shell cleanup");
  output = removeSpan(output, "  Var /GLOBAL isDeleteAppData\n", '  DeleteRegKey SHELL_CONTEXT "${UNINSTALL_REGISTRY_KEY}"\n', "uninstaller user-data cleanup");
  return output;
}
function isolateMain(source, directory, stubDirectory) {
  const anchor = "Function .onInit\n  Call setInstallSectionSpaceRequired\n\n  SetOutPath $INSTDIR";
  const fixed = `Function .onInit\n  Call setInstallSectionSpaceRequired\n\n  !ifdef BUILD_UNINSTALLER\n    StrCpy $INSTDIR "${stubDirectory}"\n  !else\n    StrCpy $INSTDIR "${directory}"\n  !endif\n  SetOutPath $INSTDIR`;
  return replaceOnce(source, anchor, fixed, "main initial directory");
}

/** Transform only the pinned base adapter's public sources; restore on failure. */
export function installIsolatedNsisFixtureAdapter(Target, inputs, fixture) {
  const directory = literalTemporaryPath(fixture.directory), cacheDirectory = literalTemporaryPath(fixture.cacheDirectory);
  const stubDirectory = literalTemporaryPath(fixture.stubDirectory), payloadPath = literalTemporaryPath(fixture.generatedPayloadIncludePath);
  for (const name of ["generatedSectionPath", "generatedAssistedPath", "generatedMultiUserPath", "generatedUninstallerPath"])
    literalTemporaryPath(inputs[name]);
  const generatedCustomInclude = createIsolatedCustomInclude(fixture.customIncludeSource, directory);
  const generatedPayloadInclude = isolatePayload(fixture.payloadIncludeSource, cacheDirectory);
  if (typeof inputs.assistedInstaller !== "string") throw new Error("NSIS fixture requires the complete pinned layout");
  const base = installPinnedNsisOverlayAdapter(Target, inputs), prototype = Target.prototype;
  try {
    const generatedSection = isolateSection(base.generatedSection, payloadPath);
    const generatedLayout = Object.freeze({
      assisted: base.generatedLayout.assisted,
      multiUser: replaceOnce(base.generatedLayout.multiUser, '      StrCpy $INSTDIR "$LOCALAPPDATA\\QuickerAgent"', `      StrCpy $INSTDIR "${directory}"`, "per-user fixture default"),
      uninstaller: isolateUninstaller(base.generatedLayout.uninstaller, directory),
    });
    const original = prototype.computeFinalScript;
    async function wrapped(...args) { return isolateMain(await original.apply(this, args), directory, stubDirectory); }
    prototype.computeFinalScript = wrapped;
    return Object.freeze({ generatedSection, generatedLayout, generatedCustomInclude, generatedPayloadInclude, restore() {
      if (prototype.computeFinalScript !== wrapped) throw new Error("NSIS fixture adapter ownership changed");
      prototype.computeFinalScript = original; base.restore();
    } });
  } catch (error) { base.restore(); throw error; }
}
