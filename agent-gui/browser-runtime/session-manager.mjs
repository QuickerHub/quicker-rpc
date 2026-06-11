import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright";
import { invokeError, invokeOk } from "./protocol.mjs";
import {
  buildEvaluatePageCode,
  formatEvaluateOutput,
  parseEvaluateResult,
} from "./evaluate-script.mjs";
import {
  buildInteractiveSnapshot,
} from "./page-structure.mjs";
import {
  buildPageSearchResult,
  collectSearchCandidates,
} from "./page-search.mjs";
import {
  collectAriaSnapshot,
  collectInteractiveNodes,
  countInteractiveRefs,
  findRefAtPoint,
  parseAriaSnapshotRefMap,
  pickElementAtPoint,
  resolveLocator,
  snapshotLineForRef,
} from "./snapshot.mjs";

const PREVIEW_OPS = new Set([
  "page.navigate",
  "page.snapshot",
  "page.click",
  "page.click_xy",
  "page.type",
  "page.fill",
  "page.press",
  "page.scroll",
  "page.back",
  "page.forward",
  "page.reload",
  "page.screenshot",
  "page.tab_select",
]);

const STORAGE_STATE_SAVE_DELAY_MS = 800;

export class SessionManager {
  /** @param {{ headless: boolean; channel: string | null; userDataDir: string }} config */
  constructor(config) {
    this._config = config;
    /** @type {import('playwright').Browser | null} */
    this._browser = null;
    /** @type {Map<string, { sessionId: string; context: import('playwright').BrowserContext; page: import('playwright').Page; refMap: Record<string, { role: string; name: string | null; nth: number; href?: string }> }>} */
    this._sessions = new Map();
    this._browserReady = false;
    /** @type {string | null} */
    this._browserError = null;
    this._lock = Promise.resolve();
    /** @type {Map<string, Promise<void>>} */
    this._sessionLocks = new Map();
  }

  get browserReady() {
    return this._browserReady;
  }

  get browserError() {
    return this._browserError;
  }

  get sessionCount() {
    return this._sessions.size;
  }

  /** @template T @param {() => Promise<T>} fn */
  async _withLock(fn) {
    const run = this._lock.then(() => fn());
    this._lock = run.then(() => undefined, () => undefined);
    return run;
  }

  /** @template T @param {string} sessionId @param {() => Promise<T>} fn */
  async _withSessionLock(sessionId, fn) {
    const prev = this._sessionLocks.get(sessionId) ?? Promise.resolve();
    const run = prev.then(() => fn());
    this._sessionLocks.set(
      sessionId,
      run.then(() => undefined, () => undefined),
    );
    return run;
  }

  async shutdown() {
    for (const session of this._sessions.values()) {
      if (session.stateSaveTimer) clearTimeout(session.stateSaveTimer);
      await this._saveStorageState(session);
      try {
        await session.context.close();
      } catch {
        // ignore
      }
    }
    this._sessions.clear();
    if (this._browser) {
      try {
        await this._browser.close();
      } catch {
        // ignore
      }
      this._browser = null;
    }
    this._browserReady = false;
  }

  async _ensureBrowser() {
    if (this._browser && this._browserReady) return;
    if (this._browserError) throw new Error(this._browserError);

    mkdirSync(this._config.userDataDir, { recursive: true });
    try {
      /** @type {Record<string, unknown>} */
      const launchOptions = {
        headless: this._config.headless,
        args: ["--disable-dev-shm-usage"],
      };
      if (this._config.channel) launchOptions.channel = this._config.channel;
      this._browser = await chromium.launch(launchOptions);
    } catch (err) {
      try {
        this._browser = await chromium.launch({ headless: this._config.headless });
      } catch (fallbackErr) {
        this._browserError =
          `Failed to launch browser: ${fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr)}. `
          + "Run: pnpm browser:install";
        throw new Error(this._browserError);
      }
      void err;
    }

    this._browserReady = true;
    this._browserError = null;
    console.log(
      `[browser-runtime] launched headless=${this._config.headless} channel=${this._config.channel ?? "chromium"}`,
    );
  }

