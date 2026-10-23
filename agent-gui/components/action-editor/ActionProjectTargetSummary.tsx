import type { ActionProjectBinding } from "@/lib/action-project-binding";

export function ActionProjectTargetSummary({ binding, error }: { binding: ActionProjectBinding | null | undefined; error?: string }) {
  if (error) return <p className="workspace-explorer-hint workspace-explorer-hint--err" role="alert">无法确认动作目标：{error}</p>;
  if (binding === undefined) return <p className="action-project-target" role="status">正在读取动作目标…</p>;
  if (binding === null) return <p className="action-project-target" role="status">未绑定宿主 · 可保存到工作区，无法同步到 Quicker</p>;
  const host = binding.hostBinding;
  const version = typeof host.quickerVersion === "string" && host.quickerVersion.trim() ? host.quickerVersion : "版本未知";
  return <details className="action-project-target">
    <summary>目标：{host.hostKind.toUpperCase()} · Quicker {version}</summary>
    <dl>
      <dt>动作</dt><dd>{binding.actionId}</dd>
      <dt>实例</dt><dd>{host.hostInstanceId}</dd>
      <dt>会话</dt><dd>{host.hostSessionId}</dd>
      <dt>端点</dt><dd>{host.endpoint}</dd>
    </dl>
  </details>;
}
