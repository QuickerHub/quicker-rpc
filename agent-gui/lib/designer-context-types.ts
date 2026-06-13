/** Snapshot of one open ActionDesigner window (from qkrpc designer.context). */

export type DesignerSelectedStep = {
  index: number;
  stepId?: string;
  stepRunnerKey?: string;
  note?: string;
  disabled?: boolean;
};

export type DesignerWindowContext = {
  entityId?: string;
  isSubProgram?: boolean;
  isActive?: boolean;
  title?: string;
  selectedSteps?: DesignerSelectedStep[];
};

export type DesignerContextSnapshot = {
  ok: boolean;
  message?: string;
  designers: DesignerWindowContext[];
};
