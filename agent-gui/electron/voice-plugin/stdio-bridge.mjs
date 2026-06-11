import { EventEmitter } from "node:events";

const FRAME_JSON = 0;
const FRAME_PCM = 1;
const READY_WAIT_MS = 45_000;
const SESSION_WAIT_MS = 15_000;

/**
 * @param {import('node:stream').Writable} stream
 * @param {Buffer} buf
 */
async function writeExact(stream, buf) {
  await new Promise((resolve, reject) => {
    stream.write(buf, (err) => (err ? reject(err) : resolve()));
  });
}

/**
 * @param {import('node:stream').Readable} stream
 * @param {number} size
 */
async function readExact(stream, size) {
  const chunks = [];
  let remaining = size;
  while (remaining > 0) {
    const chunk = stream.read(remaining);
    if (chunk) {
      chunks.push(chunk);
      remaining -= chunk.length;
      continue;
    }
    const next = await new Promise((resolve, reject) => {
      const onReadable = () => {
        cleanup();
        resolve(stream.read(remaining));
      };
      const onEnd = () => {
        cleanup();
        resolve(null);
      };
      const onError = (err) => {
        cleanup();
        reject(err);
      };
      const cleanup = () => {
        stream.off("readable", onReadable);
        stream.off("end", onEnd);
        stream.off("error", onError);
      };
      stream.on("readable", onReadable);
      stream.on("end", onEnd);
      stream.on("error", onError);
    });
    if (!next) {
      throw new Error("voice runtime stdout closed");
    }
    chunks.push(next);
    remaining -= next.length;
  }
  return Buffer.concat(chunks);
}

/**
 * @param {{
 *   stdin: import('node:stream').Writable,
 *   stdout: import('node:stream').Readable,
 *   onPartial?: (sessionId: string, text: string) => void,
 * }} options
 */
export function attachStdioBridge(options) {
  const { stdin, stdout, onPartial } = options;
  stdout.setEncoding?.(null);

  /** @type {{ ready: boolean, modelLoaded: boolean } | null} */
  let readyInfo = null;
  const readyEmitter = new EventEmitter();

  /** @type {Map<string, { started?: import('node:events').EventEmitter, final?: import('node:events').EventEmitter }>} */
  const sessions = new Map();

  const writeFrame = async (kind, payload) => {
    const len = payload.length;
    if (len > 0xffffffff) throw new Error("voice frame too large");
    const header = Buffer.alloc(5);
    header[0] = kind;
    header.writeUInt32BE(len, 1);
    await writeExact(stdin, Buffer.concat([header, payload]));
  };

  const writeJson = async (value) => {
    await writeFrame(FRAME_JSON, Buffer.from(JSON.stringify(value), "utf8"));
  };

  const writePcm = async (pcm) => {
    await writeFrame(FRAME_PCM, pcm);
  };

  const waitForEvent = (emitter, event, timeoutMs) =>
    new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        emitter.off(event, onValue);
        emitter.off("error", onError);
        reject(new Error("voice ipc timeout"));
      }, timeoutMs);
      const onValue = (value) => {
        clearTimeout(timer);
        emitter.off("error", onError);
        resolve(value);
      };
      const onError = (err) => {
        clearTimeout(timer);
        emitter.off(event, onValue);
        reject(err);
      };
      emitter.once(event, onValue);
      emitter.once("error", onError);
    });

  const dispatchInbound = (value) => {
    const msgType = value?.type ?? "";
    switch (msgType) {
      case "runtime.ready": {
        readyInfo = {
          ready: value.ready === true,
          modelLoaded: value.modelLoaded === true,
        };
        readyEmitter.emit("ready", readyInfo);
        break;
      }
      case "session.started": {
        const sessionId = value.sessionId;
        if (!sessionId) break;
        const entry = sessions.get(sessionId);
        entry?.started?.emit("ok");
        break;
      }
      case "partial": {
        const sessionId = value.sessionId;
        const text = value.text;
        if (sessionId && typeof text === "string") {
          onPartial?.(sessionId, text);
        }
        break;
      }
      case "final": {
        const sessionId = value.sessionId;
        if (!sessionId) break;
        const entry = sessions.get(sessionId);
        entry?.final?.emit("ok", {
          text: typeof value.text === "string" ? value.text : "",
          confidence: typeof value.confidence === "number" ? value.confidence : null,
        });
        break;
      }
      case "error": {
        const sessionId = value.sessionId;
        const message =
          value.message ?? value.code ?? "voice runtime error";
        if (!sessionId) break;
        const entry = sessions.get(sessionId);
        entry?.started?.emit("error", new Error(message));
        entry?.final?.emit("error", new Error(message));
        sessions.delete(sessionId);
        break;
      }
      case "session.ended": {
        if (value.sessionId) sessions.delete(value.sessionId);
        break;
      }
      default:
        break;
    }
  };

  const readerLoop = async () => {
    try {
      while (true) {
        const header = await readExact(stdout, 5);
        const kind = header[0];
        const length = header.readUInt32BE(1);
        const payload = await readExact(stdout, length);
        if (kind !== FRAME_JSON) continue;
        let value;
        try {
          value = JSON.parse(payload.toString("utf8"));
        } catch {
          continue;
        }
        dispatchInbound(value);
      }
    } catch {
      readyInfo = null;
      readyEmitter.emit("closed");
    }
  };

  void readerLoop();

  return {
    waitReady(maxMs = READY_WAIT_MS) {
      if (readyInfo?.ready) return Promise.resolve();
      if (readyInfo && readyInfo.modelLoaded) {
        return Promise.reject(new Error("模型已加载，服务初始化中…"));
      }
      if (readyInfo) {
        return Promise.reject(new Error("Runtime 已响应，等待就绪…"));
      }
      return waitForEvent(readyEmitter, "ready", maxMs).then((info) => {
        if (info?.ready) return;
        if (info?.modelLoaded) {
          throw new Error("模型已加载，服务初始化中…");
        }
        throw new Error("Runtime 已响应，等待就绪…");
      });
    },
    isReady() {
      return readyInfo?.ready === true;
    },
    modelLoaded() {
      return readyInfo?.modelLoaded === true;
    },
    async sessionStart(sessionId, language, streaming) {
      const started = new EventEmitter();
      sessions.set(sessionId, { started, final: undefined });
      await writeJson({
        type: "session.start",
        sessionId,
        language,
        streaming,
        sampleRate: 16_000,
        channels: 1,
        encoding: "pcm_s16le",
      });
      await waitForEvent(started, "ok", SESSION_WAIT_MS);
    },
    async sessionSendAudio(pcm) {
      if (!pcm?.length) return;
      await writePcm(Buffer.from(pcm));
    },
    async sessionEnd(sessionId) {
      const final = new EventEmitter();
      const existing = sessions.get(sessionId) ?? {};
      existing.final = final;
      sessions.set(sessionId, existing);
      await writeJson({ type: "session.end", sessionId });
      return waitForEvent(final, "ok", SESSION_WAIT_MS);
    },
    async sessionCancel(sessionId) {
      try {
        await writeJson({
          type: "session.cancel",
          sessionId,
          reason: "user_cancelled",
        });
      } finally {
        sessions.delete(sessionId);
      }
    },
    buildHealthDto(protocolVersion = 1) {
      return {
        ok: readyInfo?.ready === true,
        protocolVersion,
        runtimeVersion: null,
        modelId: readyInfo?.modelLoaded ? "loaded" : null,
        modelLoaded: readyInfo?.modelLoaded === true,
        ready: readyInfo?.ready === true,
        executionProvider: null,
      };
    },
  };
}
