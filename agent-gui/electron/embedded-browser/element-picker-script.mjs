/**
 * Element picker injected into the embedded browser page (main world).
 *
 * The script evaluates to a Promise that resolves with the picked element
 * payload when the user clicks, or null when cancelled (Escape / cancel
 * script / page teardown).
 */

const PICKER_IIFE = String.raw`
(() => {
  if (window.__qkrpcPickCancel) {
    try { window.__qkrpcPickCancel(); } catch (e) {}
  }

  return new Promise((resolve) => {
    const OVERLAY_ID = "__qkrpc-pick-overlay__";
    const doc = document;
    let currentTarget = null;
    let done = false;

    const overlay = doc.createElement("div");
    overlay.id = OVERLAY_ID;
    overlay.style.cssText = [
      "position:fixed",
      "z-index:2147483647",
      "pointer-events:none",
      "border:3px solid #3b82f6",
      "background:rgba(59,130,246,0.2)",
      "border-radius:3px",
      "box-shadow:0 0 0 1px rgba(15,23,42,0.35),0 0 0 4px rgba(59,130,246,0.12)",
      "display:none",
      "box-sizing:border-box",
      "transition:none",
    ].join(";");

    const label = doc.createElement("div");
    label.style.cssText = [
      "position:fixed",
      "z-index:2147483647",
      "pointer-events:none",
      "background:#1e293b",
      "color:#e2e8f0",
      "font:12px/1.45 ui-monospace,Consolas,monospace",
      "padding:4px 10px",
      "border-radius:4px",
      "max-width:min(90vw, 42rem)",
      "min-width:8rem",
      "overflow:hidden",
      "text-overflow:ellipsis",
      "white-space:nowrap",
      "display:none",
      "box-shadow:0 4px 14px rgba(15,23,42,0.35)",
    ].join(";");

    doc.documentElement.appendChild(overlay);
    doc.documentElement.appendChild(label);

    const describeShort = (el) => {
      let s = el.tagName.toLowerCase();
      if (el.id) s += "#" + el.id;
      const cls = typeof el.className === "string" ? el.className.trim() : "";
      if (cls) s += "." + cls.split(/\s+/).slice(0, 3).join(".");
      return s;
    };

    const segmentFor = (el) => {
      const tag = el.tagName.toLowerCase();
      const cls = typeof el.className === "string" ? el.className.trim() : "";
      let seg = cls ? tag + "." + cls : tag;
      const parent = el.parentElement;
      if (parent) {
        const sameTag = Array.prototype.filter.call(
          parent.children,
          (child) => child.tagName === el.tagName,
        );
        if (sameTag.length > 1) {
          seg += "[" + sameTag.indexOf(el) + "]";
        }
      }
      return seg;
    };

    const domPathFor = (el) => {
      const segments = [];
      let node = el;
      while (node && node !== doc.documentElement && segments.length < 40) {
        if (node.tagName === "BODY") break;
        segments.unshift(segmentFor(node));
        node = node.parentElement;
      }
      return segments.join(" > ");
    };

    const reactComponentFor = (el) => {
      let node = el;
      for (let depth = 0; node && depth < 12; depth += 1) {
        const key = Object.keys(node).find(
          (k) => k.startsWith("__reactFiber$") || k.startsWith("__reactInternalInstance$"),
        );
        if (key) {
          let fiber = node[key];
          let hostType = null;
          while (fiber) {
            const type = fiber.type;
            if (typeof type === "string" && !hostType) {
              hostType = type;
            } else if (typeof type === "function") {
              return type.displayName || type.name || hostType;
            } else if (type && typeof type === "object") {
              const inner = type.render || type.type;
              const name =
                type.displayName
                || (inner && (inner.displayName || inner.name));
              if (name) return name;
            }
            fiber = fiber.return;
          }
          return hostType;
        }
        node = node.parentElement;
      }
      return null;
    };

    const payloadFor = (el, ev) => {
      const rect = el.getBoundingClientRect();
      const text = (el.innerText || el.textContent || "").trim();
      const cls = typeof el.className === "string" ? el.className.trim() : "";
      let outer = el.outerHTML || "";
      if (outer.length > 800) outer = outer.slice(0, 800) + "…";
      return {
        domPath: domPathFor(el),
        tagName: el.tagName.toLowerCase(),
        elementId: el.id || null,
        className: cls || null,
        text: text ? text.slice(0, 200) : null,
        href: el.closest && el.closest("a") ? el.closest("a").href : null,
        value: "value" in el && typeof el.value === "string" ? el.value.slice(0, 200) : null,
        outerHtml: outer,
        reactComponent: reactComponentFor(el),
        rectTop: Math.round(rect.top),
        rectLeft: Math.round(rect.left),
        rectWidth: Math.round(rect.width),
        rectHeight: Math.round(rect.height),
        pickX: Math.round(ev ? ev.clientX : rect.left + rect.width / 2),
        pickY: Math.round(ev ? ev.clientY : rect.top + rect.height / 2),
      };
    };

    const positionOverlay = (el) => {
      const rect = el.getBoundingClientRect();
      const minSize = 6;
      const width = Math.max(rect.width, minSize);
      const height = Math.max(rect.height, minSize);
      const left = rect.left - (width - rect.width) / 2;
      const top = rect.top - (height - rect.height) / 2;
      overlay.style.display = "block";
      overlay.style.left = left + "px";
      overlay.style.top = top + "px";
      overlay.style.width = width + "px";
      overlay.style.height = height + "px";
      label.style.display = "block";
      label.textContent = describeShort(el);
      const labelTop = rect.top > 30 ? rect.top - 28 : rect.bottom + 6;
      label.style.left = Math.max(4, rect.left) + "px";
      label.style.top = labelTop + "px";
    };

    const targetFromPoint = (x, y) => {
      const el = doc.elementFromPoint(x, y);
      if (!el || el === overlay || el === label) return null;
      if (el === doc.documentElement || el === doc.body) return null;
      return el;
    };

    const finish = (result) => {
      if (done) return;
      done = true;
      cleanup();
      resolve(result);
    };

    const onMouseMove = (ev) => {
      const el = targetFromPoint(ev.clientX, ev.clientY);
      if (!el) {
        currentTarget = null;
        overlay.style.display = "none";
        label.style.display = "none";
        return;
      }
      if (el !== currentTarget) {
        currentTarget = el;
        positionOverlay(el);
      } else {
        positionOverlay(el);
      }
    };

    const swallow = (ev) => {
      ev.preventDefault();
      ev.stopImmediatePropagation();
    };

    const onClick = (ev) => {
      swallow(ev);
      const el = targetFromPoint(ev.clientX, ev.clientY) || currentTarget;
      if (!el) {
        finish(null);
        return;
      }
      finish(payloadFor(el, ev));
    };

    const onKeyDown = (ev) => {
      if (ev.key === "Escape") {
        swallow(ev);
        finish(null);
      }
    };

    const onScroll = () => {
      if (currentTarget) positionOverlay(currentTarget);
    };

    function cleanup() {
      window.removeEventListener("mousemove", onMouseMove, true);
      window.removeEventListener("click", onClick, true);
      window.removeEventListener("mousedown", swallow, true);
      window.removeEventListener("mouseup", swallow, true);
      window.removeEventListener("pointerdown", swallow, true);
      window.removeEventListener("pointerup", swallow, true);
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("scroll", onScroll, true);
      overlay.remove();
      label.remove();
      delete window.__qkrpcPickCancel;
      doc.documentElement.style.cursor = "";
    }

    window.addEventListener("mousemove", onMouseMove, true);
    window.addEventListener("click", onClick, true);
    window.addEventListener("mousedown", swallow, true);
    window.addEventListener("mouseup", swallow, true);
    window.addEventListener("pointerdown", swallow, true);
    window.addEventListener("pointerup", swallow, true);
    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("scroll", onScroll, true);
    doc.documentElement.style.cursor = "crosshair";

    window.__qkrpcPickCancel = () => finish(null);
  });
})()
`;

const CANCEL_IIFE = String.raw`
(() => {
  if (window.__qkrpcPickCancel) {
    try { window.__qkrpcPickCancel(); } catch (e) {}
    return true;
  }
  return false;
})()
`;

export function buildElementPickerScript() {
  return PICKER_IIFE;
}

export function buildPickerCancelScript() {
  return CANCEL_IIFE;
}
