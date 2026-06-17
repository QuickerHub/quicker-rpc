import { invokeDesktop, listenDesktop } from "@/lib/desktop-bridge";
import { isElectronShell } from "@/lib/desktop-shell";

export type KeyInputCaptureInputEvent = {
  type: "keyDown" | "keyUp";
  key: string;
  code: string;
  control: boolean;
  shift: boolean;
  alt: boolean;
  meta: boolean;
};

function toKeyboardEvent(input: KeyInputCaptureInputEvent): KeyboardEvent {
  return {
    code: input.code,
    key: input.key,
    ctrlKey: input.control,
    shiftKey: input.shift,
    altKey: input.alt,
    metaKey: input.meta,
  } as KeyboardEvent;
}

export function supportsElectronKeyInputCapture(): boolean {
  return isElectronShell();
}

/** Begin main-process capture (swallows shortcuts); returns teardown. */
export async function startElectronKeyInputCapture(
  onInput: (event: KeyboardEvent, phase: "keydown" | "keyup") => void,
): Promise<() => Promise<void>> {
  await invokeDesktop("key_input_capture_begin");
  const unlisten = await listenDesktop("key_input_capture", (payload) => {
    const input = payload as KeyInputCaptureInputEvent;
    if (input.type !== "keyDown" && input.type !== "keyUp") {
      return;
    }
    const phase = input.type === "keyDown" ? "keydown" : "keyup";
    onInput(toKeyboardEvent(input), phase);
  });
  return async () => {
    unlisten();
    try {
      await invokeDesktop("key_input_capture_end");
    } catch {
      // Shell may be shutting down.
    }
  };
}
