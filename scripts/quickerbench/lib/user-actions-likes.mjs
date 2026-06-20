/**
 * Parse getquicker User/Actions HTML and aggregate likes (QuickerBench oracle).
 * Used by fixture refresh, live probe, and mock oracle sync — not by CI agent runs.
 */

import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

/** @typedef {{ name: string; code: string; likes: number; users: number }} UserActionRow */

/**
 * @param {string} html
 * @returns {UserActionRow[]}
 */
export function parseUserActionsPage(html) {
  const items = [];
  const rowRe = /<tr>[\s\S]*?<\/tr>/g;
  let m;
  while ((m = rowRe.exec(html)) !== null) {
    const row = m[0];
    if (!row.includes("Sharedaction") || row.includes("<th")) continue;
    const linkM = row.match(
      /<a[^>]*href="[^"]*Sharedaction[^"]*"[^>]*>([\s\S]*?)<\/a>/i,
    );
    if (!linkM) continue;
    const name = linkM[1].replace(/<[^>]+>/g, "").trim();
    const codeM = row.match(/Sharedaction\?code=([0-9a-f-]+)/i);
    const cells = [
      ...row.matchAll(
        /<td class="align-middle text-center\s+d-none d-md-table-cell small">([\s\S]*?)<\/td>/g,
      ),
    ];
    const likesRaw = cells[0]?.[1]?.replace(/<[^>]+>/g, "").trim() ?? "";
    const usersRaw = cells[1]?.[1]?.replace(/<[^>]+>/g, "").trim() ?? "";
    const likes = /^\d+$/.test(likesRaw) ? Number.parseInt(likesRaw, 10) : 0;
    const users = /^\d+$/.test(usersRaw) ? Number.parseInt(usersRaw, 10) : 0;
    items.push({ name, code: codeM?.[1] ?? "", likes, users });
  }
  return items;
}

/**
 * @param {string} html
 */
export function detectUserActionsPagination(html) {
  let max = 1;
  for (const m of html.matchAll(/[?&]p=(\d+)/g)) {
    const p = Number.parseInt(m[1], 10);
    if (p > max) max = p;
  }
  const totalM = html.match(/共\s*(\d+)\s*个动作/);
  return {
    pages: max,
    totalActions: totalM ? Number.parseInt(totalM[1], 10) : null,
  };
}

/**
 * @param {UserActionRow[]} rows
 */
export function aggregateUserActionLikes(rows) {
  const totalLikes = rows.reduce((sum, row) => sum + row.likes, 0);
  return {
    actionCount: rows.length,
    totalLikes,
    top5: [...rows].sort((a, b) => b.likes - a.likes).slice(0, 5),
  };
}

/**
 * @param {string[]} htmlPages
 */
export function computeFromHtmlPages(htmlPages) {
  const rows = htmlPages.flatMap((html) => parseUserActionsPage(html));
  const first = htmlPages[0] ?? "";
  const pagination = detectUserActionsPagination(first);
  const agg = aggregateUserActionLikes(rows);
  return {
    pages: htmlPages.length,
    totalActions: pagination.totalActions,
    parsedCount: rows.length,
    totalLikes: agg.totalLikes,
    actionCount: agg.actionCount,
    top5: agg.top5,
    rows,
    oracle: {
      totalLikes: agg.totalLikes,
      actionCount: agg.actionCount,
    },
  };
}

/**
 * @param {string} fixtureDir absolute or relative path to 113342-cea/
 */
export async function computeFromFixtureDir(fixtureDir) {
  let pageFiles;
  try {
    const manifestRaw = await readFile(join(fixtureDir, "manifest.json"), "utf8");
    const manifest = JSON.parse(manifestRaw);
    pageFiles = manifest.pageFiles;
  } catch {
    const entries = await readdir(fixtureDir);
    pageFiles = entries
      .filter((name) => /^page-\d+\.html$/.test(name))
      .sort((a, b) => {
        const pa = Number.parseInt(a.match(/\d+/)?.[0] ?? "0", 10);
        const pb = Number.parseInt(b.match(/\d+/)?.[0] ?? "0", 10);
        return pa - pb;
      });
  }

  const htmlPages = await Promise.all(
    pageFiles.map((file) => readFile(join(fixtureDir, file), "utf8")),
  );
  const result = computeFromHtmlPages(htmlPages);
  return {
    source: "fixture",
    fixtureDir,
    pageFiles,
    ...result,
    oracle: {
      totalLikes: result.totalLikes,
      actionCount: result.actionCount,
    },
  };
}

/**
 * @param {string} url
 */
export async function computeFromLiveUrl(url) {
  const baseUrl = url.split("?")[0];
  const headers = {
    "User-Agent": "quickerbench-oracle/1.0",
    Accept: "text/html",
  };

  async function fetchPage(pageUrl) {
    const res = await fetch(pageUrl, { headers });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${pageUrl}`);
    return res.text();
  }

  const html1 = await fetchPage(baseUrl);
  const { pages } = detectUserActionsPagination(html1);
  const htmlPages = [html1];
  for (let p = 2; p <= pages; p += 1) {
    htmlPages.push(await fetchPage(`${baseUrl}?p=${p}`));
  }

  const result = computeFromHtmlPages(htmlPages);
  return {
    source: "live",
    url: baseUrl,
    ...result,
    oracle: {
      totalLikes: result.totalLikes,
      actionCount: result.actionCount,
    },
  };
}