  /** @param {string} sessionId */
  _storageStatePath(sessionId) {
    const safe = sessionId.replace(/[^a-zA-Z0-9._-]/g, "_") || "default";
    return join(this._config.userDataDir, "sessions", `${safe}.json`);
  }

  /**
   * Persist cookies/localStorage so logins survive runtime restarts.
   * Debounced; safe to call after every mutating page op.
   * @param {{ sessionId: string; context: import('playwright').BrowserContext; stateSaveTimer?: ReturnType<typeof setTimeout> | null }} session
   */
  _scheduleStorageStateSave(session) {
    if (session.stateSaveTimer) clearTimeout(session.stateSaveTimer);
    session.stateSaveTimer = setTimeout(() => {
      session.stateSaveTimer = null;
      void this._saveStorageState(session);
    }, STORAGE_STATE_SAVE_DELAY_MS);
  }

  /** @param {{ sessionId: string; context: import('playwright').BrowserContext }} session */
  async _saveStorageState(session) {
    try {
      const path = this._storageStatePath(session.sessionId);
      mkdirSync(join(this._config.userDataDir, "sessions"), { recursive: true });
      await session.context.storageState({ path });
    } catch (err) {
      console.warn(`[browser-runtime] storageState save failed session=${session.sessionId}:`, err);
    }
  }

  /**
   * Keep session.page pointing at the page the user/agent is actually on:
   * follow popups (target=_blank) and fall back when the current page closes.
   * @param {{ sessionId: string; context: import('playwright').BrowserContext; page: import('playwright').Page; refMap: Record<string, unknown> }} session
   */
  _trackContextPages(session) {
    session.context.on("page", (page) => {
      page.once("close", () => {
        if (session.page !== page) return;
        const remaining = session.context.pages().filter((p) => !p.isClosed());
        const fallback = remaining[remaining.length - 1];
        if (fallback) {
          session.page = fallback;
          session.refMap = {};
        }
      });
      void (async () => {
        try {
          await page.waitForLoadState("domcontentloaded", { timeout: 8_000 });
        } catch {
          // adopt the page anyway
        }
        if (page.isClosed()) return;
        session.page = page;
        session.refMap = {};
      })();
    });
  }

  /** @param {string} sessionId */
  async ensureSession(sessionId) {
    return this._withLock(async () => {
      const existing = this._sessions.get(sessionId);
      if (existing && !existing.page.isClosed()) return existing;

      await this._ensureBrowser();
      if (!this._browser) throw new Error("Browser not available");

      /** @type {Parameters<import('playwright').Browser['newContext']>[0]} */
      const contextOptions = { viewport: { width: 1280, height: 800 } };
      const statePath = this._storageStatePath(sessionId);
      if (existsSync(statePath)) {
        contextOptions.storageState = statePath;
      }

      let context;
      try {
        context = await this._browser.newContext(contextOptions);
      } catch {
        // Corrupt storage state file — start a fresh context
        context = await this._browser.newContext({
          viewport: { width: 1280, height: 800 },
        });
      }
      const page = await context.newPage();
      const session = { sessionId, context, page, refMap: {}, stateSaveTimer: null };
      this._trackContextPages(session);
      this._sessions.set(sessionId, session);
      return session;
    });
  }

  /** @param {{ page: import('playwright').Page }} session */
  async _capturePanelPreview(session) {
    const viewport = session.page.viewportSize() ?? { width: 1280, height: 800 };
    const png = await session.page.screenshot({ type: "png", fullPage: false });
    return {
      url: session.page.url(),
      title: await session.page.title(),
      previewBase64: png.toString("base64"),
      previewMimeType: "image/png",
      viewportWidth: viewport.width,
      viewportHeight: viewport.height,
    };
  }

  /** @param {{ page: import('playwright').Page; refMap: Record<string, unknown> }} session @param {string} op @param {Record<string, unknown>} payload @param {boolean} [includePreview] */
  async _okWithPreview(session, op, payload, includePreview = true) {
    const data = { ...payload };
    if (includePreview && PREVIEW_OPS.has(op)) {
      try {
        Object.assign(data, await this._capturePanelPreview(session));
      } catch (err) {
        console.warn("[browser-runtime] preview capture failed:", err);
      }
    }
    return invokeOk(data);
  }

