export type QuickerBenchIoField = {
  key: string;
  type: string;
  required?: boolean;
};

export type QuickerBenchIoContract = {
  inputs: QuickerBenchIoField[];
  outputs: QuickerBenchIoField[];
  forbiddenStepKeys?: string[];
};

export type QuickerBenchTask = {
  id: string;
  tier: string;
  category: string;
  label: string;
  userPrompt: string;
  ioContract: QuickerBenchIoContract;
  deliverable?: {
    titlePattern?: string;
    minSteps?: number;
    requiredStepKeys?: string[];
  };
  reference?: {
    sharedActionId?: string;
    localHint?: string;
  };
  runInput?: {
    initialVars?: Record<string, string | number>;
  };
  oracle: {
    script?: string;
    fixtureSet?: string;
    outputVars?: Record<string, string | number | boolean>;
    tolerance?: Record<string, number>;
    snapshot?: { capturedAt?: string; note?: string };
    note?: string;
  };
  verify: {
    mockProfile: string;
    modes?: Array<"mock-oracle" | "compile-only">;
  };
  skills: string[];
};

export type QuickerBenchCatalog = {
  version: number;
  title: string;
  description: string;
  coreTaskIds: string[];
  tasks: QuickerBenchTask[];
};

export const QUICKERBENCH_CORE_TASK_IDS = [
  "user-action-likes-total",
] as const;

export type FixtureManifest = {
  url: string;
  capturedAt: string;
  pages: number;
  totalActions: number | null;
  parsedCount: number;
  totalLikes: number;
  pageFiles: string[];
  oracle: {
    totalLikes: number;
    actionCount: number;
  };
};
