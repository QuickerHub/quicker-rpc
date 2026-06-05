/**
 * Convert Quicker KC Help/Doc HTML (Yuque/ne-editor) to filtered Markdown.
 */

/** @param {string} html */
export function decodeEntities(html) {
  return (html ?? "")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

/** @param {string} html */
function inlineText(html) {
  let s = html ?? "";
  s = s.replace(/<br\s*\/?>/gi, "\n");
  s = s.replace(/<strong[^>]*>([\s\S]*?)<\/strong>/gi, "**$1**");
  s = s.replace(/<b[^>]*>([\s\S]*?)<\/b>/gi, "**$1**");
  s = s.replace(/<em[^>]*>([\s\S]*?)<\/em>/gi, "*$1*");
  s = s.replace(/<i[^>]*>([\s\S]*?)<\/i>/gi, "*$1*");
  s = s.replace(
    /<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi,
    (_, href, text) => {
      const label = decodeEntities(inlineText(text).replace(/\s+/g, " ").trim());
      const url = decodeEntities(href.trim());
      return label ? `[${label}](${url})` : url;
    },
  );
  s = s.replace(/<code[^>]*>([\s\S]*?)<\/code>/gi, (_, c) => {
    const t = decodeEntities(c.replace(/<[^>]+>/g, "")).trim();
    return t ? `\`${t}\`` : "";
  });
  s = s.replace(/<span[^>]*>([\s\S]*?)<\/span>/gi, "$1");
  s = s.replace(/<[^>]+>/g, "");
  return decodeEntities(s).replace(/\s+\n/g, "\n").trim();
}

/** @param {string} html */
function convertList(html, ordered) {
  const re = ordered
    ? /<ol[^>]*>([\s\S]*?)<\/ol>/gi
    : /<ul[^>]*>([\s\S]*?)<\/ul>/gi;
  return html.replace(re, (_, inner) => {
    const items = [...inner.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)];
    const lines = items.map((m, i) => {
      const body = blockHtmlToMarkdown(m[1]).trim();
      const prefix = ordered ? `${i + 1}. ` : "- ";
      return prefix + body.replace(/\n/g, "\n  ");
    });
    return `\n${lines.join("\n")}\n`;
  });
}

/** @param {string} text */
function flattenCellLists(text) {
  /** @type {string[]} */
  const items = [];
  for (const line of text.split("\n")) {
    const bullet = line.match(/^\s*-\s+(.*)/);
    if (bullet) {
      const t = bullet[1].trim();
      if (t) items.push(t);
      continue;
    }
    const t = line.trim();
    if (t) items.push(t);
  }
  return items.filter(Boolean).join("; ");
}

/** @param {string} html */
function convertTables(html) {
  return html.replace(/<table[^>]*>([\s\S]*?)<\/table>/gi, (_, tableInner) => {
    const rows = [...tableInner.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)];
    /** @type {string[][]} */
    const cells = [];
    for (const row of rows) {
      const rowCells = [...row[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)];
      cells.push(
        rowCells.map((c) => {
          const cell = blockHtmlToMarkdown(c[1]).trim();
          return flattenCellLists(cell);
        }),
      );
    }
    if (cells.length === 0) return "";
    const width = Math.max(...cells.map((r) => r.length));
    const norm = cells.map((r) => {
      const copy = [...r];
      while (copy.length < width) copy.push("");
      return copy;
    });
    const esc = (s) => s.replace(/\|/g, "\\|");
    const lines = norm.map((r) => `| ${r.map(esc).join(" | ")} |`);
    const sep = `| ${Array(width).fill("---").join(" | ")} |`;
    return `\n${lines[0]}\n${sep}\n${lines.slice(1).join("\n")}\n`;
  });
}

/** @param {string} html */
function convertCodeBlocks(html) {
  let s = html;
  s = s.replace(
    /<pre[^>]*data-language="([^"]*)"[^>]*>\s*<code[^>]*>([\s\S]*?)<\/code>\s*<\/pre>/gi,
    (_, lang, code) => {
      let body = decodeEntities(code.replace(/<[^>]+>/g, "")).trimEnd();
      body = body.replace(/^\$\$\n?/, "");
      return `\n\`\`\`${lang || ""}\n${body}\n\`\`\`\n`;
    },
  );
  s = s.replace(
    /<pre[^>]*>\s*<code[^>]*>([\s\S]*?)<\/code>\s*<\/pre>/gi,
    (_, code) => {
      let body = decodeEntities(code.replace(/<[^>]+>/g, "")).trimEnd();
      body = body.replace(/^\$\$\n?/, "");
      return `\n\`\`\`\n${body}\n\`\`\`\n`;
    },
  );
  return s;
}