  /** @param {string} sessionId */
  async closeSession(sessionId) {
    return this._withLock(async () => {
      const session = this._sessions.get(sessionId);
      if (!session) return;
      this._sessions.delete(sessionId);
      if (session.stateSaveTimer) clearTimeout(session.stateSaveTimer);
      await this._saveStorageState(session);
      try {
        await session.context.close();
      } catch {
        // ignore
      }
    });
  }

  /**
   * Wait briefly for a click/keypress to settle: detect same-page navigation,
   * adopt freshly opened popups, and drop stale snapshot refs.
   * @param {{ sessionId: string; context: import('playwright').BrowserContext; page: import('playwright').Page; refMap: Record<string, unknown> }} session
   * @param {import('playwright').Page} pageBefore
   * @param {string} urlBefore
   */
  async _settleAfterAction(session, pageBefore, urlBefore) {
    try {
      await pageBefore.waitForLoadState("domcontentloaded", { timeout: 2_500 });
    } catch {
      // no navigation or page already closed — fine
    }
    await new Promise((r) => setTimeout(r, 250));

    const pages = session.context.pages().filter((p) => !p.isClosed());
    const newest = pages[pages.length - 1];
    if (newest && newest !== session.page) {
      try {
        await newest.waitForLoadState("domcontentloaded", { timeout: 5_000 });
      } catch {
        // adopt anyway
      }
      session.page = newest;
    }

    const openedTab = session.page !== pageBefore;
    const url = session.page.url();
    const navigated = openedTab || url !== urlBefore;
    if (navigated) session.refMap = {};
    this._scheduleStorageStateSave(session);
    return { navigated, openedTab, url };
  }

  /** @param {string} sessionId */
  _sessionOrError(sessionId) {
    const session = this._sessions.get(sessionId);
    if (!session || session.page.isClosed()) {
      return invokeError(`Session '${sessionId}' not found; call session.ensure first`);
    }
    return session;
  }

  /**
   * Optional url on evaluate/content/search — load page before the op.
   * @param {{ page: import('playwright').Page; refMap: Record<string, unknown> }} session
   * @param {Record<string, unknown>} args
   */
  async _gotoIfNeeded(session, args) {
    const url = String(args.url ?? "").trim();
    if (!url) return false;
    const waitUntil = /** @type {'load' | 'domcontentloaded' | 'networkidle' | 'commit'} */ (
      String(args.waitUntil ?? "domcontentloaded")
    );
    const timeoutMs = Number(args.timeoutMs ?? 30_000);
    await session.page.goto(url, { waitUntil, timeout: timeoutMs });
    try {
      await session.page.waitForLoadState("networkidle", { timeout: 4_000 });
    } catch {
      await session.page.waitForTimeout(800);
    }
    session.refMap = {};
    this._scheduleStorageStateSave(session);
    return true;
  }

  /**
   * Compact interactive snapshot for refs; full aria tree is opt-in via snapshot op.
   * @param {{ page: import('playwright').Page; refMap: Record<string, unknown> }} session
   */
  async _buildPageSnapshot(session) {
    const nodes = await collectInteractiveNodes(session.page);
    const built = buildInteractiveSnapshot(
      session.page.url(),
      await session.page.title(),
      nodes,
    );
    session.refMap = built.refMap;

    return {
      url: session.page.url(),
      title: await session.page.title(),
      snapshot: built.snapshot,
      nodeCount: built.nodeCount,
    };
  }

  /**
   * @param {{ page: import('playwright').Page; refMap: Record<string, unknown> }} session
   * @param {string} query
   * @param {number} limit
   */
  async _searchPage(session, query, limit) {
    const candidates = await collectSearchCandidates(session.page);
    const result = buildPageSearchResult(query, candidates, session.refMap, limit);
    session.refMap = result.refMap;
    return {
      url: session.page.url(),
      title: await session.page.title(),
      query: result.query,
      matchCount: result.matchCount,
      matches: result.matches,
    };
  }

