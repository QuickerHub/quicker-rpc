"use client";

// Resource tabs/list adapted from Quicker.Headless/Web features/editor at 574556d76b0b10bd9a8a7951277435649650fab8.
// Action opens reuse the workbench's document instances; summaries do not grant a body read capability.
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useDesignerCatalogPort } from "@/lib/action-editor/catalog/DesignerCatalogProvider";
import { createResourceActionOpenRequestId, type DesignerCatalogPort } from "@/lib/action-editor/catalog/designerCatalogPort";
import { appendDesignerResourcePage, fetchDesignerResourcePage, RESOURCE_PAGE_CAPABILITIES,
  type DesignerResourceKind, type DesignerResourcePage } from "@/lib/action-editor/catalog/designerResourcePage";
import { useImeSafeDebouncedQuery } from "@/lib/action-editor/shared/useImeSafeDebouncedQuery";
import { useWorkspaceDocumentNavigation } from "@/lib/workspace-document-navigation";
import type { DesignerResourceActionOpenResult } from "@/lib/designer-resource-action-open";

const tabs = [{ id: "modules", label: "模块" }, { id: "action", label: "动作" }, { id: "global_subprogram", label: "子程序" }] as const;
type Tab = typeof tabs[number]["id"];
export function EditorResourcePane({ active, modules }: { active: boolean; modules: (active: boolean) => ReactNode }) {
  const [tab, setTab] = useState<Tab>("modules");
  const id = useId();
  return <>
    <div className="designer-resource-tabs" role="tablist" aria-label="设计器资源" onKeyDown={(event) => {
      const index = tabs.findIndex((item) => item.id === tab);
      const next = event.key === "ArrowRight" ? (index + 1) % tabs.length : event.key === "ArrowLeft" ? (index + tabs.length - 1) % tabs.length
        : event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : -1;
      if (next < 0) return;
      event.preventDefault(); setTab(tabs[next].id);
      event.currentTarget.querySelectorAll<HTMLButtonElement>('button[role="tab"]')[next]?.focus();
    }}>
      {tabs.map((item) => <button key={item.id} type="button" role="tab" id={`${id}-${item.id}`} aria-selected={tab === item.id}
        aria-controls={`${id}-${item.id}-panel`} tabIndex={tab === item.id ? 0 : -1} onClick={() => setTab(item.id)}>{item.label}</button>)}
    </div>
    <div className="designer-resource-panel" role="tabpanel" aria-labelledby={`${id}-modules`} id={`${id}-modules-panel`} hidden={tab !== "modules"}>
      {modules(active && tab === "modules")}
    </div>
    {tabs.filter((item) => item.id !== "modules").map((item) => <div key={item.id} className="designer-resource-panel" role="tabpanel"
      aria-labelledby={`${id}-${item.id}`} id={`${id}-${item.id}-panel`} hidden={tab !== item.id}>
      <ResourceExplorer active={active && tab === item.id} kind={item.id as DesignerResourceKind} />
    </div>)}
  </>;
}