/** @param {string} html */
function convertHeadings(html) {
  let s = html;
  for (let level = 6; level >= 1; level--) {
    const re = new RegExp(`<h${level}[^>]*>([\\s\\S]*?)<\\/h${level}>`, "gi");
    s = s.replace(re, (_, inner) => {
      const title = inlineText(inner).replace(/\s+/g, " ").trim();
      return title ? `\n${"#".repeat(level)} ${title}\n` : "";
    });
  }
  return s;
}

/** @param {string} html */
function convertParagraphs(html) {
  return html.replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, (_, inner) => {
    const t = inlineText(inner);
    if (!t) return "\n";
    return `\n${t}\n`;
  });
}

/** @param {string} html */
function blockHtmlToMarkdown(html) {
  if (!html?.trim()) return "";
  let s = html;
  s = convertCodeBlocks(s);
  s = convertTables(s);
  for (let i = 0; i < 3; i++) {
    s = convertList(s, false);
    s = convertList(s, true);
  }
  s = convertHeadings(s);
  s = convertParagraphs(s);
  s = s.replace(/<br\s*\/?>/gi, "\n");
  s = s.replace(/<[^>]+>/g, "");
  s = decodeEntities(s);
  s = s.replace(/\n{3,}/g, "\n\n");
  return s.trim();
}

