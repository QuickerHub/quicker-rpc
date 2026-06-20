import {
  pushAppMessage,
  type AppMessageKind,
} from "@/lib/app-messages";
import { isAppWindowFocused } from "@/lib/app-window-focus";
import { showThreadRunNativeNotification } from "@/lib/desktop-native-notification";
import { plainTitleText } from "@/lib/plain-title-text";
import { markThreadNeedsAttention } from "@/lib/thread-attention";

export type ThreadRunCompleteNotifyInput = {
  threadId: string;
  threadTitle: string;
  status: string;
  pendingApprovalCount: number;
  pendingAskQuestionCount: number;
  onActivate: () => void;
};

export function buildThreadRunCompleteToast(
  input: ThreadRunCompleteNotifyInput,
): {
  kind: AppMessageKind;
  title: string;
  body: string;
} {
  const title = plainTitleText(input.threadTitle);

  if (input.status === "error") {
    return {
      kind: "error",
      title,
      body: "任务出错，点击查看",
    };
  }

  if (input.pendingApprovalCount > 0) {
    return {
      kind: "warning",
      title,
      body:
        input.pendingApprovalCount === 1
          ? "等待确认 1 个操作，点击查看"
          : `等待确认 ${input.pendingApprovalCount} 个操作，点击查看`,
    };
  }

  if (input.pendingAskQuestionCount > 0) {
    return {
      kind: "warning",
      title,
      body: "等待你的选择，点击查看",
    };
  }

  return {
    kind: "success",
    title,
    body: "任务已完成，点击查看",
  };
}

export function pushThreadRunCompleteToast(
  input: ThreadRunCompleteNotifyInput,
): void {
  const toast = buildThreadRunCompleteToast(input);
  const toastId = `thread-run-complete:${input.threadId}`;

  pushAppMessage({
    id: toastId,
    kind: toast.kind,
    title: toast.title,
    body: toast.body,
    autoDismissMs: 12_000,
    onClick: input.onActivate,
  });
}

export function resolveThreadRunCompleteNotifyChannel(
  appWindowFocused: boolean,
): "in-app" | "native" {
  return appWindowFocused ? "in-app" : "native";
}

/** Notify when a background tab finishes an agent run. */
export function notifyBackgroundThreadRunComplete(
  input: ThreadRunCompleteNotifyInput & {
    visible: boolean;
    ephemeral?: boolean;
  },
): void {
  if (input.visible || input.ephemeral) return;

  markThreadNeedsAttention(input.threadId);
  const toast = buildThreadRunCompleteToast(input);
  const channel = resolveThreadRunCompleteNotifyChannel(isAppWindowFocused());

  if (channel === "in-app") {
    pushThreadRunCompleteToast(input);
    return;
  }

  void showThreadRunNativeNotification({
    threadId: input.threadId,
    title: toast.title,
    body: toast.body,
  }).then((shown) => {
    if (!shown) {
      pushThreadRunCompleteToast(input);
    }
  });
}
