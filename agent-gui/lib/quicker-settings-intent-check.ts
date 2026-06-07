import type {
  SettingsIntentCase,
  SettingsIntentExpect,
} from "@/lib/quicker-settings-intent-cases";

export type SettingsResolvePayload = {
  ok?: boolean;
  intent?: string;
  pageId?: string | null;
  preset?: string | null;
  presetId?: string | null;
  settingKey?: string | null;
  target?: string;
  suggestedAction?: string | null;
  message?: string;
};

export type SettingsIntentCheckIssue = {
  field: string;
  expected: string;
  actual: string;
};

export type SettingsIntentCheckResult = {
  caseId: string;
  label: string;
  utterance: string;
  pass: boolean;
  resolve?: SettingsResolvePayload;
  issues: SettingsIntentCheckIssue[];
  error?: string;
};

function norm(value: string | null | undefined): string {
  return (value ?? "").trim();
}

function compareField(
  field: keyof SettingsIntentExpect,
  expected: string | undefined,
  actual: string,
  issues: SettingsIntentCheckIssue[],
): void {
  if (expected === undefined) return;
  const exp = norm(expected);
  if (exp.length === 0) return;
  if (exp.toLowerCase() !== actual.toLowerCase()) {
    issues.push({ field, expected: exp, actual: actual || "—" });
  }
}

export function evaluateSettingsIntentCase(
  testCase: SettingsIntentCase,
  resolve: SettingsResolvePayload | undefined,
  rpcError?: string,
): SettingsIntentCheckResult {
  if (rpcError) {
    return {
      caseId: testCase.id,
      label: testCase.label,
      utterance: testCase.utterance,
      pass: false,
      issues: [],
      error: rpcError,
    };
  }

  const issues: SettingsIntentCheckIssue[] = [];
  const expect = testCase.expect;
  const actualIntent = norm(resolve?.intent);
  const actualPageId = norm(resolve?.pageId);
  const actualPreset = norm(resolve?.presetId ?? resolve?.preset);
  const actualKey = norm(resolve?.settingKey);
  const actualTarget = norm(resolve?.target);

  compareField("intent", expect.intent, actualIntent, issues);
  compareField("pageId", expect.pageId, actualPageId, issues);
  compareField("presetId", expect.presetId, actualPreset, issues);
  compareField("settingKey", expect.settingKey, actualKey, issues);
  compareField("target", expect.target, actualTarget, issues);

  const pass = issues.length === 0 && resolve?.ok !== false;

  return {
    caseId: testCase.id,
    label: testCase.label,
    utterance: testCase.utterance,
    pass,
    resolve,
    issues,
  };
}

export type SettingsIntentBatchSummary = {
  ok: boolean;
  total: number;
  passed: number;
  failed: number;
  results: SettingsIntentCheckResult[];
};

export function summarizeSettingsIntentBatch(
  results: SettingsIntentCheckResult[],
): SettingsIntentBatchSummary {
  const passed = results.filter((r) => r.pass).length;
  return {
    ok: passed === results.length && results.length > 0,
    total: results.length,
    passed,
    failed: results.length - passed,
    results,
  };
}
