/**
 * Prefer catalog fa: icon from step-runner API; no iconify shortcut (FA resolve handles display).
 */
export function resolveStepIconSpec(catalogIcon: string | undefined, _stepRunnerKey?: string): string {
  return (catalogIcon ?? "").trim();
}
