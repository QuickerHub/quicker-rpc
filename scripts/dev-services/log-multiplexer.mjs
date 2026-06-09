/** @param {Date} [date] */
export function formatLogTime(date = new Date()) {
  return date.toISOString().slice(11, 19);
}

/**
 * Pipe child stdout/stderr into the supervisor terminal with a tag prefix.
 * @param {import('node:child_process').ChildProcess} child
 * @param {string} tag
 */
export function attachTaggedLogs(child, tag) {
  /** @param {NodeJS.ReadableStream | null | undefined} stream @param {boolean} isErr */
  const wire = (stream, isErr) => {
    if (!stream) return;
    let buf = "";
    stream.on("data", (chunk) => {
      buf += chunk.toString();
      const parts = buf.split(/\r?\n/);
      buf = parts.pop() ?? "";
      for (const line of parts) {
        if (!line) continue;
        const msg = `[${formatLogTime()}][${tag}] ${line}`;
        if (isErr) console.error(msg);
        else console.log(msg);
      }
    });
    stream.on("end", () => {
      if (!buf.trim()) return;
      const msg = `[${formatLogTime()}][${tag}] ${buf}`;
      if (isErr) console.error(msg);
      else console.log(msg);
    });
  };
  wire(child.stdout, false);
  wire(child.stderr, true);
}

/**
 * @param {string} tag
 * @param {string} message
 */
export function supervisorLog(tag, message) {
  console.log(`[${formatLogTime()}][${tag}] ${message}`);
}
