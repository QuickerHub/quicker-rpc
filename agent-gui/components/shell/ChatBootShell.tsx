/** Lightweight shell frame so boot splash can dismiss before Chat chunk loads. */
export function ChatBootShell() {
  return (
    <div
      className="app-shell app-shell--sidebar-collapsed app-shell--loading"
      aria-busy="true"
      role="status"
    >
      <div className="workspace-loading">正在加载界面…</div>
    </div>
  );
}