  /** @param {string} op @param {Record<string, unknown>} args @param {string} sessionId */
  async invoke(op, args, sessionId) {
    try {
      if (op === "status") {
        return invokeOk({
          browserReady: this._browserReady,
          browserError: this._browserError,
          sessionCount: this.sessionCount,
          headless: this._config.headless,
          channel: this._config.channel,
          platform: process.platform,
        });
      }

      if (op === "session.ensure") {
        const session = await this.ensureSession(sessionId);
        return invokeOk({
          sessionId: session.sessionId,
          url: session.page.url(),
          title: await session.page.title(),
        });
      }

      if (op === "session.close") {
        await this.closeSession(sessionId);
        return invokeOk({ sessionId, closed: true });
      }

      const pageOps = new Set([
        "page.navigate",
        "page.snapshot",
        "page.search",
        "page.content",
        "page.click",
        "page.click_xy",
        "page.pick_element",
        "page.type",
        "page.fill",
        "page.press",
        "page.wait",
        "page.scroll",
        "page.evaluate",
        "page.screenshot",
        "page.back",
        "page.forward",
        "page.reload",
        "page.tabs",
        "page.tab_select",
      ]);

      if (pageOps.has(op)) {
        return this._withSessionLock(sessionId, async () =>
          this._invokePageOp(op, args, sessionId),
        );
      }

      return invokeError(`Unknown op: ${op}`, { code: "unknown_op" });
    } catch (err) {
      console.error(`[browser-runtime] invoke failed op=${op} session=${sessionId}`, err);
      return invokeError(err instanceof Error ? err.message : String(err));
    }
  }

