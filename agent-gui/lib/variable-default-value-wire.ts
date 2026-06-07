/** Compact wire default for workspace variables[] on data.json. */

export const DEFAULT_VALUE_FIELD = "defaultValue";
/** Legacy disk wire key; read-only on expand. */
export const DEFAULT_VALUE_FILE_WIRE_KEY = "defaultValue.file";
export const DEFAULT_WIRE_FIELD = "default";
export const DEFAULT_FILE_WIRE_KEY = "default.file";
export const LEGACY_DEFAULT_VALUE_FILE = "defaultValueFile";

export type WireVariableDefault = {
  defaultValue?: unknown;
  defaultValueFile?: string;
  [key: string]: unknown;
};

function normalizeFileRef(path: string): string {
  return path.trim().replace(/\\/g, "/");
}

function readWireFilePath(raw: WireVariableDefault): string | undefined {
  const fromWire =
    typeof raw[DEFAULT_FILE_WIRE_KEY] === "string"
      ? raw[DEFAULT_FILE_WIRE_KEY]
      : typeof raw[DEFAULT_VALUE_FILE_WIRE_KEY] === "string"
        ? raw[DEFAULT_VALUE_FILE_WIRE_KEY]
        : undefined;
  if (fromWire?.trim()) {
    return normalizeFileRef(fromWire);
  }

  const legacy = raw[LEGACY_DEFAULT_VALUE_FILE];
  if (typeof legacy === "string" && legacy.trim()) {
    return normalizeFileRef(legacy);
  }

  const dv = raw[DEFAULT_VALUE_FIELD];
  if (dv && typeof dv === "object" && !Array.isArray(dv)) {
    const file = (dv as Record<string, unknown>).file;
    if (typeof file === "string" && file.trim()) {
      return normalizeFileRef(file);
    }
  }

  return undefined;
}

function readWireInline(raw: WireVariableDefault): string | undefined {
  for (const key of [DEFAULT_WIRE_FIELD, DEFAULT_VALUE_FIELD, "default_value", "DefaultValue"]) {
    const token = raw[key];
    if (token === null || token === undefined) {
      continue;
    }
    if (typeof token === "object") {
      continue;
    }
    if (typeof token === "string") {
      return token;
    }
    return String(token);
  }
  return undefined;
}

function stripIncomingWireKeys(out: WireVariableDefault): void {
  delete out[DEFAULT_VALUE_FILE_WIRE_KEY];
  delete out[DEFAULT_FILE_WIRE_KEY];
  delete out[DEFAULT_WIRE_FIELD];
  delete out[LEGACY_DEFAULT_VALUE_FILE];
}

function stripLegacyCanonicalKeys(out: WireVariableDefault): void {
  delete out[DEFAULT_VALUE_FIELD];
  delete out[DEFAULT_VALUE_FILE_WIRE_KEY];
  delete out.default_value;
  delete out.DefaultValue;
  delete out[LEGACY_DEFAULT_VALUE_FILE];
}

/** Expand wire keys / legacy shapes to canonical defaultValue (string or { file }). */
export function expandVariableDefaultWireRecord(raw: WireVariableDefault): WireVariableDefault {
  const out: WireVariableDefault = { ...raw };
  const filePath = readWireFilePath(out);
  if (filePath) {
    out[DEFAULT_VALUE_FIELD] = { file: filePath };
    stripIncomingWireKeys(out);
    return out;
  }

  const inline = readWireInline(out);
  if (inline !== undefined) {
    out[DEFAULT_VALUE_FIELD] = inline;
  }

  stripIncomingWireKeys(out);
  return out;
}

/** Compact canonical defaultValue to `default` / `default.file` wire keys for data.json. */
export function compactVariableDefaultWireRecord(raw: WireVariableDefault): WireVariableDefault {
  const out: WireVariableDefault = { ...raw };
  const filePath = readWireFilePath(out);
  if (filePath) {
    out[DEFAULT_FILE_WIRE_KEY] = filePath;
    stripLegacyCanonicalKeys(out);
    delete out[DEFAULT_WIRE_FIELD];
    return out;
  }

  const inline = readWireInline(out);
  if (inline !== undefined) {
    out[DEFAULT_WIRE_FIELD] = inline;
    stripLegacyCanonicalKeys(out);
    delete out[DEFAULT_FILE_WIRE_KEY];
    return out;
  }

  if (
    out[DEFAULT_VALUE_FIELD]
    && typeof out[DEFAULT_VALUE_FIELD] === "object"
  ) {
    stripLegacyCanonicalKeys(out);
  }

  stripIncomingWireKeys(out);
  return out;
}

/** Editor transport: split canonical defaultValue into inline string + optional file ref. */
export function splitVariableDefaultForEditor(raw: WireVariableDefault): {
  defaultValue: string;
  defaultValueFile?: string;
} {
  const expanded = expandVariableDefaultWireRecord(raw);
  const filePath = readWireFilePath(expanded);
  if (filePath) {
    return { defaultValue: "", defaultValueFile: filePath };
  }
  const inline = readWireInline(expanded);
  return { defaultValue: inline ?? "" };
}

/** Build canonical defaultValue from editor fields before compact. */
export function mergeVariableDefaultFromEditor(
  variable: { defaultValue: string; defaultValueFile?: string },
): WireVariableDefault {
  const file = variable.defaultValueFile?.trim();
  if (file) {
    return { defaultValue: { file: normalizeFileRef(file) } };
  }
  if (variable.defaultValue) {
    return { defaultValue: variable.defaultValue };
  }
  return {};
}

export function expandVariablesDefaultWire(
  variables: WireVariableDefault[] | undefined,
): WireVariableDefault[] {
  return (variables ?? []).map((v) => expandVariableDefaultWireRecord(v));
}

export function compactVariablesDefaultWire(
  variables: WireVariableDefault[] | undefined,
): WireVariableDefault[] {
  return (variables ?? []).map((v) => compactVariableDefaultWireRecord(v));
}
