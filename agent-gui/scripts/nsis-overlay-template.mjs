import { createHash } from "node:crypto";

// Preparation only: not wired into either release entry. The native helper and
// product-identity/overlay macro must be reviewed before this adapter is enabled.
export const PINNED_NSIS_BUILDER = "25.1.8";
export const PINNED_NSIS_HASHES = Object.freeze({
  main: "468de2e9587b9036b3b025719c2843745d5224758851b04a56d95d90ed768b6e",
  section: "74c4dbb4163cdd90ca4850b75d304e916235c882d6af7b5cdad63bffbc977072",
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
  return path.replaceAll("\\", "/");
}

/** No runtime undef, registry edits, old uninstaller execution or node_modules mutation. */
export function createPinnedNsisOverlay({ builderVersion, mainTemplate, installSection, generatedSectionPath }) {
  if (builderVersion !== PINNED_NSIS_BUILDER || hash(mainTemplate) !== PINNED_NSIS_HASHES.main || hash(installSection) !== PINNED_NSIS_HASHES.section)
    throw new Error("NSIS upstream version/template mismatch; review the overlay adapter before building");
  const main = normalize(mainTemplate), section = normalize(installSection), path = includePath(generatedSectionPath);
  exactlyOnce(main, include, "main include"); exactlyOnce(section, oldUninstall, "old uninstall block");
  const close = section.indexOf("!insertmacro CHECK_APP_RUNNING"), before = section.indexOf(oldUninstall), files = section.indexOf("!insertmacro installApplicationFiles");
  if (close < 0 || before <= close || files <= before) throw new Error("NSIS final-target/file-overlay ordering changed");
  const generatedSection = section.replace(oldUninstall, overlay);
  return Object.freeze({
    generatedSection,
    replaceFinalScript(finalScript) {
      exactlyOnce(finalScript, include, "final include");
      return finalScript.replace(include, `    !include "${path}"`);
    },
  });
}

/** Preserve computeScriptAndSignUninstaller and the original final-script builder. */
export function installPinnedNsisOverlayAdapter(Target, inputs) {
  const adapted = createPinnedNsisOverlay(inputs), prototype = Target?.prototype;
  if (typeof prototype?.computeFinalScript !== "function") throw new Error("NSIS final-script API unavailable");
  const original = prototype.computeFinalScript;
  async function wrapped(originalScript, ...args) {
    if (hash(originalScript) !== PINNED_NSIS_HASHES.main) throw new Error("Custom or changed NSIS scripts require a separate review");
    return adapted.replaceFinalScript(await original.call(this, originalScript, ...args));
  }
  prototype.computeFinalScript = wrapped;
  return Object.freeze({ generatedSection: adapted.generatedSection, restore() {
    if (prototype.computeFinalScript !== wrapped) throw new Error("NSIS adapter ownership changed");
    prototype.computeFinalScript = original;
  } });
}
