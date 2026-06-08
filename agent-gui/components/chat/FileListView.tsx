import type { WorkspaceFilePayload } from "@/lib/workspace-file-tool";

export function FileListView({
  payload,
}: {
  payload: Extract<WorkspaceFilePayload, { action: "file-list" }>;
}) {
  const dirs = payload.entries.filter((e) => e.isDirectory);
  const files = payload.entries.filter((e) => !e.isDirectory);

  return (
    <div className="tool-file-list">
      <div className="file-editor-header file-editor-header--list">
        <span className="file-editor-hash" aria-hidden>
          #
        </span>
        <span className="file-editor-name">{payload.path}</span>
        <span className="file-editor-stat file-editor-stat--neutral">
          {payload.entries.length}
        </span>
      </div>
      <ul className="tool-file-list-entries">
        {dirs.map((e) => (
          <li key={e.path} className="tool-file-list-item tool-file-list-item--dir">
            <span className="tool-file-list-name">{e.name}/</span>
            <span className="tool-file-list-path">{e.path}</span>
          </li>
        ))}
        {files.map((e) => (
          <li key={e.path} className="tool-file-list-item">
            <span className="tool-file-list-name">{e.name}</span>
            <span className="tool-file-list-path">{e.path}</span>
          </li>
        ))}
      </ul>
      {payload.truncated ? (
        <p className="file-editor-footnote file-editor-footnote--warn">目录列表已截断</p>
      ) : null}
      {payload.entries.length === 0 ? (
        <p className="file-editor-footnote">（空目录）</p>
      ) : null}
    </div>
  );
}
