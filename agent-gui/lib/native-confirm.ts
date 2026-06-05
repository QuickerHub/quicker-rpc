import { appConfirm } from "@/lib/app-confirm";

/** Ok/Cancel dialog via in-app popup (Tauri shell and browser). */
export async function nativeConfirm(
  message: string,
  options?: { title?: string; danger?: boolean },
): Promise<boolean> {
  return appConfirm(message, {
    title: options?.title ?? "QuickerAgent",
    danger: options?.danger,
  });
}
