"use client";

import type { ActionProjectRow } from "@/lib/action-projects";

type ActionProjectsViewProps = {
  root: string;
  projects: ActionProjectRow[];
};

function shortId(id: string): string {
  if (id.length <= 13) return id;
  return `${id.slice(0, 8)}…`;
}

export function ActionProjectsView({ root, projects }: ActionProjectsViewProps) {
  if (projects.length === 0) {
    return (
      <p className="action-projects-empty">
        <code>{root}</code> 下暂无动作项目；可先 <code>qkrpc_action_get</code> 同步。
      </p>
    );
  }

  return (
    <div className="action-projects">
      <table className="action-projects-table">
        <thead>
          <tr>
            <th scope="col">名称</th>
            <th scope="col">ID</th>
            <th scope="col">目录</th>
          </tr>
        </thead>
        <tbody>
          {projects.map((row) => (
            <tr key={row.path}>
              <td className="action-projects-title" title={row.title ?? row.dirName}>
                {row.title ?? row.dirName}
              </td>
              <td className="action-projects-id">
                {row.actionId ? (
                  <code title={row.actionId}>{shortId(row.actionId)}</code>
                ) : (
                  "—"
                )}
              </td>
              <td className="action-projects-path" title={row.path}>
                <code>{row.dirName}</code>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
