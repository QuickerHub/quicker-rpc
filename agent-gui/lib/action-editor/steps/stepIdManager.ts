import type { ActionStep } from "@/lib/action-editor/types/common";

const STEP_ID_PREFIX = "s-";
const STEP_ID_NUMERIC_PATTERN = /^s-(\d+)$/;

function collectStepIds(items: ActionStep[], out: Set<string>): void {
  for (const item of items) {
    const id = (item.stepId ?? "").trim();
    if (id) {
      out.add(id);
    }
    collectStepIds(item.ifSteps ?? [], out);
    collectStepIds(item.elseSteps ?? [], out);
  }
}

/**
 * Generates stable incremental step IDs (`s-1`, `s-2`, ...), while avoiding collisions
 * with existing IDs in the current step tree.
 */
export class StepIdManager {
  private usedIds: Set<string> = new Set<string>();
  private nextNumericId: number = 1;

  public syncFromSteps(items: ActionStep[]): void {
    const used = new Set<string>();
    collectStepIds(items, used);
    this.usedIds = used;

    let maxNumericId = 0;
    for (const id of used) {
      const match = STEP_ID_NUMERIC_PATTERN.exec(id);
      if (!match) {
        continue;
      }
      const parsed = Number.parseInt(match[1] ?? "", 10);
      if (!Number.isNaN(parsed) && parsed > maxNumericId) {
        maxNumericId = parsed;
      }
    }
    this.nextNumericId = maxNumericId + 1;
  }

  public nextId(): string {
    while (true) {
      const candidate = `${STEP_ID_PREFIX}${this.nextNumericId}`;
      this.nextNumericId += 1;
      if (!this.usedIds.has(candidate)) {
        this.usedIds.add(candidate);
        return candidate;
      }
    }
  }
}
