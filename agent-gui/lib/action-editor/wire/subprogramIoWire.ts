import { ActionVariable } from "@/lib/action-editor/types/common";
import { wireVariableToEditor } from "@/lib/action-editor/wire/programWire";

type WireVariableRow = Record<string, unknown>;

/**
 * Splits subprogram variables into input/output lists (same semantics as Designer GetGlobalSubProgramIo).
 */
export function mapSubprogramCompressedVariables(raw: unknown): {
  inputs: ActionVariable[];
  outputs: ActionVariable[];
} {
  if (!Array.isArray(raw)) {
    return { inputs: [], outputs: [] };
  }

  const inputs: ActionVariable[] = [];
  const outputs: ActionVariable[] = [];

  for (const row of raw) {
    if (typeof row !== "object" || row === null) {
      continue;
    }
    const v = wireVariableToEditor(row as WireVariableRow);
    const key = (v.key ?? "").trim();
    if (!key) {
      continue;
    }
    if (v.isInput) {
      inputs.push(v);
    }
    if (v.isOutput) {
      outputs.push(v.isInput ? ActionVariable.fromPartial({ ...v }) : v);
    }
  }

  return { inputs, outputs };
}
