import { mkdirSync } from "node:fs";
import { chromium } from "playwright";
import { invokeError, invokeOk, formatSnapshotYaml } from "./protocol.mjs";
import { collectInteractiveNodes, resolveLocator } from "./snapshot.mjs";

const PREVIEW_OPS = new Set([
  "page.navigate",
  "page.snapshot",
  "page.click",
  "page.click_xy",
  "page.type",
  "page.fill",
  "page.press",
  "page.back",
  "page.forward",
  "page.reload",
  "page.screenshot",
]);

export class SessionManager {
  /** @param {{ headless: boolean; channel: string | null; userDataDir: string }} config */
  constructor(config) {
    this._config = config;
    /** @type {import('playwright').Browser | null} */
    this._browser = null;
    /** @type {Map<string, { sessionId: string; context: import('playwright').BrowserContext; page: import('playwright').Page; refMap: Record<string, { role: string; name: string | null; nth: number }> }>} */
    this._sessions = new Map();
    this._browserReady = false;
    /** @type {string | null} */
    this._browserError = null;
    this._lock = Promise.resolve();
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

  async shutdown() {
    for (const session of this._sessions.values()) {
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
  async ensureSession(sessionId) {
    return this._withLock(async () => {
      const existing = this._sessions.get(sessionId);
      if (existing && !existing.page.isClosed()) return existing;

      await this._ensureBrowser();
      if (!this._browser) throw new Error("Browser not available");

      const context = await this._browser.newContext({
        viewport: { width: 1280, height: 800 },
      });
      const page = await context.newPage();
      const session = { sessionId, context, page, refMap: {} };
      this._sessions.set(sessionId, session);
      return session;
    });
  }

  /** @param {{ page: import('playwright').Page }} session */
  async _capturePanelPreview(session) {
    const viewport = session.page.viewportSize() ?? { width: 1280, height: 800 };
    const jpeg = await session.page.screenshot({ type: "jpeg", quality: 58, fullPage: false });
    return {
      url: session.page.url(),
      title: await session.page.title(),
      previewBase64: jpeg.toString("base64"),
      previewMimeType: "image/jpeg",
      viewportWidth: viewport.width,
      viewportHeight: viewport.height,
    };
  }

  /** @param {{ page: import('playwright').Page; refMap: Record<string, unknown> }} session @param {string} op @param {Record<string, unknown>} payload */
  async _okWithPreview(session, op, payload) {
    const data = { ...payload };
    if (PREVIEW_OPS.has(op)) {
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
      try {
        await session.context.close();
      } catch {
        // ignore
      }
    });
  }

  /** @param {string} sessionId */
  _sessionOrError(sessionId) {
    const session = this._sessions.get(sessionId);
    if (!session || session.page.isClosed()) {
      return invokeError(`Session '${sessionId}' not found; call session.ensure first`);
    }
    return session;
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
        "page.click",
        "page.click_xy",
        "page.type",
        "page.fill",
        "page.press",
        "page.wait",
        "page.screenshot",
        "page.back",
        "page.forward",
        "page.reload",
        "page.tabs",
      ]);

      if (pageOps.has(op)) {
        let sessionResult = this._sessionOrError(sessionId);
        if (sessionResult && "ok" in sessionResult && sessionResult.ok === false) {
          if (op === "page.navigate") {
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

        if (op === "page.navigate") {
          const url = String(args.url ?? "").trim();
          if (!url) return invokeError("url is required");
          const waitUntil = /** @type {'load' | 'domcontentloaded' | 'networkidle' | 'commit'} */ (
            String(args.waitUntil ?? "domcontentloaded")
          );
          const timeoutMs = Number(args.timeoutMs ?? 30_000);
          const response = await session.page.goto(url, { waitUntil, timeout: timeoutMs });
          session.refMap = {};
          return this._okWithPreview(session, op, {
            url: session.page.url(),
            title: await session.page.title(),
            status: response?.status() ?? null,
          });
        }

        if (op === "page.snapshot") {
          const nodes = await collectInteractiveNodes(session.page);
          /** @type {Record<string, { role: string; name: string | null; nth: number }>} */
          const refMap = {};
          /** @type {Record<string, number>} */
          const roleCounts = {};
          for (const node of nodes) {
            const key = `${node.role}\0${node.name ?? ""}`;
            const nth = roleCounts[key] ?? 0;
            roleCounts[key] = nth + 1;
            const ref = `e${Object.keys(refMap).length + 1}`;
            refMap[ref] = { role: node.role, name: node.name, nth };
          }
          session.refMap = refMap;
          const snapshot = formatSnapshotYaml(
            session.page.url(),
            await session.page.title(),
            refMap,
          );
          return this._okWithPreview(session, op, {
            url: session.page.url(),
            title: await session.page.title(),
            snapshot,
            nodeCount: Object.keys(refMap).length,
          });
        }

        if (op === "page.click") {
          const ref = String(args.ref ?? "").trim();
          if (!ref) return invokeError("ref is required (from last snapshot)");
          const target = session.refMap[ref];
          if (!target) return invokeError(`Unknown ref '${ref}'; call page.snapshot first`);
          const locator = resolveLocator(session.page, target);
          await locator.click({ timeout: Number(args.timeoutMs ?? 10_000) });
          return this._okWithPreview(session, op, {
            ref,
            clicked: true,
            url: session.page.url(),
          });
        }

        if (op === "page.click_xy") {
          const x = Number(args.x);
          const y = Number(args.y);
          if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0) {
            return invokeError("x and y must be non-negative");
          }
          await session.page.mouse.click(x, y);
          session.refMap = {};
          return this._okWithPreview(session, op, {
            clicked: true,
            x,
            y,
            url: session.page.url(),
          });
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
          return this._okWithPreview(session, op, { ref, typedLength: text.length });
        }

        if (op === "page.fill") {
          const ref = String(args.ref ?? "").trim();
          const value = String(args.value ?? args.text ?? "");
          if (!ref) return invokeError("ref is required");
          const target = session.refMap[ref];
          if (!target) return invokeError(`Unknown ref '${ref}'; call page.snapshot first`);
          const locator = resolveLocator(session.page, target);
          await locator.fill(value);
          return this._okWithPreview(session, op, { ref, filled: true });
        }

        if (op === "page.press") {
          const key = String(args.key ?? "").trim();
          if (!key) return invokeError("key is required (e.g. Enter, Tab)");
          const ref = String(args.ref ?? "").trim();
          if (ref) {
            const target = session.refMap[ref];
            if (!target) return invokeError(`Unknown ref '${ref}'; call page.snapshot first`);
            const locator = resolveLocator(session.page, target);
            await locator.press(key);
          } else {
            await session.page.keyboard.press(key);
          }
          return this._okWithPreview(session, op, { key, ref: ref || null });
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

        if (op === "page.screenshot") {
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
          return this._okWithPreview(session, op, {
            url: session.page.url(),
            title: await session.page.title(),
          });
        }

        if (op === "page.forward") {
          await session.page.goForward();
          session.refMap = {};
          return this._okWithPreview(session, op, {
            url: session.page.url(),
            title: await session.page.title(),
          });
        }

        if (op === "page.reload") {
          const waitUntil = /** @type {'load' | 'domcontentloaded' | 'networkidle' | 'commit'} */ (
            String(args.waitUntil ?? "domcontentloaded")
          );
          await session.page.reload({ waitUntil });
          session.refMap = {};
          return this._okWithPreview(session, op, {
            url: session.page.url(),
            title: await session.page.title(),
          });
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
      }

      return invokeError(`Unknown op: ${op}`, { code: "unknown_op" });
    } catch (err) {
      console.error(`[browser-runtime] invoke failed op=${op} session=${sessionId}`, err);
      return invokeError(err instanceof Error ? err.message : String(err));
    }
  }
}
