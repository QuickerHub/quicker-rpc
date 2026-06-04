import { runQkrpc } from "@/lib/qkrpc";
import { mapSubprogramCompressedVariables } from "@/lib/action-editor/wire/subprogramIoWire";
import {
  isNetworkSubProgramStoredValue,
  normalizeGlobalSubProgramStoredId,
  parseNetworkSubProgramTitleFromIdentifier,
} from "@/lib/action-editor/steps/subProgramStepResolve";

export const dynamic = "force-dynamic";

const SHARED_SUBPROGRAM_DEFAULT_ICON = "fa:Solid_ShareNodes:#c9a227";

function readString(obj: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === "string") return value.trim();
  }
  return "";
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

function notFoundResponse(
  identifier: string,
  message: string,
): Response {
  return Response.json({
    found: false,
    subProgramId: identifier,
    identifier,
    displayName: identifier,
    description: "",
    icon: "",
    kind: 0,
    inputs: [],
    outputs: [],
    bindingHints: [],
    resolveStatusMessage: message,
  });
}

function sharedSubProgramIoResponse(identifier: string): Response {
  const displayTitle = parseNetworkSubProgramTitleFromIdentifier(identifier);
  return Response.json({
    found: true,
    subProgramId: identifier,
    identifier,
    displayName: displayTitle ?? identifier,
    description: "",
    icon: SHARED_SUBPROGRAM_DEFAULT_ICON,
    kind: 3,
    inputs: [],
    outputs: [],
    bindingHints: [],
    resolveStatusMessage: "",
  });
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const kind = (url.searchParams.get("kind") ?? "global").trim().toLowerCase();
  const id = url.searchParams.get("id")?.trim() ?? "";

  if (!id) {
    return Response.json({ ok: false, error: "id is required" }, { status: 400 });
  }

  if (kind === "shared") {
    if (!isNetworkSubProgramStoredValue(id)) {
      return notFoundResponse(id, "invalid network sub program identifier");
    }
    return sharedSubProgramIoResponse(id);
  }

  const normalizedId = normalizeGlobalSubProgramStoredId(id);
  if (!normalizedId) {
    return Response.json({ ok: false, error: "id is required" }, { status: 400 });
  }

  const result = await runQkrpc(
    ["subprogram", "get", "--id", normalizedId, "--return-mode", "full", "--json"],
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
    return notFoundResponse(normalizedId, "未找到子程序");
  }

  const name = readString(program, "name", "Name", "title", "Title") || normalizedId;
  const { inputs, outputs } = mapSubprogramCompressedVariables(
    program.variables ?? program.Variables,
  );

  return Response.json({
    found: true,
    subProgramId: normalizedId,
    identifier: normalizedId,
    displayName: name,
    description: readString(program, "description", "Description"),
    icon: readString(program, "icon", "Icon"),
    kind: 2,
    inputs,
    outputs,
    bindingHints: [],
    resolveStatusMessage: "",
  });
}
