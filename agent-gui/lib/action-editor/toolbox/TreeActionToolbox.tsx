"use client";

import { useDesignerCatalogPort } from "../catalog/DesignerCatalogProvider";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type KeyboardEvent,
  type UIEvent
} from "react";
import { getActionDesignerBackendBaseUrl } from "../shared/actionDesignerBackendBaseUrl";
import { IconControl } from "../shared/IconControl";
const AD_FA_SPEC = { search: "fa:Light_MagnifyingGlass", variableSort: "fa:Light_ArrowDownAZ", toolboxExpandAll: "fa:Light_ChevronsDown", toolboxCollapseAll: "fa:Light_ChevronsUp" };
import FilterBox from "../shared/FilterBox";
import { useToolboxCatalog } from "./useToolboxCatalog";
import { fetchToolboxModuleSearch } from "../steps/stepQuickInsertApi";
import type { ToolboxDragPayload } from "../steps/toolboxStepFactory";
import type { QuickInsertCandidate } from "../steps/stepQuickInsertCandidates";
import type { StepRunnerItem } from "../types/action_query";
import {
  bestToolboxSearchInsertPayload,
  buildParentToolboxPayload,
  buildToolboxSearchTreeMeta,
  compositeSubHitKey,
  getToolboxSearchMatchedSubItems,
  toolboxDisplayNameHtml,
  type ToolboxSearchTreeMeta
} from "./toolboxSearchTree";
import {
  TOOLBOX_ALL_TAB_KEY,
  TOOLBOX_FAVORITES_TAB_KEY,
  buildToolboxTabs,
  collectToolboxCategoryKeys,
  preferredToolboxTabKey,
  toolboxNodeInTab,
  visibleToolboxTabs,
  type ToolboxTab
} from "./toolboxCategories";
import {
  TOOLBOX_SORT_OPTIONS,
  sortToolboxNodes,
  toolboxSortModeLabel,
  type ToolboxSortMode,
} from "./toolboxSort";
import type { ToolboxInsertHandler } from "./toolboxInsertionRegistry";

const EMPTY_FAVORITES = { keys: new Set<string>(), useCounts: new Map<string, number>(), status: "ready" as string, error: undefined as string | undefined };

type ToolboxSubItem = {
  key: string;
  name: string;
  description?: string;
  contextSuffix?: string;
};

type ToolboxNode = {
  key: string;
  name: string;
  description?: string;
  /** Quicker icon string, e.g. fa:Light_Table:#6aaded */
  icon?: string;
  /** StepRunnerCategory enum name from the host (e.g. SoftInteraction). */
  category: string;
  /** Extra tabs this module is also listed under (WPF parity). */
  secondaryCategories: string[];
  keywords?: string[];
  subItems: ToolboxSubItem[];
};

function toToolboxNode(item: StepRunnerItem): ToolboxNode {
  return {
    key: item.key,
    name: item.name,
    description: item.description ?? "",
    icon: item.icon?.trim() || undefined,
    category: (item.category ?? "").trim(),
    secondaryCategories: (item.secondaryCategories ?? []).map((c) => c.trim()).filter(Boolean),
    keywords: item.keywords ?? [],
    subItems: item.subItems ?? []
  };
}

function isTextMatch(text: string | undefined, query: string): boolean {
  if (!text) return false;
  return text.toLowerCase().includes(query.toLowerCase());
}

/** Matches WPF <see cref="TreeActionToolboxViewModel.SubItemMatches"/>. */
function matchesSubItem(sub: ToolboxSubItem, query: string): boolean {
  if (!query) return true;
  if (isTextMatch(sub.name, query)) return true;
  if (isTextMatch(sub.key, query)) return true;
  if (isTextMatch(sub.description, query)) return true;
  return false;
}

/** Matches WPF <see cref="TreeActionToolboxViewModel.StepSelfMatches"/>. */
function stepSelfMatches(node: ToolboxNode, query: string): boolean {
  if (!query) return true;
  if (isTextMatch(node.name, query)) return true;
  if (isTextMatch(node.key, query)) return true;
  if (isTextMatch(node.description, query)) return true;
  return (node.keywords ?? []).some((x) => isTextMatch(x, query));
}

/** Matches WPF <see cref="TreeActionToolboxViewModel.StepMatchesSearchText"/>. */
function nodeMatchesSearch(node: ToolboxNode, query: string): boolean {
  const q = query.trim();
  if (!q) return true;
  return stepSelfMatches(node, q) || node.subItems.some((sub) => matchesSubItem(sub, q));
}

/** Parent row: `node:<key>`; sub row: `sub:<parentKey>:<subKey>` */
function toolboxSelectionId(nodeKey: string): string {
  return `node:${nodeKey}`;
}

function toolboxSubSelectionId(nodeKey: string, subKey: string): string {
  return `sub:${nodeKey}:${subKey}`;
}

