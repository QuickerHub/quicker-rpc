"use client";

// FA pane adapted from Quicker.Headless/Web/src/features/shared/IconPickerDialog.tsx
// at 574556d76b0b10bd9a8a7951277435649650fab8; account/uploaded libraries are separate capabilities.
import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { DesignerCatalogProvider, useDesignerCatalogPort } from "../catalog/DesignerCatalogProvider";
import type { DesignerCatalogPort } from "../catalog/designerCatalogPort";
import { resolveDesignerFaIcons } from "../catalog/designerFaGeometry";
import { IconControl } from "./IconControl";
import IconColorPicker from "./IconColorPicker";
import { normalizeColorToken, cssPreviewColor, FA_DEFAULT_FILL } from "./iconColorUtils";
import { useImeSafeDebouncedQuery } from "./useImeSafeDebouncedQuery";
import { buildFaIconSpec, FA_ICON_PAGE_SIZE, FA_REGULAR_BRANDS_STYLE, isUrlLikeIconSpec,
  parseFaIconSpec, searchPickerFaIcons, toPickerStyleFilter, type PickerStyleFilter } from "./faIconPickerSearch";
import "./icon-picker-dialog.css";

type Props = { open: boolean; active?: boolean; keyboardOwnerId?: string; value: string; onClose(): void; onSelect(spec: string): void };
const styles: { value: PickerStyleFilter; label: string }[] = [
  { value: "", label: "全部" }, { value: "Solid", label: "实心" }, { value: FA_REGULAR_BRANDS_STYLE, label: "普通/商标" }, { value: "Light", label: "细" },
];
const presets = ["", "#4f9bd8", "#22c55e", "#eab308", "#ef4444", "#a855f7", "#111827", "#f8fafc"];
type Load = { controller: AbortController; names: readonly string[]; hasMore: boolean; totalCount: number; more: boolean; loading: boolean };

/** One mounted opening owns its draft and waiter; hidden openings keep drafts but own no portal/request. */
export default function IconPickerDialog(props: Props) {
  const port = useDesignerCatalogPort();
  return props.open ? <PickerOpening {...props} port={port} /> : null;
}

