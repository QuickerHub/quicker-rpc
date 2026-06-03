import type { ActionSubProgram } from "@/lib/action-editor/types/common";
import { ActionSubProgramKind } from "@/lib/action-editor/subprograms/subProgramUi";

/**
 * Value for sys:subprogram input param "subProgram", aligned with
 * Quicker.Domain.Actions.X.BuiltinRunners.SubProgramStepHelpers.GetSubProgram resolution.
 */
export function formatSubProgramIdentifier(row: ActionSubProgram): string {
  const name = (row.name ?? "").trim();
  const id = (row.id ?? "").trim();
  if (name.startsWith("%%") || name.startsWith("@@")) {
    return name;
  }
  switch (row.kind) {
    case ActionSubProgramKind.GlobalLink:
      return id.length > 0 ? `%%${id}` : name;
    case ActionSubProgramKind.SharedTemplate: {
      if (name.startsWith("@@")) {
        return name;
      }
      const title = name.length > 0 ? name : id;
      if (id.length > 0) {
        const revision = row.stepCount ?? 0;
        return `@@${id}@${revision}@${title}`;
      }
      return title;
    }
    case ActionSubProgramKind.Internal:
    default:
      return name.length > 0 ? name : id;
  }
}
