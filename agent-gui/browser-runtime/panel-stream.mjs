/** @param {import('ws').WebSocket} ws @param {Record<string, unknown>} payload */
function sendJson(ws, payload) {
  if (ws.readyState !== ws.OPEN) return;
  ws.send(JSON.stringify(payload));
}

export class PanelStreamConnection {
  /** @param {import('ws').WebSocket} ws @param {import('./session-manager.mjs').SessionManager} manager */
  constructor(ws, manager) {
    this._ws = ws;
    this._manager = manager;
    this._sessionId = "default";
    /** @type {import('playwright').CDPSession | null} */
    this._cdp = null;
    this._screencastStarted = false;
    this._closed = false;
    /** @type {ReturnType<typeof setInterval> | null} */
    this._stateTimer = null;
  }

  async run() {
    this._ws.on("message", (raw) => {
      void this._handleText(String(raw));
    });
    this._ws.on("close", () => {
      void this._cleanup();
    });
    this._ws.on("error", () => {
      void this._cleanup();
    });
  }

  /** @param {string} raw */
  async _handleText(raw) {
    let message;
    try {
      message = JSON.parse(raw);
    } catch {
      sendJson(this._ws, { type: "error", message: "Invalid JSON" });
      return;
    }
    if (!message || typeof message !== "object") {
      sendJson(this._ws, { type: "error", message: "Message must be an object" });
      return;
    }

    const msgType = String(message.type ?? "").trim();
    if (msgType === "subscribe") {
      this._sessionId = String(message.sessionId ?? "default").trim() || "default";
      await this._manager.ensureSession(this._sessionId);
      await this._startScreencast();
      await this._pushState();
      if (!this._stateTimer) {
        this._stateTimer = setInterval(() => {
          void this._pushState();
        }, 1500);
      }
      sendJson(this._ws, { type: "ready", sessionId: this._sessionId });
      return;
    }

    if (msgType === "viewport") {
      const width = Number(message.width ?? 0);
      const height = Number(message.height ?? 0);
      if (width < 120 || height < 120) return;
      const session = await this._manager.ensureSession(this._sessionId);
      await session.page.setViewportSize({ width, height });
      return;
    }

    const session = await this._manager.ensureSession(this._sessionId);
    const page = session.page;

    if (msgType === "click") {
      const x = Number(message.x ?? 0);
      const y = Number(message.y ?? 0);
      const button = String(message.button ?? "left");
      await page.mouse.click(x, y, { button: /** @type {'left' | 'right' | 'middle'} */ (button) });
      session.refMap = {};
      await this._pushState();
      return;
    }

    if (msgType === "wheel") {
      await page.mouse.wheel(Number(message.deltaX ?? 0), Number(message.deltaY ?? 0));
      return;
    }

    if (msgType === "keydown") {
      const key = String(message.key ?? "").trim();
      if (!key) return;
      await page.keyboard.press(key);
      await this._pushState();
      return;
    }

    if (msgType === "type") {
      const text = String(message.text ?? "");
      if (!text) return;
      await page.keyboard.type(text);
      await this._pushState();
      return;
    }

    sendJson(this._ws, { type: "error", message: `Unknown message type: ${msgType}` });
  }

  async _startScreencast() {
    if (this._screencastStarted) return;
    const session = await this._manager.ensureSession(this._sessionId);
    this._cdp = await session.context.newCDPSession(session.page);
    this._cdp.on("Page.screencastFrame", (params) => {
      void this._onScreencastFrame(params);
    });
    await this._cdp.send("Page.startScreencast", {
      format: "jpeg",
      quality: 72,
      everyNthFrame: 1,
    });
    this._screencastStarted = true;
  }

  /** @param {{ data?: string; sessionId?: string }} params */
  async _onScreencastFrame(params) {
    if (this._closed || !this._cdp) return;
    const data = params.data;
    if (!data) return;
    sendJson(this._ws, {
      type: "frame",
      sessionId: this._sessionId,
      mimeType: "image/jpeg",
      data,
    });
    if (params.sessionId) {
      try {
        await this._cdp.send("Page.screencastFrameAck", { sessionId: params.sessionId });
      } catch {
        // ignore
      }
    }
  }

  async _pushState() {
    if (this._closed) return;
    const session = await this._manager.ensureSession(this._sessionId);
    const viewport = session.page.viewportSize() ?? { width: 1280, height: 800 };
    sendJson(this._ws, {
      type: "state",
      sessionId: this._sessionId,
      url: session.page.url(),
      title: await session.page.title(),
      viewportWidth: viewport.width,
      viewportHeight: viewport.height,
    });
  }

  async _cleanup() {
    this._closed = true;
    if (this._stateTimer) {
      clearInterval(this._stateTimer);
      this._stateTimer = null;
    }
    if (this._cdp) {
      try {
        if (this._screencastStarted) await this._cdp.send("Page.stopScreencast");
        await this._cdp.detach();
      } catch {
        // ignore
      }
    }
    this._cdp = null;
    this._screencastStarted = false;
  }
}

/** @param {import('ws').WebSocket} ws @param {import('./session-manager.mjs').SessionManager} manager */
export function attachPanelStream(ws, manager) {
  const connection = new PanelStreamConnection(ws, manager);
  void connection.run();
}