const TOOLBOX_SEARCH_DEBOUNCE_MS = 50;

type RunnerHit = Extract<QuickInsertCandidate, { kind: "runner" }>;

/** Shared by toolbox drag and double-click insert (aligns with WPF ToolSubItemNode). */
function buildSubToolboxPayload(
  node: ToolboxNode,
  sub: ToolboxSubItem,
  searchTreeMeta: ToolboxSearchTreeMeta | null,
  catalog: StepRunnerItem[],
  nodes: ToolboxNode[]
): ToolboxDragPayload {
  const subKey = (sub.key ?? "").trim();
  const backendHit = searchTreeMeta?.subHitByComposite.get(compositeSubHitKey(node.key, subKey));
  if (backendHit) {
    return backendHit.payload;
  }
  const isPeerRunner =
    catalog.length > 0
      ? catalog.some((it) => (it.key ?? "").trim() === subKey)
      : nodes.some((n) => n.key === subKey);
  return isPeerRunner
    ? { stepRunnerKey: subKey, icon: node.icon }
    : {
        stepRunnerKey: node.key,
        icon: node.icon,
        controlFieldValue: subKey
      };
}

function setToolboxDragPayload(event: DragEvent<HTMLElement>, payload: ToolboxDragPayload): void {
  event.dataTransfer.effectAllowed = "copy";
  event.dataTransfer.setData("text/plain", payload.stepRunnerKey);
  event.dataTransfer.setData("application/x-quicker-toolbox-step", JSON.stringify(payload));
}

function getToolboxMatchedSubItems(
  node: ToolboxNode,
  isSearchMode: boolean,
  searchTreeMeta: ToolboxSearchTreeMeta | null,
  filterQuery: string,
  catalog?: StepRunnerItem[]
): ToolboxSubItem[] {
  if (isSearchMode && !searchTreeMeta) {
    return [];
  }
  if (isSearchMode && searchTreeMeta) {
    return getToolboxSearchMatchedSubItems(node, searchTreeMeta, catalog);
  }
  const q = filterQuery.trim();
  if (!q) {
    return node.subItems;
  }
  return node.subItems.filter((sub) => matchesSubItem(sub, q));
}

function getToolboxNodeExpanded(
  hasChildren: boolean,
  matchedSubItems: ToolboxSubItem[],
  isSearchMode: boolean,
  filterQuery: string,
  expandedKeys: Record<string, boolean>,
  nodeKey: string
): boolean {
  if (!hasChildren) {
    return false;
  }
  if (isSearchMode) {
    return matchedSubItems.length > 0;
  }
  const q = filterQuery.trim();
  if (q) {
    return matchedSubItems.length > 0;
  }
  return expandedKeys[nodeKey] ?? false;
}

/**
 * Use a compact clone as drag preview so the browser does not snapshot the whole .toolbox-tree scroll area.
 */
function setToolboxRowDragImage(event: DragEvent<HTMLElement>): void {
  const source = event.currentTarget;
  const dt = event.dataTransfer;
  if (!dt) {
    return;
  }

  const clone = source.cloneNode(true) as HTMLElement;
  clone.removeAttribute("draggable");
  clone.removeAttribute("tabindex");
  clone.classList.remove("selected");
  clone.classList.add("toolbox-drag-ghost-snapshot");
  clone.setAttribute("aria-hidden", "true");
  clone.querySelectorAll(".toolbox-expand").forEach((el) => {
    el.remove();
  });

  document.body.appendChild(clone);

  const rect = source.getBoundingClientRect();
  const fallbackX = Math.min(24, Math.max(8, rect.width * 0.35));
  const fallbackY = Math.min(16, Math.max(8, rect.height * 0.45));
  const ox =
    rect.width > 0 ? Math.max(4, Math.min(event.clientX - rect.left, rect.width - 4)) : fallbackX;
  const oy =
    rect.height > 0 ? Math.max(4, Math.min(event.clientY - rect.top, rect.height - 4)) : fallbackY;

  try {
    dt.setDragImage(clone, ox, oy);
  } catch {
    clone.remove();
    return;
  }

  const onEnd = (): void => {
    clone.remove();
    source.removeEventListener("dragend", onEnd);
  };
  source.addEventListener("dragend", onEnd);
}

function highlightText(text: string, query: string): JSX.Element {
  if (!query) return <>{text}</>;
  const index = text.toLowerCase().indexOf(query.toLowerCase());
  if (index < 0) return <>{text}</>;
  const left = text.slice(0, index);
  const mid = text.slice(index, index + query.length);
  const right = text.slice(index + query.length);
  return (
    <>
      {left}
      <mark className="toolbox-mark">{mid}</mark>
      {right}
    </>
  );
}

type ToolboxLoadPhase = "loading" | "ready" | "error";

