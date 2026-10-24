import { lstatSync, readFileSync, realpathSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const maxBytes = 1024 * 1024, maxTotalBytes = 8 * maxBytes;
const outside = (root, path) => { const value = relative(root, path); return value === ".." || value.startsWith(`..${sep}`) || isAbsolute(value); };
const fail = (file, message) => { throw new Error(`${file}: ${message}`); };
const label = (value) => value.replace(/\\([!"#$%&'()*+,\-./:;<=>?@[\]\\^_`{|}~])/g, "$1").trim().replace(/\s+/g, " ").toLowerCase();
function entities(value, file) {
  return value.replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, entity) => {
    if (entity[0] === "#") {
      const point = entity[1].toLowerCase() === "x" ? parseInt(entity.slice(2), 16) : Number(entity.slice(1));
      if (!Number.isInteger(point) || point < 1 || point > 0x10ffff || point >= 0xd800 && point <= 0xdfff) fail(file, "Invalid HTML character reference");
      return String.fromCodePoint(point);
    }
    return { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" }[entity.toLowerCase()];
  }).replace(/&[a-z][a-z\d]+;/gi, () => fail(file, "Unsupported named HTML entity"));
}

function withoutBlocks(text, file) {
  text = text.replace(/\r\n?/g, "\n");
  text = text.replace(/<!--[^]*?-->/g, (value) => value.replace(/[^\n]/g, " "));
  if (text.includes("<!--")) fail(file, "Unclosed HTML comment");
  let fence;
  const lines = text.split("\n").map((line) => {
    const marker = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
    if (fence) {
      if (marker && marker[1][0] === fence[0] && marker[1].length >= fence.length && !marker[2].trim()) fence = undefined;
      return "";
    }
    if (marker) { fence = marker[1]; return ""; }
    return line;
  });
  if (fence) fail(file, "Unclosed fenced code block");
  return lines.join("\n");
}
function withoutCode(text) {
  let result = "";
  for (let i = 0; i < text.length;) {
    if (text[i] !== "`") { result += text[i++]; continue; }
    let end = i; while (text[end] === "`") end++;
    const marker = text.slice(i, end);
    let close = end;
    while ((close = text.indexOf(marker, close)) !== -1) {
      if (text[close - 1] !== "`" && text[close + marker.length] !== "`") break;
      close += marker.length;
    }
    if (close < 0) { result += marker; i = end; }
    else { result += text.slice(i, close + marker.length).replace(/[^\n]/g, " "); i = close + marker.length; }
  }
  return result;
}
function headingText(text, file) {
  if (/\{#|\[\^|\[\[/.test(text)) fail(file, "Unsupported heading extension");
  text = text.replace(/!?(\[[^\]]*\])\([^)]*\)/g, (_, name) => name.slice(1, -1)).replace(/<[^>]*>/g, "");
  text = entities(text, file).replace(/\\([!"#$%&'()*+,\-./:;<=>?@[\]\\^_`{|}~])/g, "$1");
  return text.replace(/`+/g, "").replace(/(\*{1,3}|~~)(.*?)\1/g, "$2")
    .replace(/(^|\s)_{1,3}([^_]+)_{1,3}(?=\s|$)/g, "$1$2");
}
function anchors(text, file) {
  const body = withoutBlocks(text, file), found = new Set(), headingIds = new Set();
  for (const tag of withoutCode(body).matchAll(/<([a-z][\w-]*)\b((?:"[^"]*"|'[^']*'|[^'">])*)>/gi)) {
    for (const attribute of tag[2].matchAll(/([a-z][\w:-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi)) {
      if (!["id", "name"].includes(attribute[1].toLowerCase())) continue;
      if (attribute[1].toLowerCase() === "name" && tag[1].toLowerCase() !== "a") continue;
      if (attribute[4] !== undefined) fail(file, "Explicit anchors must use quoted attributes");
      const id = entities(attribute[2] ?? attribute[3], file);
      if (!id || found.has(id)) fail(file, `Empty or duplicate explicit anchor: ${id}`);
      found.add(id);
    }
  }
  const lines = body.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const atx = /^ {0,3}#{1,6}(?:\s+|$)(.*)$/.exec(lines[i]);
    let title = atx?.[1].replace(/\s+#+\s*$/, "");
    if (title === undefined && i + 1 < lines.length && lines[i].trim() && /^ {0,3}(?:=+|-+)\s*$/.test(lines[i + 1])) {
      if (/^(?: {4}|\t| {0,3}(?:>|[-*+]\s|\d+[.)]\s))/.test(lines[i])) fail(file, "Unsupported setext heading context");
      title = lines[i++].trim();
    }
    if (title === undefined) continue;
    const base = headingText(title, file).trim().toLowerCase().replace(/[\p{P}\p{S}]/gu, (character) => /[-_]/.test(character) ? character : "").replace(/\s/g, "-");
    let id = base, suffix = 0;
    while (headingIds.has(id)) id = `${base}-${++suffix}`;
    headingIds.add(id); found.add(id);
  }
  return found;
}

function destination(text, offset, inline, file) {
  let i = offset;
  while (/\s/.test(text[i] ?? "") && i < text.length) i++;
  let value = "";
  if (text[i] === "<") {
    i++;
    while (i < text.length && text[i] !== ">") {
      if (text[i] === "\n" || text[i] === "<") fail(file, "Unsupported angle link destination");
      if (text[i] === "\\" && i + 1 < text.length) value += text[i++] + text[i++];
      else value += text[i++];
    }
    if (text[i++] !== ">") fail(file, "Unclosed angle link destination");
  } else {
    let depth = 0;
    while (i < text.length && !/\s/.test(text[i])) {
      const character = text[i];
      if (character === "\\" && i + 1 < text.length) { value += text[i++] + text[i++]; continue; }
      if (character === ")" && depth === 0) { if (inline) break; fail(file, "Unbalanced reference destination"); }
      if (character === "(") depth++;
      if (character === ")") depth--;
      value += text[i++];
    }
    if (depth) fail(file, "Unbalanced link destination parentheses");
  }
  const beforeSpace = i;
  if (!inline && !value) fail(file, "Empty or multiline reference destinations are unsupported");
  while (/\s/.test(text[i] ?? "") && i < text.length) i++;
  if (text[i] === '"' || text[i] === "'" || text[i] === "(") {
    if (i === beforeSpace) fail(file, "Link title must follow whitespace");
    const close = text[i] === "(" ? ")" : text[i]; i++;
    while (i < text.length && text[i] !== close) { if (text[i] === "\\") i++; i++; }
    if (text[i++] !== close) fail(file, "Unclosed link title");
    while (/\s/.test(text[i] ?? "") && i < text.length) i++;
  }
  if (inline ? text[i] !== ")" : i !== text.length) fail(file, "Unsupported or unclosed Markdown link");
  return { value: entities(value.replace(/\\([!"#$%&'()*+,\-./:;<=>?@[\]\\^_`{|}~])/g, "$1"), file), end: i + (inline ? 1 : 0) };
}
function links(text, file) {
  let body = withoutCode(withoutBlocks(text, file));
  if (/\[\[|\[\^|<\s*(?:a|img)\b[^>]*\b(?:href|src)\s*=/i.test(body)) fail(file, "Unsupported wiki, footnote or HTML link syntax");
  if (/^(?: {4}|\t).*\[/m.test(body)) fail(file, "Indented code or list link syntax is unsupported; use an explicit fenced block or unindented link");
  const references = new Map(), results = [];
  body = body.split("\n").map((line) => {
    const definition = /^ {0,3}\[((?:\\.|[^\]\\])+)\]:\s*(.*)$/.exec(line);
    if (!definition) return line;
    const name = label(definition[1]);
    if (!name || references.has(name)) fail(file, "Empty or duplicate Markdown reference definition");
    references.set(name, destination(definition[2], 0, false, file).value);
    return "";
  }).join("\n");
  for (let i = 0; i < body.length; i++) {
    if (body[i] === "\\") { i++; continue; }
    if (body[i] !== "[") continue;
    let close = i + 1, depth = 1;
    for (; close < body.length && depth; close++) {
      if (body[close] === "\\") { close++; continue; }
      if (body[close] === "[") depth++;
      if (body[close] === "]") depth--;
    }
    if (depth) continue;
    const textLabel = body.slice(i + 1, close - 1);
    if (body[close] === "(") { results.push(destination(body, close + 1, true, file).value); continue; }
    if (body[close] === "[") {
      const end = body.indexOf("]", close + 1);
      if (end < 0) fail(file, "Unclosed Markdown reference link");
      const name = label(body.slice(close + 1, end) || textLabel);
      if (!references.has(name)) fail(file, `Undefined Markdown reference: ${name}`);
      results.push(references.get(name));
      // The label's own shortcut is not another link.
      body = body.slice(0, close) + " ".repeat(end - close + 1) + body.slice(end + 1);
    } else if (references.has(label(textLabel))) results.push(references.get(label(textLabel)));
    else if (/^\s+\(/.test(body.slice(close))) fail(file, "Whitespace between link label and destination is unsupported");
  }
  return results;
}

/** Check local Markdown links without fetching URLs or executing document contents. */
export function checkDocumentationLinks(root, files) {
  const selected = resolve(root), rootInfo = lstatSync(selected);
  if (rootInfo.isSymbolicLink() || !rootInfo.isDirectory()) throw new Error("Documentation repository must be a physical directory");
  const repository = realpathSync(selected), cache = new Map(), anchorCache = new Map();
  let bytesRead = 0, linkCount = 0;
  function inspect(path) {
    if (outside(repository, path)) throw new Error(`Documentation path escapes repository: ${path}`);
    let current = repository;
    for (const part of relative(repository, path).split(sep).filter(Boolean)) {
      current = join(current, part);
      const info = lstatSync(current);
      if (info.isSymbolicLink()) throw new Error(`Documentation link uses a symlink: ${current}`);
    }
    const info = lstatSync(path);
    if (!info.isFile() && !info.isDirectory()) throw new Error(`Unsupported documentation target: ${path}`);
    return info;
  }
  function read(path) {
    if (cache.has(path)) return cache.get(path);
    const info = inspect(path);
    if (!info.isFile() || info.size > maxBytes || bytesRead + info.size > maxTotalBytes) throw new Error(`Documentation read limit or file type rejected: ${path}`);
    bytesRead += info.size;
    const text = readFileSync(path, "utf8"); cache.set(path, text); return text;
  }
  if (!Array.isArray(files) || !files.length) throw new Error("Documentation source files must be a nonempty list");
  for (const file of files) {
    if (typeof file !== "string" || isAbsolute(file) || file.includes("\\") || file.includes("\0")) throw new Error("Invalid documentation source path");
    const source = resolve(repository, file), text = read(source);
    for (const value of links(text, file)) {
      if (++linkCount > 5000) fail(file, "Too many Markdown links");
      if (/^(?:https?:\/\/|mailto:|\/\/)/i.test(value)) continue;
      if (/^[a-z][a-z\d+.-]*:/i.test(value)) fail(file, `Unsupported link protocol: ${value}`);
      const hash = value.indexOf("#"), rawPath = (hash < 0 ? value : value.slice(0, hash)).split("?")[0];
      if (/%(?:2f|5c)/i.test(rawPath)) fail(file, "Encoded path separator is unsupported");
      let path, fragment;
      try { path = decodeURIComponent(rawPath); fragment = hash < 0 ? "" : decodeURIComponent(value.slice(hash + 1)); }
      catch { fail(file, "Invalid percent encoding in Markdown link"); }
      if (path.includes("\\") || path.includes("\0") || fragment.includes("\0")) fail(file, "Invalid local link path");
      const target = path ? path.startsWith("/") ? resolve(repository, "." + path) : resolve(dirname(source), path) : source;
      try {
        const info = inspect(target);
        if (fragment) {
          if (!info.isFile() || !/\.md$/i.test(target)) fail(file, `Fragment target must be Markdown: ${value}`);
          if (!anchorCache.has(target)) anchorCache.set(target, anchors(read(target), target));
          if (!anchorCache.get(target).has(fragment)) fail(file, `Missing Markdown fragment: ${value}`);
        }
      } catch (error) { fail(file, `${value}: ${error.message}`); }
    }
  }
  return { ok: true, files: files.length, links: linkCount, bytesRead };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length !== 2) throw new Error("This CLI checks only the fixed documentation allowlist and accepts no path arguments");
    const { DOCUMENTATION_ONLY_PATHS } = await import("./classify-ci-changes.mjs");
    console.log(JSON.stringify(checkDocumentationLinks(resolve(dirname(fileURLToPath(import.meta.url)), "../.."), [...DOCUMENTATION_ONLY_PATHS])));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
