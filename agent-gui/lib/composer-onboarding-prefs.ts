export const COMPOSER_ONBOARDING_DISMISSED_KEY =
  "agent-gui-composer-onboarding-dismissed";

export function loadComposerOnboardingDismissed(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(COMPOSER_ONBOARDING_DISMISSED_KEY) === "1";
  } catch {
    return false;
  }
}

export function storeComposerOnboardingDismissed(dismissed: boolean): void {
  if (typeof window === "undefined") return;
  try {
    if (dismissed) {
      localStorage.setItem(COMPOSER_ONBOARDING_DISMISSED_KEY, "1");
    } else {
      localStorage.removeItem(COMPOSER_ONBOARDING_DISMISSED_KEY);
    }
  } catch {
    /* ignore */
  }
}
