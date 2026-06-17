import type { DesignerContextSnapshot } from "@/lib/designer-context-types";

function unwrapPayload(parsed: unknown): unknown {
  if (typeof parsed !== "object" || parsed === null) return null;
  const root = parsed as Record<string, unknown>;
  if (typeof root.payload === "object" && root.payload !== null) {
    return root.payload;
  }
  if (typeof root.data === "object" && root.data !== null) {
    const data = root.data as Record<string, unknown>;
    if (typeof data.payload === "object" && data.payload !== null) {
      return data.payload;
    }
    return data;
  }
  return root;
}

/** Parse qkrpc designer.context JSON into a client snapshot. */
export function parseDesignerContext(parsed: unknown): DesignerContextSnapshot {
  const payload = unwrapPayload(parsed);
  if (typeof payload !== "object" || payload === null) {
    return { ok: false, message: "Invalid designer context payload.", designers: [] };
  }

  const root = payload as Record<string, unknown>;
  const designersRaw = Array.isArray(root.designers) ? root.designers : [];
  const designers = designersRaw
    .map((entry) => {
      if (typeof entry !== "object" || entry === null) return null;
      const row = entry as Record<string, unknown>;
      const selectedRaw = Array.isArray(row.selectedSteps) ? row.selectedSteps : [];
      const selectedSteps = selectedRaw
        .map((stepEntry) => {
          if (typeof stepEntry !== "object" || stepEntry === null) return null;
          const step = stepEntry as Record<string, unknown>;
          const index = Number(step.index);
          if (!Number.isFinite(index)) return null;
          return {
            index,
            stepId:
              typeof step.stepId === "string" && step.stepId.trim()
                ? step.stepId.trim()
                : undefined,
            stepRunnerKey:
              typeof step.stepRunnerKey === "string" && step.stepRunnerKey.trim()
                ? step.stepRunnerKey.trim()
                : undefined,
            note:
              typeof step.note === "string" && step.note.trim()
                ? step.note.trim()
                : undefined,
            disabled: step.disabled === true,
          };
        })
        .filter((step): step is NonNullable<typeof step> => step !== null);

      return {
        entityId:
          typeof row.entityId === "string" && row.entityId.trim()
            ? row.entityId.trim()
            : undefined,
        isSubProgram: row.isSubProgram === true,
        isActive: row.isActive === true,
        title:
          typeof row.title === "string" && row.title.trim()
            ? row.title.trim()
            : undefined,
        selectedSteps,
      };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null);

  return {
    ok: root.ok === true,
    message:
      typeof root.message === "string" && root.message.trim()
        ? root.message.trim()
        : undefined,
    designers,
  };
}