  /** @param {string} op @param {Record<string, unknown>} args @param {string} sessionId */
  async _invokePageOp(op, args, sessionId) {
    try {
        let sessionResult = this._sessionOrError(sessionId);
        if (sessionResult && "ok" in sessionResult && sessionResult.ok === false) {
          const urlBootstrap =
            op === "page.navigate"
            || (
              Boolean(String(args.url ?? "").trim())
              && (op === "page.evaluate" || op === "page.content" || op === "page.search")
            );
          if (urlBootstrap) {
            await this.ensureSession(sessionId);
            sessionResult = this._sessionOrError(sessionId);
            if (sessionResult && "ok" in sessionResult && sessionResult.ok === false) {
              return sessionResult;
            }
          } else {
            return sessionResult;
          }
        }
        const session = /** @type {{ page: import('playwright').Page; context: import('playwright').BrowserContext; refMap: Record<string, { role: string; name: string | null; nth: number }> }} */ (
          sessionResult
        );
        const includePreview = args.includePreview !== false;

        if (op === "page.navigate") {
          const url = String(args.url ?? "").trim();
          if (!url) return invokeError("url is required");
          const waitUntil = /** @type {'load' | 'domcontentloaded' | 'networkidle' | 'commit'} */ (
            String(args.waitUntil ?? "domcontentloaded")
          );
          const timeoutMs = Number(args.timeoutMs ?? 30_000);
          const response = await session.page.goto(url, { waitUntil, timeout: timeoutMs });
          try {
            await session.page.waitForLoadState("networkidle", { timeout: 4_000 });
          } catch {
            await session.page.waitForTimeout(800);
          }
          session.refMap = {};
          this._scheduleStorageStateSave(session);
          const pageSnap = await this._buildPageSnapshot(session);
          return this._okWithPreview(
            session,
            op,
            {
              status: response?.status() ?? null,
              ...pageSnap,
            },
            includePreview,
          );
        }

        if (op === "page.snapshot" || op === "page.pick_element") {
          const pickCoords =
            op === "page.pick_element"
              ? { x: Number(args.x), y: Number(args.y) }
              : null;
          if (pickCoords) {
            if (
              !Number.isFinite(pickCoords.x)
              || !Number.isFinite(pickCoords.y)
              || pickCoords.x < 0
              || pickCoords.y < 0
            ) {
              return invokeError("x and y must be non-negative for pick_element");
            }
          }

          /** @type {Awaited<ReturnType<typeof pickElementAtPoint>> | null} */
          let picked = null;
          if (pickCoords) {
            picked = await pickElementAtPoint(session.page, pickCoords.x, pickCoords.y);
            if (!picked.found) {
              return invokeError("No element at the given coordinates");
            }
          }

          const pageSnap = await this._buildPageSnapshot(session);
          const { snapshot } = pageSnap;
          const refMap = session.refMap;

          if (op === "page.snapshot") {
            return this._okWithPreview(session, op, pageSnap, includePreview);
          }

          const ref = await findRefAtPoint(
            session.page,
            refMap,
            pickCoords.x,
            pickCoords.y,
          );
          const refTarget = ref ? refMap[ref] : null;
          return invokeOk({
            url: session.page.url(),
            title: await session.page.title(),
            pickX: pickCoords.x,
            pickY: pickCoords.y,
            ref,
            refRole: refTarget?.role ?? picked.role ?? null,
            refName: refTarget?.name ?? picked.name ?? null,
            tagName: picked.tagName ?? null,
            text: picked.text ?? null,
            elementId: picked.id ?? null,
            className: picked.className ?? null,
            href: picked.href ?? refTarget?.href ?? null,
            value: picked.value ?? null,
            snapshotLine: snapshotLineForRef(snapshot, ref),
            nodeCount: countInteractiveRefs(refMap) || Object.keys(refMap).length,
          });
        }

        if (op === "page.content") {
          await this._gotoIfNeeded(session, args);
          const selector = String(args.selector ?? "").trim();
          const fullText = await session.page.evaluate((sel) => {
            /** @param {string} raw */
            const clean = (raw) => raw.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
            if (sel) {
              const matches = Array.from(document.querySelectorAll(sel));
              return {
                text: clean(
                  matches
                    .map((el) => /** @type {HTMLElement} */ (el).innerText ?? el.textContent ?? "")
                    .join("\n\n"),
                ),
                matchCount: matches.length,
              };
            }
            return { text: clean(document.body?.innerText ?? ""), matchCount: null };
          }, selector || null);

          const maxChars = 12_000;
          const offsetRaw = Number(args.offset ?? 0);
          const offset = Number.isFinite(offsetRaw) && offsetRaw > 0
            ? Math.floor(offsetRaw)
            : 0;
          const text = fullText.text.slice(offset, offset + maxChars);
          const truncated = offset + text.length < fullText.text.length;
          return invokeOk({
            url: session.page.url(),
            title: await session.page.title(),
            text,
            charCount: fullText.text.length,
            offset: offset || undefined,
            ...(fullText.matchCount != null ? { matchCount: fullText.matchCount } : {}),
            truncated,
            ...(truncated ? { nextOffset: offset + text.length } : {}),
          });
        }

        if (op === "page.search") {
          await this._gotoIfNeeded(session, args);
          const query = String(args.text ?? args.query ?? "").trim();
          if (!query) return invokeError("text is required for search");
          const limitRaw = Number(args.limit ?? 8);
          const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(Math.floor(limitRaw), 1), 20) : 8;
          const data = await this._searchPage(session, query, limit);
          return invokeOk(data);
        }

        if (op === "page.click") {
          const ref = String(args.ref ?? "").trim();
          if (!ref) return invokeError("ref is required (from last snapshot)");
          const target = session.refMap[ref];
          if (!target) return invokeError(`Unknown ref '${ref}'; call page.snapshot first`);
          const pageBefore = session.page;
          const urlBefore = pageBefore.url();
          const locator = resolveLocator(session.page, target);
          await locator.click({ timeout: Number(args.timeoutMs ?? 10_000) });
          const settle = await this._settleAfterAction(session, pageBefore, urlBefore);
          return this._okWithPreview(
            session,
            op,
            {
              ref,
              clicked: true,
              url: settle.url,
              title: await session.page.title(),
              ...(settle.navigated ? { navigated: true } : {}),
              ...(settle.openedTab ? { openedTab: true } : {}),
            },
            includePreview,
          );
        }

        if (op === "page.click_xy") {
          const x = Number(args.x);
          const y = Number(args.y);
          if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0) {
            return invokeError("x and y must be non-negative");
          }
          const pageBefore = session.page;
          const urlBefore = pageBefore.url();
          await session.page.mouse.click(x, y);
          const settle = await this._settleAfterAction(session, pageBefore, urlBefore);
          session.refMap = {};
          return this._okWithPreview(
            session,
            op,
            {
              clicked: true,
              x,
              y,
              url: settle.url,
              ...(settle.navigated ? { navigated: true } : {}),
              ...(settle.openedTab ? { openedTab: true } : {}),
            },
            includePreview,
          );
        }

