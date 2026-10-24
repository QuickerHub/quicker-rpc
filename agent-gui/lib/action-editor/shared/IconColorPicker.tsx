"use client";

// Adapted from Quicker.Headless/Web/src/features/shared at 574556d76b0b10bd9a8a7951277435649650fab8.
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { createPortal } from "react-dom";
import {
  colorTokensEqual,
  cssPreviewColor,
  hexToHsv,
  hsvToHex,
  isDefaultIconColor,
  normalizeColorToken,
  tryParseHex,
  type HsvColor,
} from "./iconColorUtils";

export type IconColorPickerProps = {
  value: string;
  onChange: (color: string) => void;
  presets: string[];
  keyboardOwnerId?: string;
  onOpenChange?(open: boolean): void;
};

const DEFAULT_HSV: HsvColor = { h: 210, s: 0.55, v: 0.85 };

type PanelRect = { top: number; left: number; width: number };

/**
 * Preset swatches + free HSV/hex color popover for FA icon tint.
 */
export default function IconColorPicker(props: IconColorPickerProps): JSX.Element {
  const panelId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  useLayoutEffect(() => { props.onOpenChange?.(open); return () => props.onOpenChange?.(false); }, [open, props.onOpenChange]);
  const [panelRect, setPanelRect] = useState<PanelRect | null>(null);
  const [draftHex, setDraftHex] = useState(props.value);
  const [hsv, setHsv] = useState<HsvColor>(() => hexToHsv(props.value) ?? DEFAULT_HSV);
  const svRef = useRef<HTMLDivElement>(null);
  const hueRef = useRef<HTMLDivElement>(null);
  const dragMode = useRef<"sv" | "hue" | null>(null);
  const ownerRef = useRef<{ active: boolean }>({ active: false });
  const openRef = useRef(open);
  openRef.current = open;
  useLayoutEffect(() => {
    // Global listeners must stop owning input during layout, before passive unmount cleanup.
    const owner = { active: true };
    ownerRef.current = owner;
    return () => { owner.active = false; dragMode.current = null; };
  }, []);
  const hsvRef = useRef(hsv);
  const onChangeRef = useRef(props.onChange);
  const valueRef = useRef(props.value);
  hsvRef.current = hsv;
  onChangeRef.current = props.onChange;
  valueRef.current = props.value;

  const preview = cssPreviewColor(props.value);
  const isDefault = isDefaultIconColor(props.value);
  const activeHex = tryParseHex(props.value);

  const updatePanelRect = useCallback((): void => {
    if (!ownerRef.current.active || !openRef.current) return;
    const trigger = triggerRef.current;
    if (!trigger) {
      return;
    }
    const rect = trigger.getBoundingClientRect();
    const width = Math.min(248, window.innerWidth - 24);
    let left = rect.left;
    if (left + width > window.innerWidth - 12) {
      left = Math.max(12, window.innerWidth - width - 12);
    }
    const preferredTop = rect.bottom + 6;
    const panelHeight = 230;
    const top =
      preferredTop + panelHeight > window.innerHeight - 12
        ? Math.max(12, rect.top - panelHeight - 6)
        : preferredTop;
    setPanelRect({ top, left, width });
  }, []);

  useLayoutEffect(() => {
    if (!open) {
      setPanelRect(null);
      return;
    }
    updatePanelRect();
    window.addEventListener("resize", updatePanelRect);
    window.addEventListener("scroll", updatePanelRect, true);
    return () => {
      window.removeEventListener("resize", updatePanelRect);
      window.removeEventListener("scroll", updatePanelRect, true);
    };
  }, [open, updatePanelRect]);

  useLayoutEffect(() => {
    if (open && panelRect) panelRef.current?.querySelector<HTMLInputElement>("input")?.focus();
  }, [open, Boolean(panelRect)]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const parsed = hexToHsv(props.value);
    if (parsed) {
      setHsv(parsed);
      setDraftHex(props.value);
    } else if (!props.value.trim()) {
      setHsv(DEFAULT_HSV);
      setDraftHex("");
    } else {
      setDraftHex(props.value.trim());
    }
  }, [open, props.value]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const owner = ownerRef.current;
    const ownsInput = () => owner.active && ownerRef.current === owner && openRef.current;
    const onPointerDown = (event: PointerEvent): void => {
      if (!ownsInput()) return;
      const root = rootRef.current;
      const panel = panelRef.current;
      const target = event.target as Node;
      if ((root && root.contains(target)) || (panel && panel.contains(target))) {
        return;
      }
      setOpen(false);
    };
    const onKey = (event: KeyboardEvent): void => {
      if (!ownsInput()) return;
      if (event.key === "Escape" && !event.isComposing) {
        event.preventDefault();
        event.stopPropagation();
        setOpen(false);
        queueMicrotask(() => {
          if (!owner.active || ownerRef.current !== owner) return;
          const trigger = triggerRef.current;
          if (trigger?.isConnected && trigger.checkVisibility() && !trigger.closest("[inert]")) trigger.focus();
        });
      }
    };
    window.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [open]);

  const commitHex = useCallback((raw: string): void => {
    const next = normalizeColorToken(raw);
    if (next !== normalizeColorToken(valueRef.current)) onChangeRef.current(next);
    const parsed = hexToHsv(next);
    if (parsed) {
      setHsv(parsed);
      setDraftHex(raw);
    } else {
      setDraftHex(next);
    }
  }, []);

  const commitHsv = useCallback((next: HsvColor): void => {
    hsvRef.current = next;
    setHsv(next);
    const rgb = hsvToHex(next), original = tryParseHex(valueRef.current);
    const hex = original?.length === 9 ? `#${original.slice(1, 3)}${rgb.slice(1)}` : rgb;
    setDraftHex(hex);
    onChangeRef.current(hex);
  }, []);

  const updateSvFromPointer = useCallback(
    (clientX: number, clientY: number): void => {
      const el = svRef.current;
      if (!el) {
        return;
      }
      const rect = el.getBoundingClientRect();
      const s = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      const v = Math.max(0, Math.min(1, 1 - (clientY - rect.top) / rect.height));
      commitHsv({ ...hsvRef.current, s, v });
    },
    [commitHsv],
  );

  const updateHueFromPointer = useCallback(
    (clientX: number): void => {
      const el = hueRef.current;
      if (!el) {
        return;
      }
      const rect = el.getBoundingClientRect();
      const h = Math.max(0, Math.min(360, ((clientX - rect.left) / rect.width) * 360));
      commitHsv({ ...hsvRef.current, h });
    },
    [commitHsv],
  );

  useEffect(() => {
    if (!open) {
      return;
    }
    const owner = ownerRef.current;
    const ownsInput = () => owner.active && ownerRef.current === owner && openRef.current;
    const onMove = (event: PointerEvent): void => {
      if (!ownsInput()) return;
      if (dragMode.current === "sv") {
        updateSvFromPointer(event.clientX, event.clientY);
      } else if (dragMode.current === "hue") {
        updateHueFromPointer(event.clientX);
      }
    };
    const onUp = (): void => {
      if (!ownsInput()) return;
      dragMode.current = null;
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [open, updateHueFromPointer, updateSvFromPointer]);

  const hueColor = useMemo(() => hsvToHex({ h: hsv.h, s: 1, v: 1 }), [hsv.h]);
  const liveHex = useMemo(() => hsvToHex(hsv), [hsv]);

  const onSvPointerDown = (event: ReactPointerEvent<HTMLDivElement>): void => {
    event.preventDefault();
    dragMode.current = "sv";
    updateSvFromPointer(event.clientX, event.clientY);
  };

  const onHuePointerDown = (event: ReactPointerEvent<HTMLDivElement>): void => {
    event.preventDefault();
    dragMode.current = "hue";
    updateHueFromPointer(event.clientX);
  };

  const panel =
    open && panelRect
      ? createPortal(
          <div
            ref={panelRef}
            id={panelId}
            className="icon-color-picker__panel"
            role="dialog"
            aria-label="自由颜色选择"
            aria-modal="true"
            data-program-keyboard-owner={props.keyboardOwnerId}
            onKeyDown={(event) => {
              if (event.key !== "Tab") return;
              const controls = [...(panelRef.current?.querySelectorAll<HTMLElement>('input,button:not(:disabled)') ?? [])];
              const first = controls[0], last = controls.at(-1);
              if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
              else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
              event.stopPropagation();
            }}
            style={{ top: panelRect.top, left: panelRect.left, width: panelRect.width }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div
              ref={svRef}
              className="icon-color-picker__sv"
              style={{ backgroundColor: hueColor }}
              onPointerDown={onSvPointerDown}
            >
              <div className="icon-color-picker__sv-white" />
              <div className="icon-color-picker__sv-black" />
              <div
                className="icon-color-picker__sv-thumb"
                style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%`, background: liveHex }}
              />
            </div>

            <div ref={hueRef} className="icon-color-picker__hue" onPointerDown={onHuePointerDown}>
              <div className="icon-color-picker__hue-thumb" style={{ left: `${(hsv.h / 360) * 100}%` }} />
            </div>

            <div className="icon-color-picker__row">
              <span className="icon-color-picker__swatch-live" style={{ background: liveHex }} aria-hidden />
              <input
                className="action-meta-editor__input icon-color-picker__hex"
                value={draftHex}
                placeholder="#RRGGBB"
                aria-label="十六进制颜色"
                spellCheck={false}
                onChange={(e) => {
                  const raw = e.target.value;
                  setDraftHex(raw);
                  const hex = tryParseHex(raw);
                  if (hex) {
                    const next = hexToHsv(hex);
                    if (next) {
                      hsvRef.current = next;
                      setHsv(next);
                      onChangeRef.current(hex);
                    }
                  }
                }}
                onBlur={() => commitHex(draftHex)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                    e.preventDefault(); e.stopPropagation();
                    commitHex(draftHex);
                  }
                }}
              />
              <button
                type="button"
                className="action-meta-editor__btn icon-color-picker__clear"
                onClick={() => {
                  onChangeRef.current("");
                  setDraftHex("");
                  setHsv(DEFAULT_HSV);
                }}
              >
                默认
              </button>
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <div className="icon-color-picker" ref={rootRef}>
      <div className="icon-picker-dialog__colors" role="group" aria-label="颜色">
        {props.presets.map((c) => {
          const selected = !c ? isDefault : colorTokensEqual(c, props.value);
          return (
            <button
              key={c || "default"}
              type="button"
              className={`icon-picker-dialog__swatch ${selected ? "is-active" : ""} ${!c ? "is-default" : ""}`}
              title={c || "默认色"}
              aria-pressed={selected}
              style={c ? { background: c } : undefined}
              onClick={() => props.onChange(c)}
            >
              {!c ? "默" : null}
            </button>
          );
        })}

        <button
          ref={triggerRef}
          type="button"
          className={`icon-color-picker__trigger ${open ? "is-open" : ""} ${activeHex || preview ? "has-color" : ""}`}
          aria-expanded={open}
          aria-controls={panelId}
          title="自由选色"
          style={preview ? { background: preview } : undefined}
          onClick={() => setOpen((v) => !v)}
        >
          {!preview ? (
            <span className="icon-color-picker__trigger-glyph" aria-hidden>
              ▧
            </span>
          ) : null}
        </button>

        <input
          className="action-meta-editor__input icon-picker-dialog__color-input"
          value={props.value}
          placeholder="#hex / semantic"
          aria-label="图标颜色"
          onChange={(e) => commitHex(e.target.value)}
          spellCheck={false}
        />
      </div>

      {panel}
    </div>
  );
}
