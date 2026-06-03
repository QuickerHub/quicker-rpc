import type { ReactNode } from "react";

/** VS Code–style tree twistie: chevron-right, rotated 90° when expanded. */
export function ExplorerTreeChevron({
  expanded = false,
  hidden,
}: {
  expanded?: boolean;
  hidden?: boolean;
}) {
  if (hidden) {
    return <span className="explorer-tree-chevron explorer-tree-chevron--hidden" aria-hidden />;
  }

  return (
    <span
      className={`explorer-tree-chevron${expanded ? " explorer-tree-chevron--expanded" : ""}`}
      aria-hidden
    >
      <svg className="explorer-tree-chevron-svg" viewBox="0 0 16 16" width={16} height={16}>
        <path
          fill="currentColor"
          d="M6.914 4.636a.5.5 0 0 1 .707 0l3.536 3.536a.5.5 0 0 1 0 .707l-3.536 3.536a.5.5 0 0 1-.707-.707L10.207 8 6.914 5.343a.5.5 0 0 1 0-.707z"
        />
      </svg>
    </span>
  );
}

type ExplorerTreeSvgProps = {
  className?: string;
};

function ExplorerTreeSvg({
  className,
  children,
}: ExplorerTreeSvgProps & { children: ReactNode }) {
  return (
    <svg
      width={16}
      height={16}
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden
      className={className ? `explorer-tree-svg ${className}` : "explorer-tree-svg"}
    >
      {children}
    </svg>
  );
}

/** Root `.quicker/actions` — open collection (accent tint, distinct from project folders). */
export function ExplorerRootIcon({ expanded }: { expanded: boolean }) {
  if (expanded) {
    return (
      <ExplorerTreeSvg className="explorer-tree-svg--root">
        <path
          fill="currentColor"
          d="M1 3.5A1.5 1.5 0 0 1 2.5 2h2.62l.83.83a.5.5 0 0 0 .35.15H13.5A1.5 1.5 0 0 1 15 4.48V12.5A1.5 1.5 0 0 1 13.5 14h-11A1.5 1.5 0 0 1 1 12.5v-9Z"
        />
      </ExplorerTreeSvg>
    );
  }

  return (
    <ExplorerTreeSvg className="explorer-tree-svg--root">
      <path
        fill="currentColor"
        d="M14.25 3.75H7.96l-.9-.9a.5.5 0 0 0-.35-.15H2.5a1.5 1.5 0 0 0-1.5 1.5v7.5a1.5 1.5 0 0 0 1.5 1.5h10.75a1.5 1.5 0 0 0 1.5-1.5v-6.5a1.5 1.5 0 0 0-1.5-1.5Z"
      />
    </ExplorerTreeSvg>
  );
}

export function ExplorerFolderIcon({ expanded }: { expanded: boolean }) {
  if (expanded) {
    return (
      <ExplorerTreeSvg className="explorer-tree-svg--folder-open">
        <path
          fill="currentColor"
          d="M1 3.5A1.5 1.5 0 0 1 2.5 2h2.62l.83.83a.5.5 0 0 0 .35.15H13.5A1.5 1.5 0 0 1 15 4.48V12.5A1.5 1.5 0 0 1 13.5 14h-11A1.5 1.5 0 0 1 1 12.5v-9Z"
        />
        <path fill="currentColor" d="M1 6.2h14v6.3a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 1 12.5V6.2Z" opacity={0.72} />
      </ExplorerTreeSvg>
    );
  }

  return (
    <ExplorerTreeSvg className="explorer-tree-svg--folder">
      <path
        fill="currentColor"
        d="M14.25 3.75H7.96l-.9-.9a.5.5 0 0 0-.35-.15H2.5a1.5 1.5 0 0 0-1.5 1.5v7.5a1.5 1.5 0 0 0 1.5 1.5h10.75a1.5 1.5 0 0 0 1.5-1.5v-6.5a1.5 1.5 0 0 0-1.5-1.5Z"
      />
    </ExplorerTreeSvg>
  );
}

export function ExplorerImportSpinner() {
  return (
    <span className="explorer-tree-icon explorer-tree-icon--importing" aria-hidden>
      <svg className="explorer-tree-svg explorer-tree-svg--spinner" viewBox="0 0 16 16" width={16} height={16}>
        <circle
          cx="8"
          cy="8"
          r="5.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeDasharray="20 12"
        />
      </svg>
    </span>
  );
}

export function ExplorerFileIcon({ name }: { name: string }) {
  const ext = name.includes(".") ? name.split(".").pop()?.toLowerCase() : "";

  if (ext === "json") {
    return (
      <ExplorerTreeSvg className="explorer-tree-svg--file-json">
        <path
          fill="currentColor"
          d="M9.5 1.5H4.5A1.5 1.5 0 0 0 3 3v10a1.5 1.5 0 0 0 1.5 1.5h7A1.5 1.5 0 0 0 13 13V5.5L9.5 1.5Z"
          opacity={0.35}
        />
        <path
          fill="currentColor"
          d="M9 1.5V5a.5.5 0 0 0 .5.5H13"
          opacity={0.45}
        />
        <path
          fill="currentColor"
          d="M5.2 8.1h.9v2.2h-.9V8.1Zm2.1 0h.9c.8 0 1.3.45 1.3 1.1s-.35 1.05-.95 1.15l1.05 1.05h-1.1l-.95-1.05h-.35v1.05h-.9V8.1Zm.9 1.65c.4 0 .6-.2.6-.55s-.2-.55-.6-.55h-.35v1.1h.35Z"
        />
      </ExplorerTreeSvg>
    );
  }

  if (ext === "cs") {
    return (
      <ExplorerTreeSvg className="explorer-tree-svg--file-cs">
        <path
          fill="currentColor"
          d="M9.5 1.5H4.5A1.5 1.5 0 0 0 3 3v10a1.5 1.5 0 0 0 1.5 1.5h7A1.5 1.5 0 0 0 13 13V5.5L9.5 1.5Z"
          opacity={0.35}
        />
        <path fill="currentColor" d="M9 1.5V5a.5.5 0 0 0 .5.5H13" opacity={0.45} />
        <path
          fill="currentColor"
          d="M5.35 8.35h.75l1.05 2.55h-.85l-.2-.55h-1.05l-.2.55h-.85l1.05-2.55Zm.55 1.55-.35-.95-.35.95h.7Z"
        />
        <path fill="currentColor" d="M8.55 8.35H10v.65H9.3v1.9h-.75v-1.9h-.7v-.65Z" />
      </ExplorerTreeSvg>
    );
  }

  return (
    <ExplorerTreeSvg className="explorer-tree-svg--file">
      <path
        fill="currentColor"
        d="M9.5 1.5H4.5A1.5 1.5 0 0 0 3 3v10a1.5 1.5 0 0 0 1.5 1.5h7A1.5 1.5 0 0 0 13 13V5.5L9.5 1.5Z"
        opacity={0.4}
      />
      <path fill="currentColor" d="M9 1.5V5a.5.5 0 0 0 .5.5H13" opacity={0.5} />
      <path fill="currentColor" d="M5 8h6v1H5V8Zm0 2h4.2v1H5v-1Z" opacity={0.85} />
    </ExplorerTreeSvg>
  );
}
