import { runQkrpc } from "@/lib/qkrpc";
import { ActionVariable } from "@/lib/action-editor/types/common";
import { wireVarTypeToEditor } from "@/lib/action-editor/wire/varTypeCodec";

export const dynamic = "force-dynamic";

function readString(obj: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === "string") return value.trim();
  }
  return "";
}

function mapVariables(raw: unknown): ActionVariable[] {
  if (!Array.isArray(raw)) return [];
  const out: ActionVariable[] = [];
  for (const row of raw) {
    if (typeof row !== "object" || row === null) continue;
    const o = row as Record<string, unknown>;
    const key = readString(o, "key", "Key");
    if (!key) continue;
    out.push(
      ActionVariable.fromPartial({
        id: readString(o, "id", "Id") || `v-${out.length + 1}`,
        key,
        varType: wireVarTypeToEditor(o.varType ?? o.VarType),
        defaultValue: readString(o, "defaultValue", "DefaultValue"),
        desc: readString(o, "desc", "Desc", "description", "Description"),
        isInput: Boolean(o.isInput ?? o.IsInput),
        isOutput: Boolean(o.isOutput ?? o.IsOutput),
      }),
    );
  }
  return out;
}

function unwrapProgram(data: unknown): Record<string, unknown> | null {
  if (typeof data !== "object" || data === null) return null;
  const root = data as Record<string, unknown>;
  const payload =
    typeof root.payload === "object" && root.payload !== null
      ? (root.payload as Record<string, unknown>)
      : root;
  const compressed = payload.compressed ?? payload.Compressed;
  if (typeof compressed === "object" && compressed !== null) {
    return compressed as Record<string, unknown>;
  }
  return payload;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const id = url.searchParams.get("id")?.trim() ?? "";

  if (!id) {
    return Response.json({ ok: false, error: "id is required" }, { status: 400 });
  }

  const result = await runQkrpc(
    ["subprogram", "get", "--id", id, "--return-mode", "full", "--json"],
    { timeoutMs: 60_000 },
  );

  if (!result.ok) {
    return Response.json(
      { ok: false, error: result.stderr || "subprogram get failed" },
      { status: 503 },
    );
  }

  const program = unwrapProgram(result.parsed);
  if (!program) {
    return Response.json({
      found: false,
      subProgramId: id,
      identifier: id,
      displayName: id,
      description: "",
      icon: "",
      kind: 0,
      inputs: [],
      outputs: [],
      bindingHints: [],
      resolveStatusMessage: "未找到子程序",
    });
  }

  const name = readString(program, "name", "Name", "title", "Title") || id;
  const variables = mapVariables(program.variables ?? program.Variables);
  const inputs = variables.filter((v) => v.isInput);
  const outputs = variables.filter((v) => v.isOutput);

  return Response.json({
    found: true,
    subProgramId: id,
    identifier: id,
    displayName: name,
    description: readString(program, "description", "Description"),
    icon: readString(program, "icon", "Icon"),
    kind: 0,
    inputs,
    outputs,
    bindingHints: [],
    resolveStatusMessage: "",
  });
}
