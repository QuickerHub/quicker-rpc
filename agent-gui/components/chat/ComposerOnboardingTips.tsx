"use client";

import { useCallback, useEffect, useState } from "react";
import { COMPOSER_ONBOARDING_TIPS } from "@/lib/composer-onboarding-tips";
import {
  loadComposerOnboardingDismissed,
  storeComposerOnboardingDismissed,
} from "@/lib/composer-onboarding-prefs";
import type { AppSettingsTabId } from "@/lib/app-settings-tabs";
import type { LlmProviderId } from "@/lib/llm-providers";
import { useSidePanelExplorerToggle } from "@/lib/use-side-panel-explorer-toggle";

type ComposerOnboardingTipsProps = {
  disabled?: boolean;
  onOpenSettings: (
    targetProviderId?: LlmProviderId,
    tab?: AppSettingsTabId,
  ) => void;
  onTryMention: () => void;
  onFocusComposer: () => void;
};

export function ComposerOnboardingTips({
  disabled = false,
  onOpenSettings,
  onTryMention,
  onFocusComposer,
}: ComposerOnboardingTipsProps) {
  const [dismissed, setDismissed] = useState(true);
  const { toggle: toggleExplorer } = useSidePanelExplorerToggle();

  useEffect(() => {
    setDismissed(loadComposerOnboardingDismissed());
  }, []);

  const dismiss = useCallback(() => {
    storeComposerOnboardingDismissed(true);
    setDismissed(true);
  }, []);

  const runTipAction = useCallback(
    (action: (typeof COMPOSER_ONBOARDING_TIPS)[number]["action"]) => {
      if (disabled) return;
      switch (action) {
        case "try-mention":
          onTryMention();
          break;
        case "focus-composer":
          onFocusComposer();
          break;
        case "open-settings":
          onOpenSettings(undefined, "models");
          break;
        case "toggle-explorer":
          toggleExplorer();
          break;
      }
    },
    [
      disabled,
      onFocusComposer,
      onOpenSettings,
      onTryMention,
      toggleExplorer,
    ],
  );

  if (dismissed) return null;

  return (
    <section
      className="composer-onboarding"
      aria-label="新手引导"
    >
      <div className="composer-onboarding__head">
        <h2 className="composer-onboarding__title">快速上手</h2>
        <button
          type="button"
          className="composer-onboarding__dismiss"
          disabled={disabled}
          onClick={dismiss}
        >
          不再显示
        </button>
      </div>
      <ul className="composer-onboarding__tips">
        {COMPOSER_ONBOARDING_TIPS.map((tip) => (
          <li key={tip.id}>
            <button
              type="button"
              className="composer-onboarding__tip"
              disabled={disabled}
              title={tip.hint}
              onMouseDown={(event) => {
                if (tip.action === "try-mention") {
                  event.preventDefault();
                }
              }}
              onClick={() => runTipAction(tip.action)}
            >
              <span className="composer-onboarding__tip-label">
                {tip.id === "mention" ? (
                  <>
                    <kbd className="composer-onboarding__kbd">@</kbd>
                    {" 引用动作"}
                  </>
                ) : (
                  tip.label
                )}
              </span>
              <span className="composer-onboarding__tip-hint">{tip.hint}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