        if (op === "page.type") {
          const ref = String(args.ref ?? "").trim();
          const text = String(args.text ?? "");
          if (!ref) return invokeError("ref is required");
          if (!text) return invokeError("text is required");
          const target = session.refMap[ref];
          if (!target) return invokeError(`Unknown ref '${ref}'; call page.snapshot first`);
          const locator = resolveLocator(session.page, target);
          await locator.type(text, { delay: Number(args.delayMs ?? 0) });
          return this._okWithPreview(
            session,
            op,
            { ref, typedLength: text.length },
            includePreview,
          );
        }

        if (op === "page.fill") {
          const ref = String(args.ref ?? "").trim();
          const value = String(args.value ?? args.text ?? "");
          if (!ref) return invokeError("ref is required");
          const target = session.refMap[ref];
          if (!target) return invokeError(`Unknown ref '${ref}'; call page.snapshot first`);
          const locator = resolveLocator(session.page, target);
          await locator.fill(value);
          return this._okWithPreview(session, op, { ref, filled: true }, includePreview);
        }

        if (op === "page.press") {
          const key = String(args.key ?? "").trim();
          if (!key) return invokeError("key is required (e.g. Enter, Tab)");
          const ref = String(args.ref ?? "").trim();
          const pageBefore = session.page;
          const urlBefore = pageBefore.url();
          if (ref) {
            const target = session.refMap[ref];
            if (!target) return invokeError(`Unknown ref '${ref}'; call page.snapshot first`);
            const locator = resolveLocator(session.page, target);
            await locator.press(key);
          } else {
            await session.page.keyboard.press(key);
          }
          const settle = await this._settleAfterAction(session, pageBefore, urlBefore);
          return this._okWithPreview(
            session,
            op,
            {
              key,
              ref: ref || null,
              url: settle.url,
              ...(settle.navigated ? { navigated: true } : {}),
              ...(settle.openedTab ? { openedTab: true } : {}),
            },
            includePreview,
          );
        }

        if (op === "page.wait") {
          const timeoutMs = Number(args.timeoutMs ?? 5_000);
          const text = String(args.text ?? "").trim();
          const ref = String(args.ref ?? "").trim();
          const state = /** @type {'attached' | 'detached' | 'visible' | 'hidden'} */ (
            String(args.state ?? "visible")
          );
          if (text) {
            await session.page.getByText(text, { exact: false }).first().waitFor({ state, timeout: timeoutMs });
          } else if (ref) {
            const target = session.refMap[ref];
            if (!target) return invokeError(`Unknown ref '${ref}'; call page.snapshot first`);
            const locator = resolveLocator(session.page, target);
            await locator.waitFor({ state, timeout: timeoutMs });
          } else {
            await new Promise((r) => setTimeout(r, timeoutMs));
          }
          return invokeOk({ waited: true });
        }

        if (op === "page.scroll") {
          const ref = String(args.ref ?? "").trim();
          const deltaX = Number(args.deltaX ?? 0);
          const deltaY = Number(args.deltaY ?? 600);
          if (ref) {
            const target = session.refMap[ref];
            if (!target) return invokeError(`Unknown ref '${ref}'; call page.snapshot first`);
            const locator = resolveLocator(session.page, target);
            await locator.scrollIntoViewIfNeeded({ timeout: Number(args.timeoutMs ?? 10_000) });
          } else {
            await session.page.mouse.wheel(
              Number.isFinite(deltaX) ? deltaX : 0,
              Number.isFinite(deltaY) ? deltaY : 600,
            );
          }
          await session.page.waitForTimeout(250);
          session.refMap = {};
          return this._okWithPreview(
            session,
            op,
            {
              scrolled: true,
              ref: ref || null,
              deltaX: Number.isFinite(deltaX) ? deltaX : 0,
              deltaY: Number.isFinite(deltaY) ? deltaY : 600,
              url: session.page.url(),
              title: await session.page.title(),
            },
            includePreview,
          );
        }

