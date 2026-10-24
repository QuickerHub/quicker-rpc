import { createHash } from "node:crypto";

// Versioned build-time adapter. Never edit installed builder templates in place.
export const PINNED_NSIS_BUILDER = "25.1.8";
export const PINNED_NSIS_HASHES = Object.freeze({
  main: "468de2e9587b9036b3b025719c2843745d5224758851b04a56d95d90ed768b6e",
  section: "74c4dbb4163cdd90ca4850b75d304e916235c882d6af7b5cdad63bffbc977072",
  assisted: "8aa1230e9717b428664d613fcc5c6a060883410b34cb7853b517fe11b4ee0a76",
  multiUser: "afa9046492317e72e79e022cdb1f42edba4687ea605300bfc01c002f3106201c",
  uninstaller: "cf22e42a863c186e281e208abd7574af2863c080f1fb6567fe6ee05c439c0f24",
  utilities: "97bd546b5cd2aaf16b77bc9e2be8a18962dd74ab5c4d23b35b163ca89bf4dd2a",
});
const normalize = (value) => value.replaceAll("\r\n", "\n");
const hash = (value) => createHash("sha256").update(normalize(value)).digest("hex");
const include = '    !include "installSection.nsh"';
const oldUninstall = `!insertmacro uninstallOldVersion SHELL_CONTEXT
!insertmacro handleUninstallResult SHELL_CONTEXT

\u0024{if} $installMode == "all"
  !insertmacro uninstallOldVersion HKEY_CURRENT_USER
  !insertmacro handleUninstallResult HKEY_CURRENT_USER
\u0024{endIf}`;
const overlay = `; Keep the normal installer extraction/registry/shortcut flow, but never run
; an old executable. The helper must attest product identity and the final target.
!ifmacrondef QA_VerifyOverlayInstall
  !error "The verified installation identity/overlay helper is required."
!endif
!insertmacro QA_VerifyOverlayInstall SHELL_CONTEXT

\u0024{if} $installMode == "all"
  !insertmacro QA_VerifyOverlayInstall HKEY_CURRENT_USER
\u0024{endIf}`;

