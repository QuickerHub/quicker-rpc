import type { PinnedAction } from "@/lib/action-context";
import type { BrowserElementTag } from "@/lib/browser-element-tag";
import {
  actionFromTagElement,
  isComposerChipElement,
} from "@/lib/composer-inline";
import { browserElementTagFromDom } from "@/lib/browser-element-tag";

export type ComposerTagPreviewKind = "action" | "subprogram" | "browser-element";

export type ComposerTagPreviewRow = {
  label: string;
  value: string;
  /** Render value in monospace (paths, ids, HTML snippets). */
  mono?: boolean;
};

export type ComposerTagPreviewModel = {
  kind: ComposerTagPreviewKind;
  title: string;
  badge: string;
  rows: ComposerTagPreviewRow[];
  /** Optional multi-line code block shown below rows (e.g. outerHTML). */
  code?: string;
};

function pushRow(
  rows: ComposerTagPreviewRow[],
  label: string,
  value: string | null | undefined,
  options?: { mono?: boolean },
): void {
  const trimmed = value?.trim();
  if (!trimmed) return;
  rows.push({ label, value: trimmed, mono: options?.mono });
}

export function buildActionTagPreview(action: PinnedAction): ComposerTagPreviewModel {
  const isSubprogram = action.kind === "subprogram";
  const rows: ComposerTagPreviewRow[] = [];
  pushRow(rows, "ID", action.id, { mono: true });
  if (isSubprogram && action.callIdentifier) {
    pushRow(rows, "调用标识", action.callIdentifier, { mono: true });
  }
  pushRow(rows, "说明", action.description);
  pushRow(rows, "最近编辑", action.lastEditTimeLocal);

  return {
    kind: isSubprogram ? "subprogram" : "action",
    title: action.title,
    badge: isSubprogram ? "子程序" : "动作",
    rows,
  };
}

export function buildBrowserElementTagPreview(
  element: BrowserElementTag,
): ComposerTagPreviewModel {
  const rows: ComposerTagPreviewRow[] = [];
  pushRow(rows, "页面", element.title ?? undefined);
  pushRow(rows, "URL", element.url, { mono: true });
  pushRow(rows, "DOM Path", element.domPath, { mono: true });
  if (
    element.rectTop != null
    && element.rectLeft != null
    && element.rectWidth != null
    && element.rectHeight != null
  ) {
    pushRow(
      rows,
      "位置",
      `top=${element.rectTop}px, left=${element.rectLeft}px, width=${element.rectWidth}px, height=${element.rectHeight}px`,
      { mono: true },
    );
  }
  pushRow(rows, "React", element.reactComponent);
  pushRow(rows, "ref", element.ref, { mono: true });
  pushRow(rows, "role", element.refRole);
  pushRow(rows, "name", element.refName);
  pushRow(rows, "tag", element.tagName);
  pushRow(rows, "id", element.elementId ? `#${element.elementId}` : undefined, {
    mono: true,
  });
  pushRow(rows, "class", element.className);
  pushRow(rows, "text", element.text);
  pushRow(rows, "href", element.href, { mono: true });
  pushRow(rows, "value", element.value);
  pushRow(rows, "坐标", `(${element.pickX}, ${element.pickY})`, { mono: true });
  pushRow(rows, "snapshot", element.snapshotLine, { mono: true });

  return {
    kind: "browser-element",
    title: element.chipTitle,
    badge: "页面元素",
    rows,
    code: element.outerHtml?.trim() || undefined,
  };
}

export function buildPreviewFromTagElement(
  el: HTMLElement,
): ComposerTagPreviewModel | null {
  if (!isComposerChipElement(el)) return null;
  const browser = browserElementTagFromDom(el);
  if (browser) return buildBrowserElementTagPreview(browser);
  const action = actionFromTagElement(el);
  if (action) return buildActionTagPreview(action);
  return null;
}
