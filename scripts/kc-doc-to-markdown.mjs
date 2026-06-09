/**
 * Convert Quicker KC Help/Doc HTML (Yuque/ne-editor) to Markdown.
 * Full-fidelity mode: keep article body for search retrieval; strip only page chrome.
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
  s = s.replace(/<img[^>]*alt="([^"]*)"[^>]*>/gi, (_, alt) => {
    const label = decodeEntities(alt).trim();
    return label ? `[image: ${label}]` : "[image]";
  });
  s = s.replace(/<img[^>]*>/gi, "[image]");
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

/** Extract the Yuque article body from a KC Help page (HTML). */
/** @param {string} html */
export function extractArticleHtml(html) {
  const lakeMatch = html.match(
    /<div class="lake-content"[^>]*>([\s\S]*?)<\/div>\s*<\/div>\s*<section/i,
  );
  if (lakeMatch) {
    return lakeMatch[1];
  }

  const articleMatch = html.match(
    /<div class="article-content[^"]*">([\s\S]*?)<\/div>\s*<\/div>\s*<section/i,
  );
  if (articleMatch) {
    let chunk = articleMatch[1];
    chunk = chunk.replace(
      /<div class="p-2 text-secondary bg-light[\s\S]*?<\/div>/i,
      "",
    );
    const lakeInner = chunk.match(/<div class="lake-content"[^>]*>([\s\S]*)$/i);
    return lakeInner ? lakeInner[1] : chunk;
  }

  const legacyMatch = html.match(/<h1 class="article-title">[\s\S]*$/i);
  if (!legacyMatch) return null;

  let chunk = legacyMatch[0];
  const stop = chunk.search(/<h[1-6][^>]*>[^<]*反馈与讨论/i);
  if (stop >= 0) chunk = chunk.slice(0, stop);
  chunk = chunk.replace(/<div class="line-nav-tabs[\s\S]*?<\/div>/gi, "");
  chunk = chunk.replace(/<h1 class="article-title">[\s\S]*?<\/h1>/i, "");
  return chunk;
}

/** @param {string} html */
export function kcHtmlToMarkdown(html) {
  const article = extractArticleHtml(html);
  if (!article) return null;

  let md = blockHtmlToMarkdown(article);
  md = stripPageChrome(md);
  md = promoteBoldSectionHeadings(md);
  return md?.trim() || null;
}

/** Remove footer / discussion chrome only; keep full article sections. */
/** @param {string} md */
export function stripPageChrome(md) {
  const lines = md.split("\n");
  /** @type {string[]} */
  const out = [];
  let skipBlock = false;

  for (const raw of lines) {
    const line = raw.trimEnd();
    const trimmed = line.trim();

    if (/^#{1,6}\s+(反馈与讨论)\s*$/.test(trimmed)) break;
    if (/^已复制到剪贴板/.test(trimmed)) break;
    if (/^Copyright ©/.test(trimmed)) break;

    if (/^因软件更新较快/.test(trimmed)) continue;
    if (/^\d+$/.test(trimmed)) continue;
    if (/^\*\*\$\$\*\*$/.test(trimmed)) continue;

    if (/^(使用问题|暂无讨论)\b/.test(trimmed)) {
      skipBlock = true;
      continue;
    }
    if (/^#{1,6}\s/.test(trimmed)) skipBlock = false;
    if (skipBlock) continue;

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
