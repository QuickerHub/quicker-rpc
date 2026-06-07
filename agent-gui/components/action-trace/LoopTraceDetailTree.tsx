"use client";

import { ActionTraceTimelineRowView } from "@/components/action-trace/ActionTraceTimelineRow";
import {
  detailTreeNodeHasRunning,
  isDetailTreeBlock,
  resolveDetailBlockHeaderRow,
  type DetailTreeBlock,
  type DetailTreeNode,
} from "@/lib/action-trace-detail-block-tree";

type LoopTraceDetailTreeProps = {
  nodes: DetailTreeNode[];
  collapsedBlockIds: ReadonlySet<string>;
  onToggleBlock: (blockId: string) => void;
};

function CollapsibleBlockNode({
  block,
  collapsedBlockIds,
  onToggleBlock,
}: {
  block: DetailTreeBlock;
  collapsedBlockIds: ReadonlySet<string>;
  onToggleBlock: (blockId: string) => void;
}) {
  const collapsed = collapsedBlockIds.has(block.id);
  const running = detailTreeNodeHasRunning(block);
  const headerRow = resolveDetailBlockHeaderRow(block, collapsed);

  return (
    <li
      className={[
        "loop-trace-detail__block",
        `loop-trace-detail__block--${block.blockType}`,
        collapsed ? "loop-trace-detail__block--collapsed" : "",
        running ? "loop-trace-detail__block--running" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      style={{ ["--trace-depth" as string]: block.begin.depth }}
    >
      <button
        type="button"
        className="loop-trace-detail__block-head-btn"
        aria-expanded={!collapsed}
        aria-label={collapsed ? "展开块内容" : "折叠块内容"}
        onClick={() => onToggleBlock(block.id)}
      >
        <span className="loop-trace-detail__block-chevron" aria-hidden />
        <ActionTraceTimelineRowView row={headerRow} as="div" />
      </button>

      {!collapsed ? (
        <ol className="loop-trace-detail__block-body action-trace-timeline__list">
          {block.children.map((child) => (
            <LoopTraceDetailTreeNode
              key={detailNodeKey(child)}
              node={child}
              collapsedBlockIds={collapsedBlockIds}
              onToggleBlock={onToggleBlock}
            />
          ))}
          {block.end ? (
            <ActionTraceTimelineRowView
              key={`block-end-${block.end.index}-${block.end.event.sequence ?? 0}`}
              row={block.end}
            />
          ) : null}
        </ol>
      ) : null}
    </li>
  );
}

function LoopTraceDetailTreeNode({
  node,
  collapsedBlockIds,
  onToggleBlock,
}: {
  node: DetailTreeNode;
  collapsedBlockIds: ReadonlySet<string>;
  onToggleBlock: (blockId: string) => void;
}) {
  if (isDetailTreeBlock(node)) {
    return (
      <CollapsibleBlockNode
        block={node}
        collapsedBlockIds={collapsedBlockIds}
        onToggleBlock={onToggleBlock}
      />
    );
  }

  return (
    <ActionTraceTimelineRowView
      key={`loop-detail-${node.row.index}-${node.row.event.sequence ?? 0}`}
      row={node.row}
    />
  );
}

function detailNodeKey(node: DetailTreeNode): string {
  if (node.kind === "row") {
    return `row-${node.row.index}-${node.row.event.sequence ?? 0}`;
  }
  return node.id;
}

export function LoopTraceDetailTree({
  nodes,
  collapsedBlockIds,
  onToggleBlock,
}: LoopTraceDetailTreeProps) {
  return (
    <>
      {nodes.map((node) => (
        <LoopTraceDetailTreeNode
          key={detailNodeKey(node)}
          node={node}
          collapsedBlockIds={collapsedBlockIds}
          onToggleBlock={onToggleBlock}
        />
      ))}
    </>
  );
}
