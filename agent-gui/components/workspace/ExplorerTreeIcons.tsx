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

export function ExplorerFolderIcon({ expanded = false }: { expanded?: boolean } = {}) {
  if (expanded) {
    return (
      <ExplorerTreeSvg className="explorer-tree-svg--folder-outline">
        <path
          fill="currentColor"
          d="M1 3.5A1.5 1.5 0 0 1 2.5 2h2.62l.83.83a.5.5 0 0 0 .35.15H13.5A1.5 1.5 0 0 1 15 4.48V12.5A1.5 1.5 0 0 1 13.5 14h-11A1.5 1.5 0 0 1 1 12.5v-9Z"
        />
      </ExplorerTreeSvg>
    );
  }

  return (
    <ExplorerTreeSvg className="explorer-tree-svg--folder-outline">
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

export { ExplorerFileIcon } from "@/components/workspace/FileTypeIcon";
