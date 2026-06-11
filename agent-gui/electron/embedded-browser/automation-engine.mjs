import { formatSnapshotYaml, invokeError, invokeOk } from "../../browser-runtime/protocol.mjs";
import { countInteractiveRefs } from "../../browser-runtime/snapshot.mjs";
import {
  CLICK_AT_POINT_SCRIPT,
  COLLECT_INTERACTIVE_NODES,
  EVALUATE_USER_SCRIPT,
  EXTRACT_PAGE_CONTENT,
  REF_INTERACTION_SCRIPT,
  SCROLL_PAGE_SCRIPT,
  WAIT_FOR_TEXT_SCRIPT,
} from "./page-scripts.mjs";

/**
 * @param {ReturnType<import('./manager.mjs').createEmbeddedBrowserManager>} manager
 */
export function createEmbeddedBrowserAutomation(manager) {
  /** @type {Map<string, { refMap: Record<string, { role: string; name: string | null; nth: number; href?: string }> }>} */
  const sessions = new Map();

  function browserIdFromSession(sessionId) {
    const trimmed = String(sessionId ?? "").trim();
    return trimmed || "default";
  }

  function getSession(sessionId) {
    const id = browserIdFromSession(sessionId);
    let session = sessions.get(id);
    if (!session) {
      session = { refMap: {} };
      sessions.set(id, session);
    }
    return session;
  }

  function getWebContents(sessionId) {
    const browserId = browserIdFromSession(sessionId);
    const wc = manager.getWebContents(browserId);
    if (!wc) {
      throw new Error(
        "embedded browser webview is not mounted — call browser navigate first and wait for the side panel to open",
      );
    }
    if (wc.isDestroyed()) {
      throw new Error("embedded browser webview was destroyed");
    }
    return wc;
  }

  /**
   * @param {import('electron').WebContents} wc
   * @param {string} url
   * @param {number} timeoutMs
   */
  async function loadUrlAndWait(wc, url, timeoutMs) {
    const current = wc.getURL();
    if (current === url) {
      return;
    }
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error(`navigation timeout after ${timeoutMs}ms`));
      }, timeoutMs);
      const onFinish = () => {
        cleanup();
        resolve(undefined);
      };
      const onFail = (_event, errorCode, errorDescription) => {
        cleanup();
        reject(new Error(`navigation failed: ${errorDescription || errorCode}`));
      };
      const cleanup = () => {
        clearTimeout(timer);
        wc.removeListener("did-finish-load", onFinish);
        wc.removeListener("did-fail-load", onFail);
      };
      wc.once("did-finish-load", onFinish);
      wc.once("did-fail-load", onFail);
      void wc.loadURL(url);
    });
  }

  /** @param {import('electron').WebContents} wc */
  async function waitForSettle(wc, timeoutMs = 2_500) {
    await new Promise((resolve) => {
      const timer = setTimeout(resolve, timeoutMs);
      const done = () => {
        clearTimeout(timer);
        resolve(undefined);
      };
      if (!wc.isLoading()) {
        done();
        return;
      }
      wc.once("did-stop-loading", done);
    });
    await new Promise((r) => setTimeout(r, 200));
  }

  /** @param {import('electron').WebContents} wc */
  async function readPageMeta(wc) {
    return {
      url: wc.getURL() || "",
      title: wc.getTitle() || "",
    };
  }

  /** @param {import('electron').WebContents} wc */
  async function buildSnapshot(wc, session) {
    const meta = await readPageMeta(wc);
    const nodes = await wc.executeJavaScript(COLLECT_INTERACTIVE_NODES, true);
    /** @type {Record<string, { role: string; name: string | null; nth: number; href?: string }>} */
    const refMap = {};
    /** @type {Record<string, number>} */
    const roleCounts = {};
    if (Array.isArray(nodes)) {
      for (const node of nodes) {
        if (!node || typeof node !== "object") continue;
        const role = String(node.role ?? "").trim();
        if (!role) continue;
        const nameRaw = node.name;
        const name = nameRaw != null ? String(nameRaw).trim() || null : null;
        const hrefRaw = node.href;
        const href =
          hrefRaw != null && String(hrefRaw).trim() ? String(hrefRaw).trim() : undefined;
        const key = `${role}\0${name ?? ""}\0${href ?? ""}`;
        const nth = roleCounts[key] ?? 0;
        roleCounts[key] = nth + 1;
        const ref = `e${Object.keys(refMap).length + 1}`;
        refMap[ref] = { role, name, nth, ...(href ? { href } : {}) };
      }
    }
    session.refMap = refMap;
    const snapshot = formatSnapshotYaml(meta.url, meta.title, refMap);
    return {
      ...meta,
      snapshot,
      nodeCount: countInteractiveRefs(refMap) || Object.keys(refMap).length,
      refMap,
    };
  }

  /** @param {import('electron').WebContents} wc @param {boolean} includePreview */
  async function capturePreview(wc, includePreview) {
    const meta = await readPageMeta(wc);
    if (!includePreview) return meta;
    try {
      const image = await wc.capturePage();
      const png = image.toPNG();
      return {
        ...meta,
        previewBase64: png.toString("base64"),
        previewMimeType: "image/png",
        viewportWidth: image.getSize().width,
        viewportHeight: image.getSize().height,
      };
    } catch {
      return meta;
    }
  }

  /** @param {string} op @param {Record<string, unknown>} args @param {string} sessionId */
  async function invoke(op, args, sessionId) {
    try {
      const browserId = browserIdFromSession(sessionId);
      const includePreview = args.includePreview !== false;

      if (op === "status") {
        const mounted = manager.isMounted(browserId);
        const nav = manager.readNavigationState(browserId);
        return invokeOk({
          browserReady: mounted,
          mode: "native",
          sessionCount: sessions.size,
          url: nav.url,
          title: nav.title,
          platform: process.platform,
        });
      }

      if (op === "session.ensure") {
        const wc = getWebContents(sessionId);
        const meta = await readPageMeta(wc);
        return invokeOk({ sessionId: browserId, ...meta });
      }

      if (op === "session.close") {
        sessions.delete(browserId);
        manager.close(browserId);
        return invokeOk({ sessionId: browserId, closed: true });
      }

      const session = getSession(sessionId);
      const wc = getWebContents(sessionId);

      if (op === "page.navigate") {
        const url = String(args.url ?? "").trim();
        if (!url) return invokeError("url is required");
        const timeoutMs = Number(args.timeoutMs ?? 30_000);
        await loadUrlAndWait(wc, url, timeoutMs);
        await waitForSettle(wc);
        session.refMap = {};
        const data = await capturePreview(wc, includePreview);
        return invokeOk({ sessionId: browserId, ...data });
      }

      if (op === "page.snapshot") {
        const snap = await buildSnapshot(wc, session);
        const data = await capturePreview(wc, includePreview);
        return invokeOk({
          sessionId: browserId,
          url: snap.url,
          title: snap.title,
          snapshot: snap.snapshot,
          nodeCount: snap.nodeCount,
          ...data,
        });
      }

      if (op === "page.content") {
        const selector = String(args.selector ?? "").trim();
        const fullText = await wc.executeJavaScript(
          `(${EXTRACT_PAGE_CONTENT})(${JSON.stringify({ selector: selector || null })})`,
          true,
        );
        const meta = await readPageMeta(wc);
        const maxChars = 12_000;
        const offsetRaw = Number(args.offset ?? 0);
        const offset = Number.isFinite(offsetRaw) && offsetRaw > 0 ? Math.floor(offsetRaw) : 0;
        const text = String(fullText?.text ?? "").slice(offset, offset + maxChars);
        const totalLen = String(fullText?.text ?? "").length;
        const truncated = offset + text.length < totalLen;
        return invokeOk({
          sessionId: browserId,
          ...meta,
          text,
          charCount: totalLen,
          offset: offset || undefined,
          ...(fullText?.matchCount != null ? { matchCount: fullText.matchCount } : {}),
          truncated,
          ...(truncated ? { nextOffset: offset + text.length } : {}),
        });
      }

      if (op === "page.evaluate") {
        const script = String(args.script ?? "").trim();
        if (!script) return invokeError("script is required");
        const value = await wc.executeJavaScript(
          `(${EVALUATE_USER_SCRIPT})(${JSON.stringify(script)})`,
          true,
        );
        const meta = await readPageMeta(wc);
        const json = JSON.stringify(value ?? null);
        const maxChars = 16_000;
        const truncated = json.length > maxChars;
        return invokeOk({
          sessionId: browserId,
          ...meta,
          value: truncated ? undefined : value,
          json: truncated ? json.slice(0, maxChars) : json,
          charCount: json.length,
          truncated,
        });
      }

      if (op === "page.click") {
        const ref = String(args.ref ?? "").trim();
        if (!ref) return invokeError("ref is required (from last snapshot)");
        const target = session.refMap[ref];
        if (!target) return invokeError(`Unknown ref '${ref}'; call page.snapshot first`);
        const urlBefore = wc.getURL();
        await wc.executeJavaScript(
          `(${REF_INTERACTION_SCRIPT})(${JSON.stringify({ target, action: "click" })})`,
          true,
        );
        await waitForSettle(wc, 2_500);
        const urlAfter = wc.getURL();
        const navigated = urlAfter !== urlBefore;
        if (navigated) session.refMap = {};
        const meta = await readPageMeta(wc);
        const data = await capturePreview(wc, includePreview);
        return invokeOk({
          sessionId: browserId,
          ref,
          clicked: true,
          ...meta,
          ...(navigated ? { navigated: true } : {}),
          ...data,
        });
      }

      if (op === "page.click_xy") {
        const x = Number(args.x);
        const y = Number(args.y);
        if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0) {
          return invokeError("x and y must be non-negative");
        }
        const urlBefore = wc.getURL();
        await wc.executeJavaScript(
          `(${CLICK_AT_POINT_SCRIPT})(${JSON.stringify({ x, y })})`,
          true,
        );
        await waitForSettle(wc, 2_500);
        const navigated = wc.getURL() !== urlBefore;
        session.refMap = {};
        const meta = await readPageMeta(wc);
        const data = await capturePreview(wc, includePreview);
        return invokeOk({
          sessionId: browserId,
          clicked: true,
          x,
          y,
          ...meta,
          ...(navigated ? { navigated: true } : {}),
          ...data,
        });
      }

      if (op === "page.type") {
        const ref = String(args.ref ?? "").trim();
        const text = String(args.text ?? "");
        if (!ref) return invokeError("ref is required");
        if (!text) return invokeError("text is required");
        const target = session.refMap[ref];
        if (!target) return invokeError(`Unknown ref '${ref}'; call page.snapshot first`);
        await wc.executeJavaScript(
          `(${REF_INTERACTION_SCRIPT})(${JSON.stringify({ target, action: "type", text })})`,
          true,
        );
        const data = await capturePreview(wc, includePreview);
        return invokeOk({ sessionId: browserId, ref, typedLength: text.length, ...data });
      }

      if (op === "page.fill") {
        const ref = String(args.ref ?? "").trim();
        const value = String(args.value ?? args.text ?? "");
        if (!ref) return invokeError("ref is required");
        const target = session.refMap[ref];
        if (!target) return invokeError(`Unknown ref '${ref}'; call page.snapshot first`);
        await wc.executeJavaScript(
          `(${REF_INTERACTION_SCRIPT})(${JSON.stringify({ target, action: "fill", value })})`,
          true,
        );
        const data = await capturePreview(wc, includePreview);
        return invokeOk({ sessionId: browserId, ref, filled: true, ...data });
      }

      if (op === "page.press") {
        const key = String(args.key ?? "").trim();
        if (!key) return invokeError("key is required (e.g. Enter, Tab)");
        const ref = String(args.ref ?? "").trim();
        const urlBefore = wc.getURL();
        if (ref) {
          const target = session.refMap[ref];
          if (!target) return invokeError(`Unknown ref '${ref}'; call page.snapshot first`);
          await wc.executeJavaScript(
            `(${REF_INTERACTION_SCRIPT})(${JSON.stringify({ target, action: "press", key })})`,
            true,
          );
        } else {
          wc.sendInputEvent({ type: "keyDown", keyCode: key });
          wc.sendInputEvent({ type: "keyUp", keyCode: key });
        }
        await waitForSettle(wc, 2_500);
        const navigated = wc.getURL() !== urlBefore;
        const meta = await readPageMeta(wc);
        const data = await capturePreview(wc, includePreview);
        return invokeOk({
          sessionId: browserId,
          key,
          ref: ref || null,
          ...meta,
          ...(navigated ? { navigated: true } : {}),
          ...data,
        });
      }

      if (op === "page.wait") {
        const timeoutMs = Number(args.timeoutMs ?? 5_000);
        const text = String(args.text ?? "").trim();
        const ref = String(args.ref ?? "").trim();
        const state = String(args.state ?? "visible");
        if (text) {
          await wc.executeJavaScript(
            `(${WAIT_FOR_TEXT_SCRIPT})(${JSON.stringify({ text, timeoutMs })})`,
            true,
          );
        } else if (ref) {
          const target = session.refMap[ref];
          if (!target) return invokeError(`Unknown ref '${ref}'; call page.snapshot first`);
          if (state === "hidden" || state === "detached") {
            return invokeError(`state '${state}' is not supported in native embedded browser`);
          }
          await wc.executeJavaScript(
            `(${REF_INTERACTION_SCRIPT})(${JSON.stringify({ target, action: "wait" })})`,
            true,
          );
        } else {
          await new Promise((r) => setTimeout(r, timeoutMs));
        }
        return invokeOk({ sessionId: browserId, waited: true });
      }

      if (op === "page.scroll") {
        const ref = String(args.ref ?? "").trim();
        const deltaX = Number(args.deltaX ?? 0);
        const deltaY = Number(args.deltaY ?? 600);
        if (ref) {
          const target = session.refMap[ref];
          if (!target) return invokeError(`Unknown ref '${ref}'; call page.snapshot first`);
          await wc.executeJavaScript(
            `(${REF_INTERACTION_SCRIPT})(${JSON.stringify({ target, action: "scroll" })})`,
            true,
          );
        } else {
          await wc.executeJavaScript(
            `(${SCROLL_PAGE_SCRIPT})(${JSON.stringify({
              deltaX: Number.isFinite(deltaX) ? deltaX : 0,
              deltaY: Number.isFinite(deltaY) ? deltaY : 600,
            })})`,
            true,
          );
        }
        await new Promise((r) => setTimeout(r, 250));
        session.refMap = {};
        const meta = await readPageMeta(wc);
        const data = await capturePreview(wc, includePreview);
        return invokeOk({
          sessionId: browserId,
          scrolled: true,
          ref: ref || null,
          deltaX: Number.isFinite(deltaX) ? deltaX : 0,
          deltaY: Number.isFinite(deltaY) ? deltaY : 600,
          ...meta,
          ...data,
        });
      }

      if (op === "page.screenshot") {
        const meta = await readPageMeta(wc);
        if (!includePreview) {
          return invokeOk({ sessionId: browserId, ...meta, panelPreview: true });
        }
        const data = await capturePreview(wc, true);
        return invokeOk({ sessionId: browserId, ...data });
      }

      if (op === "page.back") {
        manager.goBack(browserId);
        await waitForSettle(wc);
        session.refMap = {};
        const data = await capturePreview(wc, includePreview);
        return invokeOk({ sessionId: browserId, ...data });
      }

      if (op === "page.forward") {
        manager.goForward(browserId);
        await waitForSettle(wc);
        session.refMap = {};
        const data = await capturePreview(wc, includePreview);
        return invokeOk({ sessionId: browserId, ...data });
      }

      if (op === "page.reload") {
        wc.reload();
        await waitForSettle(wc, 30_000);
        session.refMap = {};
        const data = await capturePreview(wc, includePreview);
        return invokeOk({ sessionId: browserId, ...data });
      }

      if (op === "page.tabs") {
        const meta = await readPageMeta(wc);
        return invokeOk({
          sessionId: browserId,
          tabs: [{ index: 0, url: meta.url, title: meta.title, active: true }],
          count: 1,
        });
      }

      if (op === "page.tab_select") {
        const index = Number(args.index);
        if (index !== 0) {
          return invokeError("index must be 0 (native embedded browser has a single view per session)");
        }
        const meta = await readPageMeta(wc);
        const data = await capturePreview(wc, includePreview);
        return invokeOk({
          sessionId: browserId,
          index: 0,
          tabCount: 1,
          ...meta,
          ...data,
        });
      }

      if (op === "page.pick_element") {
        return invokeError("pick_element is panel-only in native embedded browser");
      }

      return invokeError(`Unknown op: ${op}`, { code: "unknown_op" });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return invokeError(message);
    }
  }

  return { invoke };
}