type View = { owner: DesignerCatalogPort; query: string; page?: DesignerResourcePage; valid: boolean; loading: boolean; error?: string };
type OpenRequest = { port: DesignerCatalogPort; actionId: string; requestId: string; pending: boolean; result?: DesignerResourceActionOpenResult; presented?: boolean };
function ResourceExplorer({ active, kind }: { active: boolean; kind: DesignerResourceKind }) {
  const port = useDesignerCatalogPort(), search = useImeSafeDebouncedQuery(220);
  const navigation = useWorkspaceDocumentNavigation();
  const opens = useRef(new Map<string, OpenRequest>());
  const [, updateOpenView] = useState(0);
  const [view, setView] = useState<View>(), [selectedId, setSelectedId] = useState(""), [refresh, setRefresh] = useState(0);
  const operation = useRef<{ controller: AbortController; port: DesignerCatalogPort; query: string } | null>(null);
  const live = useRef({ active, port, query: search.committedValue, selectedId });
  live.current = { active, port, query: search.committedValue, selectedId };
  const supported = port?.supportsCapability(RESOURCE_PAGE_CAPABILITIES[kind]) === true;
  const current = (controller: AbortController) => !controller.signal.aborted && operation.current?.controller === controller
    && live.current.active && live.current.port === operation.current.port && live.current.query === operation.current.query;
  const unavailable = !port?.documentBound ? "文档目标尚未绑定，无法读取宿主资源目录。"
    : !supported ? "绑定宿主不支持此资源目录（旧版插件或尚未提供该能力）。" : undefined;
  useEffect(() => {
    operation.current?.controller.abort(); operation.current = null;
    if (!active || !port || !supported) {
      setView((previous) => previous ? { ...previous, loading: false, valid: false } : previous);
      return;
    }
    const controller = new AbortController(), query = search.committedValue;
    operation.current = { controller, port, query };
    setView((previous) => ({ owner: port, query, page: previous?.owner === port && previous.query === query ? previous.page : undefined,
      valid: false, loading: true }));
    void fetchDesignerResourcePage(port, { kind, query, skip: 0, take: 100 }, controller.signal).then((page) => {
      if (!current(controller)) return;
      setView({ owner: port, query, page, valid: true, loading: false });
      setSelectedId((previous) => page.items.some((item) => item.id === previous) ? previous : "");
    }).catch((error: unknown) => {
      if (current(controller)) setView((previous) => ({ owner: port, query, page: previous?.page,
        valid: false, loading: false, error: error instanceof Error ? error.message : String(error) }));
    });
    return () => { controller.abort(); if (operation.current?.controller === controller) operation.current = null; };
  }, [active, port, supported, kind, search.committedValue, refresh]);
  const visible = view && view.owner === port && view.query === search.committedValue ? view : undefined;
  const page = visible?.page;
  const loadMore = async () => {
    const controller = operation.current?.controller;
    if (!controller || !current(controller) || !page || !visible.valid || visible.loading || !page.hasMore) return;
    setView({ ...visible, loading: true });
    try {
      const next = await fetchDesignerResourcePage(port, { kind, query: page.query, skip: page.items.length, take: page.take,
        expectedSnapshotId: page.snapshotId }, controller.signal);
      if (!current(controller)) return;
      setView({ ...visible, page: appendDesignerResourcePage(page, next), loading: false });
    } catch (error) {
      if (current(controller)) setView({ ...visible, valid: false, loading: false,
        error: error instanceof Error ? error.message : String(error) });
    }
  };
  const selected = page?.items.find((item) => item.id === selectedId);
  const selectedOpenKey = port && selected && navigation
    ? JSON.stringify([navigation.owner.key, navigation.owner.instanceId, port.key, selected.id]) : "";
  const selectedOpen = opens.current.get(selectedOpenKey);
  const blockedBy = selectedOpen?.result && !selectedOpen.result.ok ? selectedOpen.result.blockedBy : undefined;
  const openUnavailable = kind !== "action" ? "子程序打开尚未接入。"
    : selected?.actionType !== "XAction" ? "当前仅支持打开组合动作（XAction）；其它或未知类型保留只读摘要。"
    : !port?.resourceActionOpenAvailable ? "绑定宿主未提供 V1 动作正文读取能力，当前只能浏览摘要。"
    : !navigation ? "请从工作区文件实例打开动作。" : undefined;
  const openSelected = async () => {
    if (!selected || !port || !active || !visible?.valid || visible.loading || openUnavailable || selectedOpen?.pending || blockedBy) return;
    const ticket = navigation?.capture();
    if (!ticket || ticket.cwd !== port.workspaceCwd) return;
    const operation: OpenRequest = { port, actionId: selected.id, pending: true,
      requestId: selectedOpen?.result && selectedOpen.result.localPersistence !== "none" && selectedOpen.result.localPersistence !== "unchanged"
        ? selectedOpen.requestId : createResourceActionOpenRequestId() };
    opens.current.set(selectedOpenKey, operation); updateOpenView((value) => value + 1);
    const result = await port.openResourceAction(selected.id, operation.requestId, ticket.owner);
    operation.pending = false; operation.result = result;
    if (opens.current.get(selectedOpenKey) !== operation) return;
    if (result.ok && live.current.active && live.current.port === port && live.current.selectedId === operation.actionId && ticket.isCurrent())
      operation.presented = ticket.openFile(result.path, selected.title || selected.id);
    updateOpenView((value) => value + 1);
  };
  return <section className="designer-resource-explorer" aria-label={kind === "action" ? "动作目录" : "全局子程序目录"}>
    <div className="designer-resource-toolbar"><input type="search" aria-label="筛选资源" placeholder="筛选资源" {...search.inputProps} />
      <button type="button" aria-label="刷新资源目录" title="刷新资源目录" disabled={!active || !supported || visible?.loading} onClick={() => setRefresh((value) => value + 1)}>↻</button></div>
    <p className="designer-resource-scope">已绑定宿主的运行时目录 · 只读摘要</p>
    {unavailable ? <p role="status">{unavailable}</p> : <>
      {visible?.error ? <p role="alert">{visible.error} 请显式刷新目录。</p> : null}
      <p className="designer-resource-status" role="status">{visible?.loading ? "正在加载…" : page ? `${page.items.length} / ${page.totalCount}` : "未载入"}
        {page && !visible?.valid ? " · 旧结果已过期" : ""}</p>
      <div className="designer-resource-list" role="listbox" aria-label="资源列表" aria-busy={visible?.loading ?? false}>
        {page?.items.map((item, index) => <button key={item.id} type="button" role="option" aria-selected={selectedId === item.id}
          tabIndex={selectedId === item.id || (!selected && index === 0) ? 0 : -1}
          title={item.description || item.title || item.id} onClick={() => setSelectedId(item.id)} onKeyDown={(event) => {
            const buttons = [...event.currentTarget.parentElement!.querySelectorAll<HTMLButtonElement>('[role="option"]')], index = buttons.indexOf(event.currentTarget);
            const next = event.key === "ArrowDown" ? Math.min(buttons.length - 1, index + 1) : event.key === "ArrowUp" ? Math.max(0, index - 1)
              : event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 : -1;
            if (next < 0) return; event.preventDefault(); buttons[next]?.focus(); buttons[next]?.click();
          }}><span>{item.title || item.id}</span>{item.description ? <small>{item.description}</small> : null}</button>)}
      </div>
      {page?.hasMore ? <button className="designer-resource-more" type="button" disabled={!active || !visible?.valid || visible.loading}
        onClick={() => void loadMore()}>加载更多</button> : null}
      {page && !page.totalCount ? <p>没有匹配的资源。</p> : null}
      {selected ? <dl className="designer-resource-summary"><dt>名称</dt><dd>{selected.title || selected.id}</dd><dt>标识</dt><dd>{selected.id}</dd>
        <dt>版本</dt><dd>{selected.editVersion}</dd>{selected.callIdentifier ? <><dt>调用标识</dt><dd>{selected.callIdentifier}</dd></> : null}
        <dt>说明</dt><dd>{selected.description || "无"}</dd><dt>操作</dt><dd>{openUnavailable ?? <>
          <button type="button" disabled={!active || !visible?.valid || visible.loading || selectedOpen?.pending || Boolean(blockedBy)} onClick={() => void openSelected()}>
            {blockedBy ? "请先核对前置结果" : selectedOpen?.pending ? "正在打开…" : selectedOpen?.result && !selectedOpen.result.ok && selectedOpen.result.localPersistence !== "none" ? "核对本地结果" : "在工作区打开"}
          </button><p>复用已有工作区项目；首次打开会导出到新目录。</p>
        </>}
        {selectedOpen?.result ? selectedOpen.result.ok ? <p role="status">{selectedOpen.result.localPersistence === "confirmed" ? "本地导出已确认" : "已找到本地项目"}
          {!selectedOpen.presented ? "，未切换当前文档；可再次打开。" : "。"} {selectedOpen.result.projectDirectory}</p>
          : <p role="alert">{selectedOpen.result.error} {selectedOpen.result.projectDirectory ?? ""}
            {selectedOpen.result.localPersistence !== "none" ? " 已保留本地结果；核对只读取原目录，不重新导出。" : ""}</p> : null}
        {blockedBy ? <p role="alert">本次未派发导出。请先核对前置请求的本地结果：{blockedBy.projectDirectory ?? blockedBy.requestId}。</p> : null}
        </dd></dl> : null}
    </>}
  </section>;
}
