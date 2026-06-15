import { AppLoadingIndicator } from "@/components/shell/AppLoadingIndicator";

/** Lightweight shell frame so boot splash can dismiss before Chat chunk loads. */
export function ChatBootShell() {
  return (
    <div
      className="app-shell app-shell--sidebar-collapsed app-shell--loading"
      aria-busy="true"
    >
      <AppLoadingIndicator variant="panel" />
    </div>
  );
}