function exactlyOnce(source, anchor, label) {
  if (source.split(anchor).length !== 2) throw new Error(`NSIS ${label} anchor must occur exactly once`);
}
function includePath(path) {
  if (typeof path !== "string" || !/^(?:[a-z]:[\\/]|\/)/i.test(path) || /["$\r\n]/.test(path))
    throw new Error("NSIS generated include requires a literal absolute path");
  // The pinned Windows makensis cannot resolve forward-slash include paths.
  return /^[a-z]:/i.test(path) ? path.replaceAll("/", "\\") : path;
}

/** No runtime undef, registry edits, old uninstaller execution or node_modules mutation. */
export function createPinnedNsisOverlay({ builderVersion, mainTemplate, installSection, generatedSectionPath, installUtilities, generatedInstallUtilitiesPath }) {
  if (builderVersion !== PINNED_NSIS_BUILDER || hash(mainTemplate) !== PINNED_NSIS_HASHES.main || hash(installSection) !== PINNED_NSIS_HASHES.section)
    throw new Error("NSIS upstream version/template mismatch; review the overlay adapter before building");
  const main = normalize(mainTemplate), section = normalize(installSection), path = includePath(generatedSectionPath);
  exactlyOnce(main, include, "main include"); exactlyOnce(section, oldUninstall, "old uninstall block");
  const close = section.indexOf("!insertmacro CHECK_APP_RUNNING"), before = section.indexOf(oldUninstall), files = section.indexOf("!insertmacro installApplicationFiles");
  if (close < 0 || before <= close || files <= before) throw new Error("NSIS final-target/file-overlay ordering changed");
  const generatedSection = section.replace(oldUninstall, overlay);
  const generatedInstallUtilities = installUtilities === undefined ? undefined : createPinnedNsisInstallUtilities({ builderVersion, installUtilities });
  const utilityPath = generatedInstallUtilities === undefined ? undefined : includePath(generatedInstallUtilitiesPath);
  return Object.freeze({
    generatedSection, generatedInstallUtilities,
    replaceFinalScript(finalScript) {
      exactlyOnce(finalScript, include, "final include");
      if (utilityPath) {
        const anchor = '  !include "installUtil.nsh"'; exactlyOnce(finalScript, anchor, "verified overlay utilities include");
        finalScript = finalScript.replace(anchor, `  !include "${utilityPath}"`);
      }
      return '!define QA_VERIFIED_OVERLAY_BUILD "25.1.8-v1"\n' + finalScript.replace(include, `    !include "${path}"`);
    },
  });
}

/** Preserve computeScriptAndSignUninstaller and the original final-script builder. */
export function installPinnedNsisOverlayAdapter(Target, inputs) {
  const adapted = createPinnedNsisOverlay(inputs), prototype = Target?.prototype;
  const layout = inputs.assistedInstaller === undefined ? undefined : createPinnedNsisLayout(inputs);
  if (typeof prototype?.computeFinalScript !== "function") throw new Error("NSIS final-script API unavailable");
  const original = prototype.computeFinalScript;
  async function wrapped(originalScript, ...args) {
    if (hash(originalScript) !== PINNED_NSIS_HASHES.main) throw new Error("Custom or changed NSIS scripts require a separate review");
    const section = adapted.replaceFinalScript(await original.call(this, originalScript, ...args));
    return layout ? layout.replaceFinalScript(section) : section;
  }
  prototype.computeFinalScript = wrapped;
  return Object.freeze({ generatedSection: adapted.generatedSection, generatedInstallUtilities: adapted.generatedInstallUtilities, generatedLayout: layout?.files, restore() {
    if (prototype.computeFinalScript !== wrapped) throw new Error("NSIS adapter ownership changed");
    prototype.computeFinalScript = original;
  } });
}

/** Legacy uninstall dispatch is gone; emit only utilities still used by the
 * normal extraction/cache/shortcut flow. Dead functions otherwise fail /WX. */
export function createPinnedNsisInstallUtilities({ builderVersion, installUtilities }) {
  if (builderVersion !== PINNED_NSIS_BUILDER || hash(installUtilities) !== PINNED_NSIS_HASHES.utilities)
    throw new Error("NSIS install utilities template mismatch; review the utility adapter");
  const source = normalize(installUtilities), blocks = [];
  for (const name of ["moveFile", "copyFile", "setIsTryToKeepShortcuts"]) {
    const pattern = new RegExp(`^!macro ${name}(?: [^\\n]+)?\\n[^]*?^!macroend$`, "gm"), matches = [...source.matchAll(pattern)];
    if (matches.length !== 1) throw new Error("NSIS live utility macro anchor changed");
    blocks.push(matches[0][0]);
  }
  const variable = "Var /GLOBAL isTryToKeepShortcuts"; exactlyOnce(source, variable, "live shortcut state");
  return blocks.slice(0, 2).join("\n\n") + "\n\n" + variable + "\n\n" + blocks[2] + "\n";
}

/** Keep the final user/registered /D target; do not append a new product subfolder. */
export function createPinnedNsisLayout(inputs) {
  if (inputs.builderVersion !== PINNED_NSIS_BUILDER || hash(inputs.assistedInstaller) !== PINNED_NSIS_HASHES.assisted || hash(inputs.multiUser) !== PINNED_NSIS_HASHES.multiUser
    || hash(inputs.uninstaller) !== PINNED_NSIS_HASHES.uninstaller)
    throw new Error("NSIS layout template mismatch; review the layout adapter");
  let assisted = normalize(inputs.assistedInstaller), multiUser = normalize(inputs.multiUser);
  const unusedDirectoryHelper = "    !include StrContains.nsh\n\n";
  exactlyOnce(assisted, unusedDirectoryHelper, "obsolete directory helper");
  assisted = assisted.replace(unusedDirectoryHelper, "");
  const pre = assisted.match(/    Function instFilesPre\n[^]*?    FunctionEnd/)?.[0];
  if (!pre) throw new Error("NSIS final-directory callback missing");
  exactlyOnce(assisted, pre, "directory callback");
  assisted = assisted.replace(pre, "    Function instFilesPre\n      ; Use the final selected directory verbatim, including /D and upgrades.\n    FunctionEnd");
  const perUser = multiUser.match(/  !macro setInstallModePerUser\n[^]*?  !macroend/)?.[0];
  if (!perUser) throw new Error("NSIS per-user directory macro missing");
  const fallback = perUser.match(/      StrCpy \$0 "\$LocalAppData\\Programs"\n[^]*?      StrCpy \$INSTDIR "\$0\\\$\{APP_FILENAME\}"/)?.[0];
  if (!fallback) throw new Error("NSIS per-user default anchor missing");
  exactlyOnce(multiUser, perUser, "per-user directory");
  multiUser = multiUser.replace(perUser, perUser.replace(fallback, '      StrCpy $INSTDIR "$LOCALAPPDATA\\QuickerAgent"'));
  let uninstaller = normalize(inputs.uninstaller);
  const initialization = "  !insertmacro initMultiUser\n", view = "  !insertmacro check64BitAndSetRegView\n";
  exactlyOnce(uninstaller, initialization, "uninstaller identity initialization"); exactlyOnce(uninstaller, view, "uninstaller registry view");
  uninstaller = uninstaller.replace(initialization, "").replace(view, view + initialization);
  const files = Object.freeze({ assisted, multiUser, uninstaller });
  return Object.freeze({ files, replaceFinalScript(script) {
    for (const [name, path] of [["assistedInstaller.nsh", inputs.generatedAssistedPath], ["multiUser.nsh", inputs.generatedMultiUserPath], ["uninstaller.nsh", inputs.generatedUninstallerPath]]) {
      const anchor = `!include "${name}"`; exactlyOnce(script, anchor, name);
      script = script.replace(anchor, `!include "${includePath(path)}"`);
    }
    return script;
  } });
}