export type TreeActionToolboxProps = {
  active?: boolean;
  onInsertAtEnd: ToolboxInsertHandler;
};

/** Quicker's module tree; data comes through this application's existing UI catalog ports. */
export default function TreeActionToolbox({ active = true, onInsertAtEnd }: TreeActionToolboxProps): JSX.Element {
  const readOnly = !active;
  const [error, setError] = useState("");
  const [searchEpoch, setSearchEpoch] = useState(0);
  const showToast = useCallback((message: string, _options?: { variant?: string }) => setError(message), []);
  const [filterText, setFilterText] = useState<string>("");
  const [debouncedFilter, setDebouncedFilter] = useState<string>("");
  const [searchItems, setSearchItems] = useState<QuickInsertCandidate[]>([]);
  const [searchHasMore, setSearchHasMore] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchLoadingMore, setSearchLoadingMore] = useState(false);
  const [selectedTab, setSelectedTab] = useState<string>(TOOLBOX_ALL_TAB_KEY);
  const [expandedKeys, setExpandedKeys] = useState<Record<string, boolean>>({});
  const [selectedTreeId, setSelectedTreeId] = useState<string>("");
  const initialTabResolvedRef = useRef(false);
  const backendBaseUrl = useMemo(() => getActionDesignerBackendBaseUrl(), []);
  // Shared, etag-validated catalog store: first render already has the cached copy (no loading flash),
  // and identities only change when the host catalog actually changed.
  const catalogPort = useDesignerCatalogPort();
  const catalogOwner = useRef(catalogPort);
  const runnerCatalog = useToolboxCatalog();
  const favorites = EMPTY_FAVORITES;
  const [sortMode, setSortMode] = useState<ToolboxSortMode>("recommend");
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  const sortMenuRef = useRef<HTMLDivElement | null>(null);
  const runnerCatalogItems: StepRunnerItem[] = runnerCatalog.items;
  const nodes = useMemo(() => runnerCatalogItems.map(toToolboxNode), [runnerCatalogItems]);
  const hasCatalogFavorite = useMemo(
    () => nodes.some((node) => favorites.keys.has(node.key)),
    [favorites.keys, nodes],
  );
  const tabs: ToolboxTab[] = useMemo(
    () => buildToolboxTabs(runnerCatalog.categories, nodes, hasCatalogFavorite),
    [hasCatalogFavorite, runnerCatalog.categories, nodes]
  );
  const loadPhase: ToolboxLoadPhase = runnerCatalog.hasCatalog
    ? "ready"
    : runnerCatalog.status === "error"
      ? "error"
      : "loading";
  const treeRef = useRef<HTMLDivElement | null>(null);
  const searchSeqRef = useRef(0);
  const searchAppendLockRef = useRef(false);
  const searchItemsRef = useRef<QuickInsertCandidate[]>([]);
  searchItemsRef.current = searchItems;

  useEffect(() => {
    if (loadPhase === "error") {
      showToast(`模块列表加载失败：${runnerCatalog.error ?? "未知错误"}`, { variant: "error" });
    }
  }, [loadPhase, runnerCatalog.error, showToast]);

  useEffect(() => {
    if (favorites.status === "error") {
      showToast(`模块收藏加载失败：${favorites.error ?? "未知错误"}`, { variant: "error" });
    }
  }, [favorites.error, favorites.status, showToast]);

  useLayoutEffect(() => {
    if (initialTabResolvedRef.current) {
      return;
    }
    if (favorites.status === "idle" || favorites.status === "loading") {
      return;
    }
    if (!runnerCatalog.hasCatalog && runnerCatalog.status !== "error") {
      return;
    }
    if (filterText.trim()) {
      initialTabResolvedRef.current = true;
      return;
    }
    initialTabResolvedRef.current = true;
    setSelectedTab(preferredToolboxTabKey(hasCatalogFavorite));
  }, [favorites.status, filterText, hasCatalogFavorite, runnerCatalog.hasCatalog, runnerCatalog.status]);

  const selectToolboxTab = useCallback((tabKey: string): void => {
    initialTabResolvedRef.current = true;
    setSelectedTab(tabKey);
  }, []);

  useEffect(() => {
    if (selectedTab !== TOOLBOX_ALL_TAB_KEY && !tabs.some((tab) => tab.key === selectedTab)) {
      setSelectedTab(TOOLBOX_ALL_TAB_KEY);
    }
  }, [selectedTab, tabs]);

  const filterQuery = filterText.trim();
  const isSearchMode = filterQuery.length > 0;

  useEffect(() => {
    if (!filterQuery) {
      setDebouncedFilter("");
      return;
    }
    const t = window.setTimeout(() => setDebouncedFilter(filterQuery), TOOLBOX_SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(t);
  }, [filterQuery]);

  useEffect(() => {
    if (!active || !debouncedFilter) {
      searchSeqRef.current += 1;
      setSearchItems([]);
      setSearchHasMore(false);
      setSearchLoading(false);
      setSearchLoadingMore(false);
      return;
    }
    const seq = ++searchSeqRef.current;
    const ac = new AbortController();
    setSearchLoading(true);
    void (async () => {
      try {
        const res = await fetchToolboxModuleSearch(
          backendBaseUrl,
          { keyword: debouncedFilter, skip: 0 },
          ac.signal,
          catalogPort,
        );
        if (seq !== searchSeqRef.current) {
          return;
        }
        const runners = res.items.filter((c): c is Extract<QuickInsertCandidate, { kind: "runner" }> => c.kind === "runner");
        setSearchItems(runners);
        setSearchHasMore(res.hasMore);
      } catch (error) {
        if (ac.signal.aborted) {
          return;
        }
        if (seq !== searchSeqRef.current) {
          return;
        }
        showToast(`模块搜索失败：${String(error)}`, { variant: "error" });
        setSearchItems([]);
        setSearchHasMore(false);
        setSelectedTreeId("");
      } finally {
        if (seq === searchSeqRef.current) {
          setSearchLoading(false);
        }
      }
    })();
    return () => {
      searchSeqRef.current += 1;
      ac.abort();
    };
  }, [active, debouncedFilter, backendBaseUrl, showToast, searchEpoch, catalogPort]);

  if (catalogOwner.current !== catalogPort) {
    catalogOwner.current = catalogPort;
    searchSeqRef.current += 1;
    setSearchItems([]);
    setSearchHasMore(false);
    setSelectedTreeId("");
    searchAppendLockRef.current = false;
    setSearchLoadingMore(false);
  }

  const appendSearchPage = useCallback(async (): Promise<void> => {
    if (!active || !debouncedFilter || searchLoading || searchLoadingMore || !searchHasMore || searchAppendLockRef.current) {
      return;
    }
    searchAppendLockRef.current = true;
    setSearchLoadingMore(true);
    const seq = searchSeqRef.current;
    const skip = searchItemsRef.current.length;
    try {
      const res = await fetchToolboxModuleSearch(backendBaseUrl, {
        keyword: debouncedFilter,
        skip
      }, undefined, catalogPort);
      if (seq !== searchSeqRef.current) {
        return;
      }
      const runners = res.items.filter((c): c is Extract<QuickInsertCandidate, { kind: "runner" }> => c.kind === "runner");
      setSearchItems((prev) => [...prev, ...runners]);
      setSearchHasMore(res.hasMore);
    } catch {
      if (seq === searchSeqRef.current) {
        setSearchHasMore(false);
      }
    } finally {
      if (seq === searchSeqRef.current) {
        searchAppendLockRef.current = false;
        setSearchLoadingMore(false);
      }
    }
  }, [active, debouncedFilter, searchHasMore, searchLoading, searchLoadingMore, backendBaseUrl, catalogPort]);

  const onToolboxTreeScroll = useCallback(
    (e: UIEvent<HTMLDivElement>): void => {
      if (!active || !debouncedFilter) {
        return;
      }
      const el = e.currentTarget;
      if (searchLoading || searchLoadingMore || !searchHasMore || searchAppendLockRef.current) {
        return;
      }
      if (el.scrollHeight - el.scrollTop - el.clientHeight < 48) {
        void appendSearchPage();
      }
    },
    [active, appendSearchPage, debouncedFilter, searchHasMore, searchLoading, searchLoadingMore]
  );

  useEffect(() => {
    if (!filterQuery) {
      setExpandedKeys({});
    }
  }, [filterQuery]);

  const filteredByText = useMemo(() => {
    if (isSearchMode) {
      return [];
    }
    return nodes.filter((node) => nodeMatchesSearch(node, filterQuery));
  }, [filterQuery, isSearchMode, nodes]);

  const searchTreeMeta = useMemo(() => {
    if (!isSearchMode) {
      return null;
    }
    const runners = searchItems.filter((c): c is RunnerHit => c.kind === "runner");
    return buildToolboxSearchTreeMeta(nodes, runners);
  }, [isSearchMode, nodes, searchItems]);

  const visibleTabKeys = useMemo(() => {
    if (!isSearchMode) {
      return new Set<string>(tabs.map((x) => x.key));
    }
    if (!searchTreeMeta) {
      const keys = new Set<string>([TOOLBOX_ALL_TAB_KEY]);
      if (hasCatalogFavorite) {
        keys.add(TOOLBOX_FAVORITES_TAB_KEY);
      }
      return keys;
    }
    const byKey = new Map(nodes.map((n) => [n.key, n]));
    const hitNodes = searchTreeMeta.parentOrder
      .map((k) => byKey.get(k))
      .filter((n): n is ToolboxNode => Boolean(n));
    const keys = collectToolboxCategoryKeys(hitNodes);
    if (hasCatalogFavorite) {
      keys.add(TOOLBOX_FAVORITES_TAB_KEY);
    }
    return keys;
  }, [favorites.keys, hasCatalogFavorite, isSearchMode, nodes, searchTreeMeta, tabs]);

  useEffect(() => {
    if (!visibleTabKeys.has(selectedTab)) {
      setSelectedTab(TOOLBOX_ALL_TAB_KEY);
    }
  }, [selectedTab, visibleTabKeys]);

  const visibleNodes = useMemo(() => {
    if (isSearchMode && searchTreeMeta) {
      const byKey = new Map(nodes.map((n) => [n.key, n]));
      return searchTreeMeta.parentOrder
        .map((k) => byKey.get(k))
        .filter((n): n is ToolboxNode => Boolean(n))
        .filter((node) => toolboxNodeInTab(node, selectedTab, favorites.keys));
    }
    return sortToolboxNodes(
      filteredByText.filter((node) => toolboxNodeInTab(node, selectedTab, favorites.keys)),
      sortMode,
      {
        favoriteKeys: favorites.keys,
        useCounts: favorites.useCounts,
        recentPickIds: [],
      },
    );
  }, [favorites.keys, favorites.useCounts, filteredByText, isSearchMode, nodes, searchTreeMeta, selectedTab, sortMode]);

  const visibleSelectionIds = useMemo(() => {
    const ids: string[] = [];
    for (const node of visibleNodes) {
      const matchedSubItems = getToolboxMatchedSubItems(
        node,
        isSearchMode,
        searchTreeMeta,
        filterQuery,
        runnerCatalogItems
      );
      const hasChildren = node.subItems.length > 0 || matchedSubItems.length > 0;
      const isExpanded = getToolboxNodeExpanded(
        hasChildren,
        matchedSubItems,
        isSearchMode,
        filterQuery,
        expandedKeys,
        node.key
      );

      ids.push(toolboxSelectionId(node.key));
      if (!hasChildren || !isExpanded || matchedSubItems.length === 0) {
        continue;
      }
      for (const sub of matchedSubItems) {
        ids.push(toolboxSubSelectionId(node.key, sub.key));
      }
    }
    return ids;
  }, [expandedKeys, filterQuery, isSearchMode, runnerCatalogItems, searchTreeMeta, visibleNodes]);

  useEffect(() => {
    if (!isSearchMode) {
      return;
    }
    if (visibleSelectionIds.length === 0) {
      if (selectedTreeId) {
        setSelectedTreeId("");
      }
      return;
    }
    if (!visibleSelectionIds.includes(selectedTreeId)) {
      setSelectedTreeId(visibleSelectionIds[0] ?? "");
    }
  }, [isSearchMode, selectedTreeId, visibleSelectionIds]);

  useEffect(() => {
    if (!active || !selectedTreeId) {
      return;
    }
    const treeEl = treeRef.current;
    if (!treeEl) {
      return;
    }
    const selectedEl = treeEl.querySelector<HTMLElement>(`[data-tree-id="${selectedTreeId}"]`);
    if (!selectedEl) {
      return;
    }
    const ae = document.activeElement;
    // Catalog/search completion must not steal focus from the filter or another editor surface.
    if (!(ae instanceof HTMLElement) || !treeEl.contains(ae)) return;
    selectedEl.scrollIntoView?.({ block: "nearest" });
    if (document.activeElement !== selectedEl) {
      selectedEl.focus();
    }
  }, [active, selectedTreeId]);

  const moveSelectionByOffset = (offset: -1 | 1): void => {
    if (visibleSelectionIds.length === 0) {
      return;
    }
    const currentIndex = visibleSelectionIds.indexOf(selectedTreeId);
    const nextIndex =
      currentIndex < 0
        ? offset > 0
          ? 0
          : visibleSelectionIds.length - 1
        : Math.min(visibleSelectionIds.length - 1, Math.max(0, currentIndex + offset));
    setSelectedTreeId(visibleSelectionIds[nextIndex]);
  };

  const handleToolboxKeyDown = (event: KeyboardEvent<HTMLElement>): void => {
    if (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229 || (event.target instanceof HTMLElement && event.target.closest("input"))) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      moveSelectionByOffset(1);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      moveSelectionByOffset(-1);
    }
  };

  const toggleExpand = (key: string): void => {
    if (isSearchMode || filterQuery) return;
    setExpandedKeys((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const expandableVisibleKeys = useMemo(
    () =>
      isSearchMode || filterQuery
        ? []
        : visibleNodes.filter((node) => node.subItems.length > 0).map((node) => node.key),
    [filterQuery, isSearchMode, visibleNodes]
  );
  const hasExpandedModules = expandableVisibleKeys.some((key) => expandedKeys[key]);
  const expandCollapseLabel = hasExpandedModules ? "折叠全部模块" : "展开全部模块";
  const treeHasExpandable = useMemo(
    () =>
      visibleNodes.some(
        (node) =>
          node.subItems.length > 0 ||
          getToolboxMatchedSubItems(
            node,
            isSearchMode,
            searchTreeMeta,
            filterQuery,
            runnerCatalogItems
          ).length > 0
      ),
    [filterQuery, isSearchMode, runnerCatalogItems, searchTreeMeta, visibleNodes]
  );

  const toggleExpandAll = (): void => {
    if (isSearchMode || filterQuery) return;
    const expand = !hasExpandedModules;
    const next: Record<string, boolean> = {};
    for (const key of expandableVisibleKeys) {
      next[key] = expand;
    }
    setExpandedKeys((prev) => ({ ...prev, ...next }));
  };

  const insertLeafToolboxPayload = useCallback(
    (payload: ToolboxDragPayload): void => {
      if (readOnly) {
        return;
      }
      void Promise.resolve(onInsertAtEnd(payload)).catch((reason: unknown) => showToast(reason instanceof Error ? reason.message : String(reason)));
    },
    [readOnly, onInsertAtEnd, showToast]
  );

  const handleParentNodeDoubleClick = useCallback(
    (node: ToolboxNode, hasChildren: boolean): void => {
      if (isSearchMode || filterQuery) {
        insertLeafToolboxPayload(bestToolboxSearchInsertPayload(node, searchTreeMeta));
        return;
      }
      if (hasChildren) {
        setExpandedKeys((prev) => ({ ...prev, [node.key]: !prev[node.key] }));
        return;
      }
      insertLeafToolboxPayload(buildParentToolboxPayload(node));
    },
    [filterQuery, insertLeafToolboxPayload, isSearchMode, searchTreeMeta]
  );

  const handleSubNodeDoubleClick = useCallback(
    (node: ToolboxNode, sub: ToolboxSubItem): void => {
      insertLeafToolboxPayload(
        buildSubToolboxPayload(node, sub, searchTreeMeta, runnerCatalogItems, nodes)
      );
    },
    [insertLeafToolboxPayload, nodes, runnerCatalogItems, searchTreeMeta]
  );

  useEffect(() => {
    if (!active || !sortMenuOpen) {
      return;
    }
    const onPointerDown = (event: PointerEvent): void => {
      const root = sortMenuRef.current;
      if (root && !root.contains(event.target as Node)) {
        setSortMenuOpen(false);
      }
    };
    const onKeyDown = (event: globalThis.KeyboardEvent): void => {
      if (event.key === "Escape") {
        setSortMenuOpen(false);
      }
    };
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [active, sortMenuOpen]);

  const selectSortMode = useCallback((next: ToolboxSortMode): void => {
    setSortMode(next);
    setSortMenuOpen(false);
  }, [setSortMode]);


  return (
    <section
      className={`toolbox${readOnly ? " toolbox--readonly" : ""}`}
      aria-label="模块工具箱"
      onKeyDownCapture={handleToolboxKeyDown}
    >
      <div className="toolbox-toolbar">
        <label
          className={[
            "toolbox-toolbar__filter-field",
            filterText.trim() ? "toolbox-toolbar__filter-field--active" : "",
          ]
            .filter(Boolean)
            .join(" ")}
        >
          <span className="toolbox-toolbar__filter-icon" aria-hidden>
            <IconControl
              spec={AD_FA_SPEC.search}
              size={12}
              resourceBaseUrl={backendBaseUrl}
            />
          </span>
          <FilterBox
            className="toolbox-toolbar__filter"
            placeholder="搜索模块…"
            value={filterText}
            onChange={setFilterText}
          />
        </label>
        <div className="toolbox-sort" ref={sortMenuRef}>
          <button
            type="button"
            className={`toolbox-icon-btn${sortMenuOpen ? " is-open" : ""}`}
            title={`模块排序：${toolboxSortModeLabel(sortMode)}`}
            aria-label={`模块排序：${toolboxSortModeLabel(sortMode)}`}
            aria-haspopup="menu"
            aria-expanded={sortMenuOpen}
            onClick={() => setSortMenuOpen((open) => !open)}
          >
            <IconControl
              spec={AD_FA_SPEC.variableSort}
              size={16}
              resourceBaseUrl={backendBaseUrl}
            />
          </button>
          {sortMenuOpen ? (
            <div className="toolbox-sort-menu" role="menu" aria-label="模块排序">
              {TOOLBOX_SORT_OPTIONS.filter((option) => option.id !== "useCount").map((option) => (
                <button
                  key={option.id}
                  type="button"
                  role="menuitemradio"
                  aria-checked={sortMode === option.id}
                  className={`toolbox-sort-menu__item${sortMode === option.id ? " is-active" : ""}`}
                  onClick={() => selectSortMode(option.id)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          ) : null}
        </div>
        <button
          type="button"
          className="toolbox-icon-btn"
          title={expandCollapseLabel}
          aria-label={expandCollapseLabel}
          disabled={isSearchMode || expandableVisibleKeys.length === 0}
          onClick={toggleExpandAll}
        >
          <IconControl
            spec={hasExpandedModules ? AD_FA_SPEC.toolboxCollapseAll : AD_FA_SPEC.toolboxExpandAll}
            size={16}
            resourceBaseUrl={backendBaseUrl}
          />
        </button>
      </div>

      {error ? <p className="toolbox-error" role="alert">{error}<button type="button" onClick={() => {
        setError("");
        if (debouncedFilter) setSearchEpoch((value) => value + 1);
        else runnerCatalog.reload();
      }}>重试</button></p> : null}
      <div className="toolbox-body">
        <div className="toolbox-tabs" role="tablist" aria-label="Toolbox categories">
          {visibleToolboxTabs(tabs, visibleTabKeys).map((tab) => (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={selectedTab === tab.key}
              className={`toolbox-tab ${selectedTab === tab.key ? "active" : ""}`}
              title={tab.label}
              aria-label={tab.label}
              onClick={() => selectToolboxTab(tab.key)}
            >
              <IconControl
                spec={tab.icon}
                size={14}
                className="toolbox-tab-icon"
                resourceBaseUrl={backendBaseUrl}
              />
            </button>
          ))}
        </div>

        <div
          className={`toolbox-tree${treeHasExpandable ? "" : " toolbox-tree--flat"}`}
          role="tree"
          aria-busy={loadPhase === "loading" || (isSearchMode && searchLoading && searchItems.length === 0)}
          ref={treeRef}
          onScroll={onToolboxTreeScroll}
        >
          {loadPhase === "loading" && !isSearchMode ? (
            <div className="toolbox-tree-loading" role="status">
              正在加载模块列表…
            </div>
          ) : null}
          {loadPhase === "error" && !isSearchMode ? (
            <div className="toolbox-tree-empty" role="status">
              模块列表加载失败
            </div>
          ) : null}
          {loadPhase === "ready" && nodes.length === 0 && !filterQuery ? (
            <div className="toolbox-tree-empty" role="status">
              暂无可用模块
            </div>
          ) : null}
          {isSearchMode && searchItems.length === 0 ? (
            <div className="toolbox-tree-search-status" role="status">
              {!debouncedFilter || searchLoading ? "正在搜索…" : "无匹配模块"}
            </div>
          ) : null}
          {visibleNodes.map((node) => {
            const matchedSubItems = getToolboxMatchedSubItems(
              node,
              isSearchMode,
              searchTreeMeta,
              filterQuery,
              runnerCatalogItems
            );
            const hasMatchedChildren = matchedSubItems.length > 0;
            const hasChildren = node.subItems.length > 0 || hasMatchedChildren;
            const isExpanded = getToolboxNodeExpanded(
              hasChildren,
              matchedSubItems,
              isSearchMode,
              filterQuery,
              expandedKeys,
              node.key
            );
            const subItemsToRender = matchedSubItems;
            const nodeSelId = toolboxSelectionId(node.key);
            const isNodeSelected = selectedTreeId === nodeSelId;
            const parentHit = searchTreeMeta?.parentHitByKey.get(node.key);
            const nameHtml = isSearchMode
              ? toolboxDisplayNameHtml(node.name, parentHit?.parentLabelHtml ?? parentHit?.labelHtml)
              : undefined;
            return (
              <div key={node.key} className="toolbox-node-wrap" role="group">
                <div
                  role="treeitem"
                  aria-selected={isNodeSelected}
                  aria-expanded={hasChildren ? isExpanded : undefined}
                  className={`toolbox-node ${isNodeSelected ? "selected" : ""}`}
                  data-tree-id={nodeSelId}
                  tabIndex={0}
                  draggable={!readOnly}
                  title={node.description}
                  onClick={(event) => {
                    if ((event.target as HTMLElement).closest(".toolbox-expand")) {
                      return;
                    }
                    setSelectedTreeId(nodeSelId);
                  }}
                  onDoubleClick={(event) => {
                    if ((event.target as HTMLElement).closest(".toolbox-expand")) {
                      return;
                    }
                    event.preventDefault();
                    handleParentNodeDoubleClick(node, hasChildren);
                  }}
                  onKeyDown={(event) => {
                    if (event.key !== "Enter" && event.key !== " ") {
                      return;
                    }
                    if ((event.target as HTMLElement).closest(".toolbox-expand")) {
                      return;
                    }
                    event.preventDefault();
                    setSelectedTreeId(nodeSelId);
                  }}
                  onDragStart={(event) => {
                    if (readOnly) {
                      event.preventDefault();
                      return;
                    }
                    setToolboxRowDragImage(event);
                    setToolboxDragPayload(
                      event,
                      isSearchMode || filterQuery
                        ? bestToolboxSearchInsertPayload(node, searchTreeMeta)
                        : buildParentToolboxPayload(node)
                    );
                  }}
                >
                  {treeHasExpandable ? (
                    <button
                      type="button"
                      className={`toolbox-expand ${hasChildren ? "" : "hidden"}`}
                      onClick={() => toggleExpand(node.key)}
                      disabled={(isSearchMode || !!filterQuery) && hasChildren}
                      title={
                        (isSearchMode || filterQuery) && hasMatchedChildren
                          ? "筛选命中子项时已展开"
                          : (isSearchMode || filterQuery) && hasChildren
                            ? "当前筛选无匹配的子项"
                            : undefined
                      }
                      aria-label={isExpanded ? "Collapse" : "Expand"}
                      aria-expanded={hasChildren ? isExpanded : undefined}
                    >
                      <span className="toolbox-chevron" aria-hidden="true">
                        <svg
                          width="10"
                          height="10"
                          viewBox="0 0 10 10"
                          fill="none"
                          xmlns="http://www.w3.org/2000/svg"
                        >
                          {/* 90° at joint, equal legs L=3; centroid (5,5); no CSS rotate */}
                          <path
                            d={
                              isExpanded
                                ? "M 2 4 L 5 7 L 8 4"
                                : "M 4 2 L 7 5 L 4 8"
                            }
                            stroke="currentColor"
                            strokeWidth="1.15"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </span>
                    </button>
                  ) : null}
                  <IconControl
                    className="toolbox-node-icon"
                    spec={node.icon}
                    size={13}
                    resourceBaseUrl={backendBaseUrl}
                  />
                  {nameHtml ? (
                    <span
                      className="toolbox-node-name toolbox-search-html"
                      dangerouslySetInnerHTML={{ __html: nameHtml }}
                    />
                  ) : (
                    <span className="toolbox-node-name">
                      {highlightText(node.name, isSearchMode ? debouncedFilter : filterQuery)}
                    </span>
                  )}
                </div>

                {hasChildren && isExpanded && subItemsToRender.length > 0 ? (
                  <div className="toolbox-sub-list" role="group">
                    {subItemsToRender.map((sub) => {
                      const subSelId = toolboxSubSelectionId(node.key, sub.key);
                      const isSubSelected = selectedTreeId === subSelId;
                      const subHtml = isSearchMode
                        ? toolboxDisplayNameHtml(
                            sub.name,
                            searchTreeMeta?.subHitByComposite.get(compositeSubHitKey(node.key, sub.key))?.labelHtml,
                          )
                        : undefined;
                      return (
                        <div
                          key={`${node.key}-${sub.key}`}
                          role="treeitem"
                          aria-selected={isSubSelected}
                          className={`toolbox-sub-item ${isSubSelected ? "selected" : ""}`}
                          data-tree-id={subSelId}
                          title={sub.description}
                          tabIndex={0}
                          draggable={!readOnly}
                          onClick={(event) => {
                            event.stopPropagation();
                            setSelectedTreeId(subSelId);
                          }}
                          onDoubleClick={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            handleSubNodeDoubleClick(node, sub);
                          }}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              setSelectedTreeId(subSelId);
                            }
                          }}
                          onDragStart={(event) => {
                            if (readOnly) {
                              event.preventDefault();
                              return;
                            }
                            event.stopPropagation();
                            setToolboxRowDragImage(event);
                            setToolboxDragPayload(
                              event,
                              buildSubToolboxPayload(
                                node,
                                sub,
                                searchTreeMeta,
                                runnerCatalogItems,
                                nodes
                              )
                            );
                          }}
                        >
                          <span className="toolbox-sub-dot" aria-hidden="true">
                            •
                          </span>
                          <span>
                            {subHtml ? (
                              <span className="toolbox-search-html">
                                <span dangerouslySetInnerHTML={{ __html: subHtml }} />
                                {sub.contextSuffix ? (
                                  <span className="toolbox-search-context">（{sub.contextSuffix}）</span>
                                ) : null}
                              </span>
                            ) : (
                              <>
                                {highlightText(sub.name, isSearchMode ? debouncedFilter : filterQuery)}
                                {sub.contextSuffix ? (
                                  <span className="toolbox-search-context">（{sub.contextSuffix}）</span>
                                ) : null}
                              </>
                            )}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            );
          })}
          {isSearchMode && searchLoadingMore ? (
            <div className="toolbox-tree-search-status" role="status">
              加载更多…
            </div>
          ) : null}
        </div>
      </div>

    </section>
  );
}
