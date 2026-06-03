"use client";

import type { ActionListMeta, ActionListRow } from "@/lib/action-list";
import { formatActionListMetaLine } from "@/lib/action-list";
import { ActionIcon, ActionIconSnapshot } from "./ActionIcon";
import { FaIconProvider } from "./FaIconProvider";

type ActionListViewProps = {
  meta: ActionListMeta;
  items: ActionListRow[];
  emptyMessage?: string;
  /** When false, meta line is omitted (e.g. tool summary already shows it). */
  showMeta?: boolean;
  /** Render only from tool output snapshot, without live icon resolution. */
  snapshot?: boolean;
};

function shortId(id: string): string {
  if (id.length <= 13) return id;
  return `${id.slice(0, 8)}…`;
}

function locationLabel(row: ActionListRow): string {
  const parts: string[] = [];
  if (row.profileName) parts.push(row.profileName);
  if (row.exeFile) parts.push(row.exeFile);
  return parts.join(" / ") || "—";
}

export function ActionListView({
  meta,
  items,
  emptyMessage = "没有匹配的动作",
  showMeta = false,
  snapshot = false,
}: ActionListViewProps) {
  const table = (
    <div className="action-list-table-wrap">
      <table className="action-list-table">
        <thead>
          <tr>
            <th scope="col">名称</th>
            <th scope="col">ID</th>
            {meta.source === "list" && (
              <th scope="col">最后编辑</th>
            )}
            {meta.source === "search" && (
              <th scope="col" className="action-list-col--num">
                相关度
              </th>
            )}
            <th scope="col">位置</th>
          </tr>
        </thead>
        <tbody>
          {items.map((row) => (
            <tr key={row.id}>
              <td className="action-list-title">
                <div className="action-list-title-inner">
                  {snapshot ? (
                    <ActionIconSnapshot spec={row.icon} />
                  ) : (
                    <ActionIcon spec={row.icon} />
                  )}
                  <div className="action-list-title-text">
                    <span className="action-list-name" title={row.title}>
                      {row.title}
                    </span>
                    {row.description && (
                      <span
                        className="action-list-desc"
                        title={row.description}
                      >
                        {row.description}
                      </span>
                    )}
                  </div>
                </div>
              </td>
              <td className="action-list-id">
                <code title={row.id}>{shortId(row.id)}</code>
              </td>
              {meta.source === "list" && (
                <td className="action-list-time">
                  {row.lastEditTimeLocal ?? "—"}
                </td>
              )}
              {meta.source === "search" && (
                <td className="action-list-col--num">
                  {row.score != null ? row.score : "—"}
                </td>
              )}
              <td className="action-list-loc" title={locationLabel(row)}>
                {locationLabel(row)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="action-list">
      {showMeta && (
        <p className="action-list-meta">{formatActionListMetaLine(meta)}</p>
      )}

      {items.length === 0 ? (
        <p className="action-list-empty">{emptyMessage}</p>
      ) : snapshot ? (
        table
      ) : (
        <FaIconProvider specs={items.map((r) => r.icon)}>
          {table}
        </FaIconProvider>
      )}
    </div>
  );
}
