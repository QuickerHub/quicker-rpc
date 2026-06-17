#!/usr/bin/env node
/** DEV probe: parse getquicker User/Actions page likes with pagination */

const BASE = process.argv[2] ?? "https://getquicker.net/User/Actions/113342-Cea";

function parsePage(html) {
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
    const likes = cells[0] ? parseInt(cells[0][1].trim(), 10) || 0 : 0;
    const users = cells[1] ? parseInt(cells[1][1].trim(), 10) || 0 : 0;
    items.push({ name, code: codeM?.[1] ?? "", likes, users });
  }
  return items;
}

function maxPage(html) {
  let max = 1;
  for (const m of html.matchAll(/[?&]p=(\d+)/g)) {
    const p = parseInt(m[1], 10);
    if (p > max) max = p;
  }
  const totalM = html.match(/共\s*(\d+)\s*个动作/);
  return { maxPage: max, totalActions: totalM ? parseInt(totalM[1], 10) : null };
}

async function fetchPage(url) {
  const res = await fetch(url, {
    headers: { "User-Agent": "quicker-rpc-test/1.0", Accept: "text/html" },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  return res.text();
}

async function main() {
  const baseUrl = BASE.split("?")[0];
  const html1 = await fetchPage(baseUrl);
  const { maxPage: pages, totalActions } = maxPage(html1);
  const all = [];
  for (let p = 1; p <= pages; p++) {
    const html = p === 1 ? html1 : await fetchPage(`${baseUrl}?p=${p}`);
    const items = parsePage(html);
    console.error(`page ${p}: ${items.length} actions`);
    all.push(...items);
  }
  const totalLikes = all.reduce((s, i) => s + i.likes, 0);
  const sorted = [...all].sort((a, b) => b.likes - a.likes);
  console.log(
    JSON.stringify(
      {
        url: baseUrl,
        pages,
        totalActions,
        parsedCount: all.length,
        totalLikes,
        top5: sorted.slice(0, 5),
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