        if (op === "page.evaluate") {
          await this._gotoIfNeeded(session, args);
          const script = String(args.script ?? "").trim();
          if (!script) return invokeError("script is required");
          const built = buildEvaluatePageCode(script);
          if (!built.ok) return invokeError(built.error);
          const raw = await session.page.evaluate(built.code);
          const parsed = parseEvaluateResult(raw);
          if (!parsed.ok) return invokeError(`evaluate failed: ${parsed.error}`);
          const output = formatEvaluateOutput(parsed);
          return invokeOk({
            url: session.page.url(),
            title: await session.page.title(),
            ...output,
          });
        }

        if (op === "page.screenshot") {
          if (!includePreview) {
            return invokeOk({
              url: session.page.url(),
              title: await session.page.title(),
              panelPreview: true,
            });
          }
          const fullPage = Boolean(args.fullPage);
          const data = await this._capturePanelPreview(session);
          if (fullPage) {
            const png = await session.page.screenshot({ fullPage: true, type: "png" });
            let encoded = png.toString("base64");
            const truncated = encoded.length > 400_000;
            if (truncated) encoded = encoded.slice(0, 400_000);
            data.mimeType = "image/png";
            data.base64 = encoded;
            data.truncated = truncated;
          }
          return invokeOk(data);
        }

        if (op === "page.back") {
          await session.page.goBack();
          session.refMap = {};
          return this._okWithPreview(
            session,
            op,
            {
              url: session.page.url(),
              title: await session.page.title(),
            },
            includePreview,
          );
        }

        if (op === "page.forward") {
          await session.page.goForward();
          session.refMap = {};
          return this._okWithPreview(
            session,
            op,
            {
              url: session.page.url(),
              title: await session.page.title(),
            },
            includePreview,
          );
        }

        if (op === "page.reload") {
          const waitUntil = /** @type {'load' | 'domcontentloaded' | 'networkidle' | 'commit'} */ (
            String(args.waitUntil ?? "domcontentloaded")
          );
          await session.page.reload({ waitUntil });
          session.refMap = {};
          return this._okWithPreview(
            session,
            op,
            {
              url: session.page.url(),
              title: await session.page.title(),
            },
            includePreview,
          );
        }

        if (op === "page.tabs") {
          const pages = session.context.pages();
          const tabs = await Promise.all(
            pages.map(async (page, index) => ({
              index,
              url: page.url(),
              title: await page.title(),
              active: page === session.page,
            })),
          );
          return invokeOk({ tabs, count: tabs.length });
        }

        if (op === "page.tab_select") {
          const index = Number(args.index);
          const pages = session.context.pages();
          if (!Number.isInteger(index) || index < 0 || index >= pages.length) {
            return invokeError(
              `index must be 0..${pages.length - 1} (use action=tabs to list open tabs)`,
            );
          }
          const target = pages[index];
          if (target.isClosed()) return invokeError(`Tab ${index} is already closed`);
          session.page = target;
          session.refMap = {};
          try {
            await target.bringToFront();
          } catch {
            // headless contexts may not support bringToFront — selection still works
          }
          return this._okWithPreview(
            session,
            op,
            {
              index,
              url: target.url(),
              title: await target.title(),
              tabCount: pages.length,
            },
            includePreview,
          );
        }

      return invokeError(`Unknown op: ${op}`, { code: "unknown_op" });
    } catch (err) {
      console.error(`[browser-runtime] invoke failed op=${op} session=${sessionId}`, err);
      return invokeError(err instanceof Error ? err.message : String(err));
    }
  }
}