function PickerOpening({ active = true, port, ...props }: Props & { port?: DesignerCatalogPort }) {
  const id = useId(), parsed = parseFaIconSpec(props.value);
  const entry = useRef({ port, value: props.value, parsed });
  const [tab, setTab] = useState<"fa" | "manual">(() => isUrlLikeIconSpec(props.value) ? "manual" : "fa");
  const [style, setStyle] = useState<PickerStyleFilter>(() => toPickerStyleFilter(parsed.style));
  const [color, setColor] = useState(parsed.color);
  const [selectedName, setSelectedName] = useState(parsed.name);
  const [manual, setManual] = useState(props.value);
  const [page, setPage] = useState<Load | null>(null);
  const [error, setError] = useState<string>();
  const [colorOpen, setColorOpen] = useState(false);
  const search = useImeSafeDebouncedQuery(220);
  const root = useRef<HTMLDivElement>(null), input = useRef<HTMLInputElement>(null), grid = useRef<HTMLDivElement>(null), sentinel = useRef<HTMLDivElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  const operation = useRef<{ controller: AbortController; query: string; style: PickerStyleFilter } | null>(null);
  const loadingMore = useRef<AbortController | null>(null);
  const live = useRef({ active, port, value: props.value, tab, query: search.committedValue, style });
  live.current = { active, port, value: props.value, tab, query: search.committedValue, style };
  const ownerMatches = entry.current.port === port;
  const remote = ownerMatches && port?.documentBound;
  const unavailable = !ownerMatches ? "文档目标已经改变，请保留草稿并重新打开图标选择器。"
    : !remote ? "当前文档尚未绑定宿主，无法查询图标目录。可手动填写图标规格。" : undefined;
  const previewSpec = tab === "manual" ? manual.trim() : buildFaIconSpec(selectedName, color);
  const tint = cssPreviewColor(color) ?? FA_DEFAULT_FILL;

  useLayoutEffect(() => {
    if (!active) return;
    previousFocus.current ??= document.activeElement instanceof HTMLElement ? document.activeElement : null;
    input.current?.focus();
    return () => { queueMicrotask(() => {
      const previous = previousFocus.current;
      if (previous?.isConnected && previous.checkVisibility() && !previous.closest("[inert]")) previous.focus();
    }); };
  }, [active]);

  const current = (controller: AbortController) => !controller.signal.aborted && operation.current?.controller === controller
    && operation.current.query === live.current.query && operation.current.style === live.current.style && live.current.tab === "fa"
    && live.current.active && live.current.port === entry.current.port;

  useEffect(() => {
    operation.current?.controller.abort();
    if (!active || !remote || tab !== "fa") return;
    const controller = new AbortController(); operation.current = { controller, query: search.committedValue, style };
    loadingMore.current = null;
    setError(undefined); setPage({ controller, names: [], hasMore: false, totalCount: 0, more: false, loading: true });
    void searchPickerFaIcons(port, { query: search.committedValue, style, skip: 0, take: FA_ICON_PAGE_SIZE }, controller.signal).then(async (result) => {
      if (!current(controller)) return;
      // Batch base vectors once; local tinting does not request the same paths for every color drag.
      await resolveDesignerFaIcons(port, result.names.map((name) => buildFaIconSpec(name)), controller.signal);
      if (!current(controller)) return;
      setPage({ controller, names: result.names, hasMore: result.hasMore, totalCount: result.totalCount, more: false, loading: false });
      setSelectedName((previous) => result.names.includes(previous) ? previous : result.names[0] ?? "");
    }).catch((failure: unknown) => {
      if (!current(controller)) return;
      setError(failure instanceof Error ? failure.message : String(failure)); setPage(null);
    });
    return () => { controller.abort(); if (operation.current?.controller === controller) operation.current = null; };
  }, [active, port, remote, tab, search.committedValue, style]);

  const loadMore = async () => {
    const snapshot = page, controller = operation.current?.controller;
    if (!snapshot || !controller || !current(controller) || snapshot.controller !== controller || loadingMore.current === controller || !snapshot.hasMore) return;
    loadingMore.current = controller;
    setPage({ ...snapshot, more: true });
    try {
      const result = await searchPickerFaIcons(port, { query: search.committedValue, style, skip: snapshot.names.length, take: FA_ICON_PAGE_SIZE }, controller.signal);
      if (!current(controller)) return;
      await resolveDesignerFaIcons(port, result.names.map((name) => buildFaIconSpec(name)), controller.signal);
      if (!current(controller)) return;
      setPage({ controller, names: [...snapshot.names, ...result.names], hasMore: result.hasMore, totalCount: result.totalCount, more: false, loading: false });
    } catch (failure) {
      if (current(controller)) { setError(failure instanceof Error ? failure.message : String(failure)); setPage({ ...snapshot, more: false }); }
    } finally { if (loadingMore.current === controller) loadingMore.current = null; }
  };
  const loadMoreRef = useRef(loadMore); loadMoreRef.current = loadMore;
  useEffect(() => {
    const target = sentinel.current, container = grid.current;
    if (!active || tab !== "fa" || !page?.hasMore || page.more || !target || !container) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) void loadMoreRef.current();
    }, { root: container, rootMargin: "120px" });
    observer.observe(target); return () => observer.disconnect();
  }, [active, tab, page]);

  const confirm = (spec = previewSpec) => {
    if (!live.current.active || entry.current.port !== live.current.port) return;
    if (live.current.tab === "fa" && (!remote || !page || !current(page.controller) || page.loading || !page.names.includes(parseFaIconSpec(spec).name))) return;
    if (live.current.value !== entry.current.value) { setError("原图标已经改变，请保留草稿并重新核对。选择器尚未应用更改。"); return; }
    if (spec.trim()) {
      const candidate = parseFaIconSpec(spec);
      const unchanged = tab === "manual" ? manual === entry.current.value
        : candidate.name === entry.current.parsed.name && candidate.color === entry.current.parsed.color;
      props.onSelect(unchanged ? entry.current.value : spec.trim());
    }
  };
  const handleKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.nativeEvent.isComposing) return;
    if ((event.ctrlKey || event.metaKey) && ["s", "z", "y"].includes(event.key.toLowerCase())) {
      event.stopPropagation(); if (event.key.toLowerCase() === "s") event.preventDefault(); return;
    }
    if (colorOpen) return;
    if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); props.onClose(); }
    else if (event.key === "Tab") {
      const controls = [...(root.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled)') ?? [])];
      const first = controls[0], last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    } else if (event.key === "Enter" && event.target instanceof HTMLInputElement && event.target.dataset.pickerConfirm === "true") {
      event.preventDefault(); event.stopPropagation(); confirm();
    }
  };
  if (!active) return null;
  const names = ownerMatches && page && current(page.controller) ? page.names : [];
  return createPortal(<DesignerCatalogProvider port={remote ? port : undefined}><div className="icon-picker-backdrop" data-program-keyboard-owner={props.keyboardOwnerId}
    role="presentation" onKeyDown={handleKey} onMouseDown={(event) => { if (event.target === event.currentTarget) props.onClose(); }}>
    <div ref={root} className="icon-picker-dialog" role="dialog" aria-modal="true" aria-labelledby={`${id}-title`} inert={colorOpen}>
      <header className="icon-picker-dialog__header"><h2 id={`${id}-title`}>选择图标</h2>
        <div className="icon-picker-dialog__tabs" role="tablist" aria-label="图标来源">
          <button type="button" role="tab" aria-selected={tab === "fa"} onClick={() => setTab("fa")}>内置矢量图</button>
          <button type="button" role="tab" aria-selected={tab === "manual"} onClick={() => setTab("manual")}>URL / 图标规格</button></div>
        <button type="button" className="icon-picker-dialog__close" aria-label="关闭图标选择器" onClick={props.onClose}>×</button></header>
      <div className="icon-picker-dialog__body">
        {tab === "fa" ? <><div className="icon-picker-dialog__filters"><input ref={input} aria-label="搜索图标" data-picker-confirm="true" placeholder="搜索名称或中文，如 folder、文件夹、微信…" {...search.inputProps} />
          <div className="icon-picker-dialog__styles" role="group" aria-label="风格">{styles.map((item) => <button key={item.value} type="button" className="icon-picker-dialog__chip" aria-pressed={style === item.value} onClick={() => setStyle(item.value)}>{item.label}</button>)}</div>
          <div className="icon-picker-dialog__color-bar"><IconColorPicker value={color} onChange={(value) => setColor(normalizeColorToken(value))} presets={presets} keyboardOwnerId={props.keyboardOwnerId} onOpenChange={setColorOpen} />
            <span className="icon-picker-dialog__count" aria-live="polite">{page ? `${names.length} / ${page.totalCount}` : ""}</span></div></div>
          {unavailable || error ? <p className="icon-picker-dialog__error" role="alert">{unavailable || error}</p> : null}
          <div ref={grid} className="icon-picker-dialog__grid" role="listbox" aria-label="图标列表" aria-busy={Boolean(page?.loading || page?.more)}
            style={{ "--icon-picker-tint": tint } as CSSProperties} onKeyDown={(event) => {
              if (event.key !== "ArrowRight" && event.key !== "ArrowLeft" && event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
              const cells = [...(grid.current?.querySelectorAll<HTMLButtonElement>('[role="option"]') ?? [])], index = cells.indexOf(event.target as HTMLButtonElement);
              if (index < 0) return; event.preventDefault(); const columns = Math.max(1, Math.floor((grid.current?.clientWidth ?? 60) / 60));
              const delta = event.key === "ArrowLeft" ? -1 : event.key === "ArrowRight" ? 1 : event.key === "ArrowUp" ? -columns : columns;
              const target = cells[Math.max(0, Math.min(cells.length - 1, index + delta))]; target?.focus(); if (target) setSelectedName(target.name);
            }}>
            {names.map((name) => <button key={name} name={name} type="button" role="option" aria-label={name} aria-selected={selectedName === name} className="icon-picker-dialog__cell"
              onClick={() => setSelectedName(name)} onDoubleClick={() => confirm(buildFaIconSpec(name, color))}><IconControl spec={buildFaIconSpec(name)} size={28} fallback={null} /></button>)}
            {!names.length ? <div className="icon-picker-dialog__empty">{page?.loading && !error && !unavailable ? "正在加载图标…" : "没有匹配的图标"}</div> : null}
            {page?.hasMore ? <div ref={sentinel} className="icon-picker-dialog__load-more"><button type="button" disabled={page.more} onClick={() => void loadMore()}>{page.more ? "加载中…" : "加载更多"}</button></div> : null}
          </div></> : <div className="icon-picker-dialog__manual"><label>图片 URL 或图标规格<input ref={input} data-picker-confirm="true" value={manual} spellCheck={false} placeholder="https://… / res:… / fa:…" onChange={(event) => setManual(event.target.value)} /></label><p>也可以保留或填写现有的图标规格；此处不查询上传图标库。</p>
            {unavailable || error ? <p role="alert" className="icon-picker-dialog__error">{unavailable || error}</p> : null}</div>}
      </div>
      <footer className="icon-picker-dialog__footer"><div className="icon-picker-dialog__preview" aria-label="所选图标预览" style={{ "--icon-picker-tint": tint } as CSSProperties}>
        <IconControl spec={tab === "fa" ? buildFaIconSpec(selectedName) : previewSpec} size={28} fallback={null} /><code>{previewSpec || "（未选择）"}</code></div>
        <div className="icon-picker-dialog__actions"><button type="button" onClick={props.onClose}>取消</button><button type="button" disabled={!previewSpec.trim() || !ownerMatches || (tab === "fa" && (!remote || !page || page.loading || !current(page.controller)))} onClick={() => confirm()}>使用此图标</button></div></footer>
    </div>
  </div></DesignerCatalogProvider>, document.body);
}
