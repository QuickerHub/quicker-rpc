import { pushAppMessage } from "@/lib/app-messages";

const VOICE_STARTING_MESSAGE_ID = "voice-runtime-starting";

/** Toast when user tries voice input while runtime is still booting. */
export function notifyVoiceServiceStarting(): void {
  pushAppMessage({
    id: VOICE_STARTING_MESSAGE_ID,
    kind: "info",
    title: "语音输入",
    body: "语音服务启动中",
    autoDismissMs: 2500,
  });
}
