import type { ActionProjectBinding } from "@/lib/action-project-binding";
import type { QkrpcHostBinding } from "@/lib/qkrpc-host-binding-contract";

/** Stored source provenance is display-only; it is not an observation of a live host. */
export function SourceBundleTargetSummary({ actionId, host }: { actionId: string; host: QkrpcHostBinding | null }) {
  const version = host?.quickerVersion?.trim() || "版本未知";
  return <details className="action-project-target" data-source-bundle-target>
    <summary>来源目标：{host ? `${host.hostKind.toUpperCase()} · Quicker ${version}` : "未绑定宿主"} · 当前宿主状态未核验</summary>
    <dl>
      <dt>动作</dt><dd>{actionId}</dd>
      {host ? <>
        <dt>实例</dt><dd>{host.hostInstanceId}</dd>
        <dt>会话</dt><dd>{host.hostSessionId}</dd>
        <dt>端点</dt><dd>{host.endpoint}</dd>
      </> : null}
    </dl>
  </details>;
}

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
