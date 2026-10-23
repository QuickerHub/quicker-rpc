import { invokeError, invokeOk } from "../../browser-runtime/protocol.mjs";
import { BrowserOperationQueue, createBrowserOperationOwner } from "../../browser-runtime/operation-owner.mjs";
import {
  buildEvaluatePageCode,
  formatEvaluateOutput,
  parseEvaluateResult,
} from "../../browser-runtime/evaluate-script.mjs";
import {
  buildInteractiveSnapshot,
} from "../../browser-runtime/page-structure.mjs";
import {
  buildPageSearchResult,
  COLLECT_SEARCH_CANDIDATES,
} from "../../browser-runtime/page-search.mjs";
import {
  CLICK_AT_POINT_SCRIPT,
  COLLECT_INTERACTIVE_NODES,
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
  const operations = new BrowserOperationQueue();

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
    let wc = manager.getWebContents(browserId);
    if (!wc) {
      manager.ensureOffscreen(browserId);
      wc = manager.getWebContents(browserId);
    }
    if (!wc) {
      throw new Error("embedded browser session is not ready");
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
  async function loadUrlAndWait(wc, url, timeoutMs, owner) {
    owner.checkpoint();
    const current = wc.getURL();
    if (current === url) {
      return;
    }
    let native;
    const events = new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        owner.cancel(new Error(`navigation timeout after ${timeoutMs}ms`));
      }, timeoutMs);
      const onFinish = () => {
        cleanup();
        resolve(undefined);
      };
      const onFail = (_event, errorCode, errorDescription) => {
        cleanup();
        reject(new Error(`navigation failed: ${errorDescription || errorCode}`));
      };
      const onAbort = () => { cleanup(); reject(owner.signal.reason); };
      const cleanup = () => {
        clearTimeout(timer);
        wc.removeListener("did-finish-load", onFinish);
        wc.removeListener("did-fail-load", onFail);
        owner.signal?.removeEventListener("abort", onAbort);
      };
      wc.once("did-finish-load", onFinish);
      wc.once("did-fail-load", onFail);
      owner.signal?.addEventListener("abort", onAbort, { once: true });
      try {
        native = Promise.resolve(wc.loadURL(url));
        void native.catch((error) => { cleanup(); reject(error); });
      } catch (error) {
        cleanup();
        reject(error);
      }
    });
    // A timer/event may finish before loadURL; keep this session owned until native work settles.
    const results = await owner.wait(() => Promise.allSettled([events, native]));
    const failed = results.find((result) => result.status === "rejected");
    if (failed) throw failed.reason;
  }

  /** @param {import('electron').WebContents} wc */
  async function waitForSettle(wc, timeoutMs = 2_500, owner) {
    await owner.wait(() => new Promise((resolve, reject) => {
      const cleanup = () => {
        clearTimeout(timer);
        wc.removeListener("did-stop-loading", done);
        owner.signal?.removeEventListener("abort", onAbort);
      };
      const done = () => {
        cleanup();
        resolve(undefined);
      };
      const onAbort = () => { cleanup(); reject(owner.signal.reason); };
      const timer = setTimeout(done, timeoutMs);
      owner.signal?.addEventListener("abort", onAbort, { once: true });
      if (!wc.isLoading()) {
        done();
        return;
      }
      wc.once("did-stop-loading", done);
    }));
    await owner.pause(200);
  }

  /**
   * Optional url on evaluate/content/search — load page before the op (parity with Playwright runtime).
   * @param {import('electron').WebContents} wc
   * @param {{ refMap: Record<string, unknown> }} session
   * @param {Record<string, unknown>} args
   */
  async function gotoIfNeeded(wc, session, args, owner) {
    const url = String(args.url ?? "").trim();
    if (!url) return false;
    const timeoutMs = Number(args.timeoutMs ?? 30_000);
    await owner.wait(() => loadUrlAndWait(wc, url, timeoutMs, owner));
    await owner.wait(() => waitForSettle(wc, undefined, owner));
    owner.checkpoint();
    session.refMap = {};
    return true;
  }

  /** @param {import('electron').WebContents} wc */
  async function readPageMeta(wc, owner) {
    return {
      url: wc.getURL() || "",
      title: wc.getTitle() || "",
    };
  }

  /** @param {import('electron').WebContents} wc */
  async function buildSnapshot(wc, session, owner) {
    const meta = await owner.wait(() => readPageMeta(wc, owner));
    const nodes = await owner.wait(() => wc.executeJavaScript(`(${COLLECT_INTERACTIVE_NODES})()`, true));
    const built = buildInteractiveSnapshot(
      meta.url,
      meta.title,
      Array.isArray(nodes) ? nodes : [],
    );
    owner.checkpoint();
    session.refMap = built.refMap;
    return {
      ...meta,
      snapshot: built.snapshot,
      nodeCount: built.nodeCount,
      refMap: built.refMap,
    };
  }

  /** @param {import('electron').WebContents} wc @param {{ refMap: Record<string, unknown> }} session @param {string} query @param {number} limit */
  async function searchPage(wc, session, query, limit, owner) {
    const meta = await owner.wait(() => readPageMeta(wc, owner));
    const raw = await owner.wait(() => wc.executeJavaScript(`(${COLLECT_SEARCH_CANDIDATES})()`, true));
    const result = buildPageSearchResult(
      query,
      raw,
      session.refMap,
      limit,
    );
    owner.checkpoint();
    session.refMap = result.refMap;
    return {
      ...meta,
      query: result.query,
      matchCount: result.matchCount,
      matches: result.matches,
    };
  }

  /** @param {import('electron').WebContents} wc @param {boolean} includePreview */
  async function capturePreview(wc, includePreview, owner) {
    const meta = await owner.wait(() => readPageMeta(wc, owner));
    if (!includePreview) return meta;
    try {
      const image = await owner.wait(() => wc.capturePage());
      const png = image.toPNG();
      return {
        ...meta,
        previewBase64: png.toString("base64"),
        previewMimeType: "image/png",
        viewportWidth: image.getSize().width,
        viewportHeight: image.getSize().height,
      };
    } catch {
      owner.checkpoint();
      return meta;
    }
  }

  /** @param {string} op @param {Record<string, unknown>} args @param {string} sessionId */
  async function invoke(op, args, sessionId, options = {}) {
    const owner = createBrowserOperationOwner(options.abortSignal);
    return operations.run(browserIdFromSession(sessionId), owner, () => invokeOwned(op, args, sessionId, owner));
  }

  async function invokeOwned(op, args, sessionId, owner) {
    try {
      const browserId = browserIdFromSession(sessionId);
      const includePreview = args.includePreview !== false;

      if (op === "status") {
        const wc = manager.getWebContents(browserId);
        const mounted = manager.isMounted(browserId);
        const nav = manager.readNavigationState(browserId);
        return invokeOk({
          browserReady: Boolean(wc),
          mounted,
          mode: "embedded",
          sessionCount: sessions.size,
          url: nav.url,
          title: nav.title,
          platform: process.platform,
        });
      }

      if (op === "session.ensure") {
        manager.ensureOffscreen(browserId);
        const wc = getWebContents(sessionId);
        const meta = await owner.wait(() => readPageMeta(wc, owner));
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
        await owner.wait(() => loadUrlAndWait(wc, url, timeoutMs, owner));
        await owner.wait(() => waitForSettle(wc, undefined, owner));
        owner.checkpoint();
        session.refMap = {};
        const snap = await owner.wait(() => buildSnapshot(wc, session, owner));
        const data = await owner.wait(() => capturePreview(wc, includePreview, owner));
        return invokeOk({
          sessionId: browserId,
          url: snap.url,
          title: snap.title,
          snapshot: snap.snapshot,
          nodeCount: snap.nodeCount,
          ...data,
        });
      }

      if (op === "page.snapshot") {
        const snap = await owner.wait(() => buildSnapshot(wc, session, owner));
        const data = await owner.wait(() => capturePreview(wc, includePreview, owner));
        return invokeOk({
          sessionId: browserId,
          url: snap.url,
          title: snap.title,
          snapshot: snap.snapshot,
          nodeCount: snap.nodeCount,
          ...data,
        });
      }

      if (op === "page.search") {
        const query = String(args.text ?? args.query ?? "").trim();
        if (!query) return invokeError("text is required for search");
        await owner.wait(() => gotoIfNeeded(wc, session, args, owner));
        const limitRaw = Number(args.limit ?? 8);
        const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(Math.floor(limitRaw), 1), 20) : 8;
        const found = await owner.wait(() => searchPage(wc, session, query, limit, owner));
        return invokeOk({ sessionId: browserId, ...found });
      }

      if (op === "page.content") {
        const selector = String(args.selector ?? "").trim();
        await owner.wait(() => gotoIfNeeded(wc, session, args, owner));
        const fullText = await owner.wait(() => wc.executeJavaScript(
          `(${EXTRACT_PAGE_CONTENT})(${JSON.stringify({ selector: selector || null })})`,
          true,
        ));
        const meta = await owner.wait(() => readPageMeta(wc, owner));
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
        await owner.wait(() => gotoIfNeeded(wc, session, args, owner));
        const built = buildEvaluatePageCode(script);
        if (!built.ok) return invokeError(built.error);
        const raw = await owner.wait(() => wc.executeJavaScript(built.code, true));
        const parsed = parseEvaluateResult(raw);
        if (!parsed.ok) return invokeError(`evaluate failed: ${parsed.error}`);
        const meta = await owner.wait(() => readPageMeta(wc, owner));
        const output = formatEvaluateOutput(parsed);
        return invokeOk({
          sessionId: browserId,
          ...meta,
          ...output,
        });
      }

      if (op === "page.click") {
        const ref = String(args.ref ?? "").trim();
        if (!ref) return invokeError("ref is required (from last snapshot)");
        const target = session.refMap[ref];
        if (!target) return invokeError(`Unknown ref '${ref}'; call page.snapshot first`);
        const urlBefore = wc.getURL();
        await owner.wait(() => wc.executeJavaScript(
          `(${REF_INTERACTION_SCRIPT})(${JSON.stringify({ target, action: "click" })})`,
          true,
        ));
        await owner.wait(() => waitForSettle(wc, 2_500, owner));
        const urlAfter = wc.getURL();
        const navigated = urlAfter !== urlBefore;
        owner.checkpoint();
        if (navigated) session.refMap = {};
        const meta = await owner.wait(() => readPageMeta(wc, owner));
        const data = await owner.wait(() => capturePreview(wc, includePreview, owner));
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
        await owner.wait(() => wc.executeJavaScript(
          `(${CLICK_AT_POINT_SCRIPT})(${JSON.stringify({ x, y })})`,
          true,
        ));
        await owner.wait(() => waitForSettle(wc, 2_500, owner));
        const navigated = wc.getURL() !== urlBefore;
        owner.checkpoint();
        session.refMap = {};
        const meta = await owner.wait(() => readPageMeta(wc, owner));
        const data = await owner.wait(() => capturePreview(wc, includePreview, owner));
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
        await owner.wait(() => wc.executeJavaScript(
          `(${REF_INTERACTION_SCRIPT})(${JSON.stringify({ target, action: "type", text })})`,
          true,
        ));
        const data = await owner.wait(() => capturePreview(wc, includePreview, owner));
        return invokeOk({ sessionId: browserId, ref, typedLength: text.length, ...data });
      }

      if (op === "page.fill") {
        const ref = String(args.ref ?? "").trim();
        const value = String(args.value ?? args.text ?? "");
        if (!ref) return invokeError("ref is required");
        const target = session.refMap[ref];
        if (!target) return invokeError(`Unknown ref '${ref}'; call page.snapshot first`);
        await owner.wait(() => wc.executeJavaScript(
          `(${REF_INTERACTION_SCRIPT})(${JSON.stringify({ target, action: "fill", value })})`,
          true,
        ));
        const data = await owner.wait(() => capturePreview(wc, includePreview, owner));
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
          await owner.wait(() => wc.executeJavaScript(
            `(${REF_INTERACTION_SCRIPT})(${JSON.stringify({ target, action: "press", key })})`,
            true,
          ));
        } else {
          wc.sendInputEvent({ type: "keyDown", keyCode: key });
          wc.sendInputEvent({ type: "keyUp", keyCode: key });
        }
        await owner.wait(() => waitForSettle(wc, 2_500, owner));
        const navigated = wc.getURL() !== urlBefore;
        const meta = await owner.wait(() => readPageMeta(wc, owner));
        const data = await owner.wait(() => capturePreview(wc, includePreview, owner));
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
          await owner.wait(() => wc.executeJavaScript(
            `(${WAIT_FOR_TEXT_SCRIPT})(${JSON.stringify({ text, timeoutMs })})`,
            true,
          ));
        } else if (ref) {
          const target = session.refMap[ref];
          if (!target) return invokeError(`Unknown ref '${ref}'; call page.snapshot first`);
          if (state === "hidden" || state === "detached") {
            return invokeError(`state '${state}' is not supported in native embedded browser`);
          }
          await owner.wait(() => wc.executeJavaScript(
            `(${REF_INTERACTION_SCRIPT})(${JSON.stringify({ target, action: "wait" })})`,
            true,
          ));
        } else {
          await owner.pause(timeoutMs);
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
          await owner.wait(() => wc.executeJavaScript(
            `(${REF_INTERACTION_SCRIPT})(${JSON.stringify({ target, action: "scroll" })})`,
            true,
          ));
        } else {
          await owner.wait(() => wc.executeJavaScript(
            `(${SCROLL_PAGE_SCRIPT})(${JSON.stringify({
              deltaX: Number.isFinite(deltaX) ? deltaX : 0,
              deltaY: Number.isFinite(deltaY) ? deltaY : 600,
            })})`,
            true,
          ));
        }
        await owner.pause(250);
        owner.checkpoint();
        session.refMap = {};
        const meta = await owner.wait(() => readPageMeta(wc, owner));
        const data = await owner.wait(() => capturePreview(wc, includePreview, owner));
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
        const meta = await owner.wait(() => readPageMeta(wc, owner));
        if (!includePreview) {
          return invokeOk({ sessionId: browserId, ...meta, panelPreview: true });
        }
        const data = await owner.wait(() => capturePreview(wc, true, owner));
        return invokeOk({ sessionId: browserId, ...data });
      }

      if (op === "page.back") {
        manager.goBack(browserId);
        await owner.wait(() => waitForSettle(wc, undefined, owner));
        owner.checkpoint();
        session.refMap = {};
        const data = await owner.wait(() => capturePreview(wc, includePreview, owner));
        return invokeOk({ sessionId: browserId, ...data });
      }

      if (op === "page.forward") {
        manager.goForward(browserId);
        await owner.wait(() => waitForSettle(wc, undefined, owner));
        owner.checkpoint();
        session.refMap = {};
        const data = await owner.wait(() => capturePreview(wc, includePreview, owner));
        return invokeOk({ sessionId: browserId, ...data });
      }

      if (op === "page.reload") {
        wc.reload();
        await owner.wait(() => waitForSettle(wc, 30_000, owner));
        owner.checkpoint();
        session.refMap = {};
        const data = await owner.wait(() => capturePreview(wc, includePreview, owner));
        return invokeOk({ sessionId: browserId, ...data });
      }

      if (op === "page.tabs") {
        const meta = await owner.wait(() => readPageMeta(wc, owner));
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
        const meta = await owner.wait(() => readPageMeta(wc, owner));
        const data = await owner.wait(() => capturePreview(wc, includePreview, owner));
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
      owner.checkpoint();
      const message = err instanceof Error ? err.message : String(err);
      return invokeError(message);
    }
  }

  return { invoke };
}