/** @param {string} html */
export function extractArticleHtml(html) {
  const articleMatch = html.match(/<h1 class="article-title">[\s\S]*$/i);
  if (!articleMatch) return null;

  let chunk = articleMatch[0];
  const stop = chunk.search(/<h5[^>]*>\s*反馈与讨论/i);
  if (stop >= 0) chunk = chunk.slice(0, stop);

  chunk = chunk.replace(/<div class="line-nav-tabs[\s\S]*?<\/div>/i, "");

  const updateHeading = chunk.search(
    /<h1[^>]*>\s*<span class="ne-text">更新说明<\/span>\s*<\/h1>/i,
  );
  if (updateHeading >= 0) chunk = chunk.slice(0, updateHeading);

  const overviewHeading = chunk.search(
    /<h1[^>]*>\s*<span class="ne-text">概述<\/span>\s*<\/h1>/i,
  );
  if (overviewHeading >= 0) chunk = chunk.slice(overviewHeading);

  return chunk;
}

/** @param {string} html */
export function kcHtmlToMarkdown(html) {
  const article = extractArticleHtml(html);
  if (!article) return null;

  let md = blockHtmlToMarkdown(article);
  md = filterMarkdown(md);
  md = promoteBoldSectionHeadings(md);
  md = condenseMarkdown(md);
  return md?.trim() || null;
}

/** @param {string} md */
export function filterMarkdown(md) {
  const lines = md.split("\n");
  /** @type {string[]} */
  const out = [];
  let skipBlock = false;
  let seenOverview = false;

  for (const raw of lines) {
    const line = raw.trimEnd();
    const trimmed = line.trim();

    if (/^#{1,6}\s+(反馈与讨论|更新说明|示例动作)\s*$/.test(trimmed)) {
      break;
    }
    if (/^因软件更新较快/.test(trimmed)) continue;
    if (/^(正文|相关动作)\s*$/.test(trimmed)) continue;
    if (/^\s*讨论\s*$/.test(trimmed)) continue;
    if (/^\d+$/.test(trimmed)) continue;
    if (/^\*\*\$\$\*\*$/.test(trimmed)) continue;
    if (/^已复制到剪贴板/.test(trimmed)) break;
    if (/^Copyright ©/.test(trimmed)) break;
    if (/^(使用问题|暂无讨论)\b/.test(trimmed)) {
      skipBlock = true;
      continue;
    }
    if (/^#{1,6}\s/.test(trimmed)) skipBlock = false;
    if (skipBlock) continue;
    if (/^#\s+概述\s*$/.test(trimmed)) seenOverview = true;
    if (/^#\s+/.test(trimmed) && !seenOverview && !/^#\s+概述/.test(trimmed)) {
      continue;
    }

    out.push(line);
  }

  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

/** Promote **输入参数** / **输出** style headings to ## for consistent section parsing. */
/** @param {string} md */
function promoteBoldSectionHeadings(md) {
  return md.replace(
    /^\*\*(输入参数|输出参数|输出|示例|说明|用法|注意)\*\*\s*$/gm,
    (_, title) => `## ${title}`,
  );
}

const KEEP_H1 =
  /^(概述|参数|输出|示例|说明|用法|注意|乱码|常规|支持的操作|Post|SSE|数据格式|.+说明)$/i;

const KEEP_H1_CONTAINS =
  /概述|参数|输出|Post|SSE|乱码|数据格式|格式说明|操作类型|常规|支持的操作/i;

/** @param {string} md */
export function condenseMarkdown(md) {
  const sections = splitMdSections(md);
  if (sections.length === 0) return md.slice(0, 6000);

  /** @type {string[]} */
  const picked = [];
  for (const sec of sections) {
    if (sec.level !== 1) continue;
    const title = sec.title.trim();
    if (/^更新说明$|^示例动作$|^反馈/.test(title)) break;
    const keep =
      KEEP_H1.test(title) ||
      KEEP_H1_CONTAINS.test(title) ||
      ["概述", "参数", "输出", "示例"].includes(title);
    if (!keep) continue;
    picked.push(renderMdSection(sec, 5000));
  }

  if (picked.length === 0) {
    const trimmed = md.trim();
    if (trimmed.length > 0) {
      return trimmed.length > 6000
        ? truncatePreservingFences(trimmed, 6000)
        : trimmed;
    }
    const first = sections.find((s) => s.level === 1 && s.body.trim());
    return first ? renderMdSection(first, 6000) : md.slice(0, 6000);
  }

  return picked.join("\n\n").trim();
}

/** @param {{ title: string, level: number, body: string, children?: unknown[] }} sec @param {number} maxChars */
function renderMdSection(sec, maxChars) {
  let body = sec.body.trim();
  if (sec.children?.length) {
    const childMd = sec.children
      .map((c) => renderMdSection(/** @type {typeof sec} */ (c), maxChars))
      .filter(Boolean)
      .join("\n\n");
    body = [body, childMd].filter(Boolean).join("\n\n");
  }
  const head = `${"#".repeat(sec.level)} ${sec.title}`;
  if (!body) return head;
  if (body.length > maxChars) {
    body = truncatePreservingFences(body, maxChars);
  }
  return `${head}\n\n${body}`.trim();
}

/** @param {string} text @param {number} max */
function truncatePreservingFences(text, max) {
  if (text.length <= max) return text;
  const idx = text.lastIndexOf("\n```", max);
  if (idx > max * 0.5) return `${text.slice(0, idx).trim()}\n\n…`;
  return `${text.slice(0, max).trim()}…`;
}

/** @param {string} md */
function splitMdSections(md) {
  /** @type {{ level: number, title: string, lines: string[] }[]} */
  const flat = [];
  /** @type {{ level: number, title: string, lines: string[] } | null} */
  let cur = null;

  for (const line of md.split("\n")) {
    const m = line.match(/^(#{1,6})\s+(.+)/);
    if (m) {
      if (cur) flat.push(cur);
      cur = { level: m[1].length, title: m[2].trim(), lines: [] };
      continue;
    }
    if (cur) cur.lines.push(line);
  }
  if (cur) flat.push(cur);

  /** @type {{ title: string, level: number, body: string, children: unknown[] }[]} */
  const roots = [];
  /** @type {{ title: string, level: number, body: string, children: unknown[] }[]} */
  const stack = [];

  for (const sec of flat) {
    const node = {
      title: sec.title,
      level: sec.level,
      body: sec.lines.join("\n").trim(),
      children: [],
    };
    while (stack.length > 0 && stack[stack.length - 1].level >= sec.level) {
      stack.pop();
    }
    if (stack.length === 0) roots.push(node);
    else stack[stack.length - 1].children.push(node);
    stack.push(node);
  }

  return roots;
}
