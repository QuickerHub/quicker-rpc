#!/usr/bin/env node
/**
 * Fetch Quicker KC Help docs → docs/authoring-references/step-modules/kc/{id}.md.
 * Hand-written refs live in docs/authoring-references/step-modules/authored/.
 *
 * Usage:
 *   node scripts/generate-step-module-refs.mjs           # skip unchanged
 *   node scripts/generate-step-module-refs.mjs --force   # rewrite all
 *   node scripts/generate-step-module-refs.mjs --limit 5 # smoke test
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { kcHtmlToMarkdown } from "./kc-doc-to-markdown.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const KEYWORDS_PATH = path.join(
  ROOT,
  "QuickerRpc.AgentModel/Catalog/step-runner-agent-keywords.json",
);
const SKIP_PATH = path.join(
  ROOT,
  "docs/action-authoring-src/step-module-skip.json",
);
const OUT_DIR = path.join(ROOT, "docs/authoring-references/step-modules");
const KC_OUT_DIR = path.join(OUT_DIR, "kc");
const AUTHORED_DIR = path.join(OUT_DIR, "authored");
const DOC_BASE = "https://getquicker.net/KC/Help/Doc";

/** @type {Record<string, string>} sys key -> KC Help slug */
const SLUG_OVERRIDES = {
  "sys:getCurrentTime": "gettime",
  "sys:MsgBox": "msgbox",
  "sys:GenTempFilePath": "gentempfilepath",
  "sys:SelectFileInExplorer": "selectfileinexplorer",
  "sys:WriteTextFile": "writetextfile",
  "sys:WriteImageFile": "writeimagefile",
  "sys:evalexpression": "expression",
  "sys:openUrl": "openurl",
  "sys:sendKeys": "sendkeys",
  "sys:keyInput": "keyinput",
  "sys:showText": "showtext",
  "sys:outputText": "outputtext",
  "sys:select": "userselect",
  "sys:getSelectedText": "get_selected_text",
  "sys:waitClipboardChange": "waitclipboardchange",
  "sys:fileSystemWatch": "filesystemwatch",
  "sys:stateStorage": "statestorage",
  "sys:dependencycheck": "dependencycheck",
  "sys:getWindowTitle": "getwindowtitle",
  "sys:getActiveProcessInfo": "getactiveprocessinfo",
  "sys:getFolderPath": "getfolderpath",
  "sys:getExplorerPath": "getexplorerpath",
  "sys:checkProcessExists": "checkprocessexists",
  "sys:activateProcessMainWindow": "activateprocessmainwindow",
  "sys:screenCapture": "screencapture",
  "sys:tempImgBed": "tempimgbed",
  "sys:manageList": "managelist",
  "sys:tableoperation": "tableoperation",
  "sys:dboperation": "dboperation",
  "sys:getSysInfo": "getsysinfo",
  "sys:getSelectedFiles": "getselectedfiles",
  "sys:playRecords": "playrecord",
  "sys:fileToClipboard": "filetoclipboard",
  "sys:checkPathExists": "checkpathexists",
  "sys:pathExtraction": "pathextraction",
  "sys:readFile": "readfile",
  "sys:runScript": "runscript",
  "sys:run": "run",
  "sys:runAction": "runaction",
  "sys:subprogram": "subprogram",
  "sys:group": "group",
  "sys:notify": "notify",
  "sys:userInput": "userinput",
  "sys:showWaitWin": "showwaitwin",
  "sys:reportProgress": "reportprogress",
  "sys:showmenu": "showmenu",
  "sys:form": "form",
  "sys:customwindow": "customwindow",
  "sys:custompanel": "custompanel",
  "sys:textSelectTools": "textselecttools",
  "sys:selectFile": "selectfile",
  "sys:selectFolder": "selectfolder",
  "sys:showImage": "showimage",
  "sys:waitKeyboard": "waitkeyboard",
  "sys:record": "record",
  "sys:delay": "delay",
  "sys:comment": "comment",
  "sys:inputScript": "inputscript",
  "sys:mouse": "mouse",
  "sys:htmlExtract": "htmlextract",
  "sys:jsonExtract": "jsonextract",
  "sys:regexExtract": "regexextract",
  "sys:strReplace": "strreplace",
  "sys:splitString": "splitstring",
  "sys:joinList": "joinlist",
  "sys:formatString": "formatstring",
  "sys:textCounter": "textcounter",
  "sys:strCompare": "strcompare",
  "sys:charInfo": "charinfo",
  "sys:translation": "translation",
  "sys:listOperations": "listoperations",
  "sys:dictOperations": "dictoperations",
  "sys:imgProcess": "imgprocess",
  "sys:imageinfo": "imageinfo",
  "sys:imgToBase64": "imgtobase64",
  "sys:createQrCode": "createqrcode",
  "sys:readQrCode": "readqrcode",
  "sys:color": "color",
  "sys:playSound": "playsound",
  "sys:recordSound": "recordsound",
  "sys:audioControl": "audiocontrol",
  "sys:quickeroperations": "quickeroperations",
  "sys:imeControl": "imecontrol",
  "sys:keyoperation": "keyoperation",
  "sys:windowOperations": "windowoperations",
  "sys:sendMessage": "sendmessage",
  "sys:restoreActiveWindow": "restoreactivewindow",
  "sys:uiautomation": "uiautomation",
  "sys:flauiautomation": "uiautomation",
  "sys:searchBmp": "searchbmp",
  "sys:download": "download",
  "sys:ai": "ai",
  "sys:tempcloudstore": "tempcloudstore",
  "sys:clouddata": "clouddata",
  "sys:mathocr": "mathocr",
  "sys:chromecontrol": "chromecontrol",
  "sys:getChromeUrl": "getchromeurl",
  "sys:excelreadwrite": "excelreadwrite",
  "sys:excelRange": "excelrange",
  "sys:excelObjects": "excelobjects",
  "sys:officehelper": "officehelper",
  "sys:assign": "assign",
  "sys:compute": "compute",
  "sys:numCompare": "numcompare",
  "sys:numberprocess": "numberprocess",
  "sys:randomNum": "randomnum",
  "sys:computeTime": "computetime",
  "sys:newGuid": "newguid",
  "sys:enc": "enc",
  "sys:if": "if",
  "sys:simpleIf": "if",
  "sys:each": "each",
  "sys:repeat": "repeat",
  "sys:break": "break",
  "sys:continue": "continue",
  "sys:stop": "stop",
  "sys:csscript": "csscript",
  "sys:jsscript": "jsscript",
  "sys:pythonscript": "pythonscript",
  "sys:shelloperation": "shelloperation",
  "sys:everythingsearch": "everythingsearch",
  "sys:winservice": "winservice",
  "sys:zip": "zip",
  "sys:httpserver": "httpserver",
  "sys:websocket": "websocket",
  "sys:cloud_oss": "cloud_oss",
  "sys:webview2": "webview2",
  "sys:smtp": "smtp",
  "sys:basic-ocr": "basic-ocr",
  "sys:adobesoftscontrol": "adobesoftscontrol",
  "sys:autocadcontrol": "autocadcontrol",
  "sys:rhinocontrol": "rhinocontrol",
  "sys:stringProcess": "stringprocess",
  "sys:fileOperation": "fileoperation",
  "sys:getClipboardText": "getclipboardtext",
  "sys:getClipboardImage": "getclipboardimage",
  "sys:getClipboardFiles": "getclipboardfiles",
  "sys:writeClipboard": "writeclipboard",
  "sys:http": "http",
};

/** @type {Record<string, string>} sys key -> category id */
const CATEGORY_BY_KEY = {
  "sys:if": "flow-control",
  "sys:simpleIf": "flow-control",
  "sys:each": "flow-control",
  "sys:repeat": "flow-control",
  "sys:break": "flow-control",
  "sys:continue": "flow-control",
  "sys:stop": "flow-control",
  "sys:group": "flow-control",
  "sys:runAction": "flow-control",
  "sys:subprogram": "flow-control",
  "sys:dependencycheck": "flow-control",
  "sys:comment": "basic",
  "sys:delay": "basic",
  "sys:waitClipboardChange": "basic",
  "sys:waitKeyboard": "basic",
  "sys:getSelectedText": "basic",
  "sys:sendKeys": "basic",
  "sys:keyInput": "basic",
  "sys:mouse": "basic",
  "sys:inputScript": "basic",
  "sys:record": "basic",
  "sys:playRecords": "basic",
  "sys:MsgBox": "basic",
  "sys:notify": "basic",
  "sys:run": "basic",
  "sys:openUrl": "basic",
  "sys:outputText": "basic",
  "sys:runScript": "basic",
};

/** Fill remaining categories via prefix groups */
const CATEGORY_GROUPS = [
  {
    id: "ui",
    title: "界面交互",
    keys: [
      "sys:showText",
      "sys:userInput",
      "sys:select",
      "sys:showmenu",
      "sys:form",
      "sys:showWaitWin",
      "sys:reportProgress",
      "sys:customwindow",
      "sys:custompanel",
      "sys:textSelectTools",
      "sys:selectFile",
      "sys:selectFolder",
      "sys:showImage",
      "sys:whiteboard",
    ],
  },
  {
    id: "clipboard",
    title: "剪贴板",
    keys: [
      "sys:getClipboardText",
      "sys:writeClipboard",
      "sys:getClipboardImage",
      "sys:getClipboardFiles",
      "sys:fileToClipboard",
    ],
  },
  {
    id: "file",
    title: "文件与目录",
    keys: [
      "sys:readFile",
      "sys:WriteTextFile",
      "sys:fileOperation",
      "sys:selectFile",
      "sys:selectFolder",
      "sys:zip",
      "sys:GenTempFilePath",
      "sys:getExplorerPath",
      "sys:getFolderPath",
      "sys:SelectFileInExplorer",
      "sys:everythingsearch",
      "sys:checkPathExists",
      "sys:pathExtraction",
      "sys:stateStorage",
      "sys:fileSystemWatch",
      "sys:shelloperation",
    ],
  },
  {
    id: "text",
    title: "文本处理",
    keys: [
      "sys:stringProcess",
      "sys:htmlExtract",
      "sys:jsonExtract",
      "sys:regexExtract",
      "sys:strReplace",
      "sys:splitString",
      "sys:joinList",
      "sys:formatString",
      "sys:textCounter",
      "sys:strCompare",
      "sys:charInfo",
      "sys:translation",
    ],
  },
  {
    id: "compute",
    title: "计算与数据结构",
    keys: [
      "sys:listOperations",
      "sys:manageList",
      "sys:dictOperations",
      "sys:tableoperation",
      "sys:dboperation",
      "sys:enc",
      "sys:numCompare",
      "sys:numberprocess",
      "sys:randomNum",
      "sys:newGuid",
      "sys:getCurrentTime",
      "sys:computeTime",
      "sys:color",
      "sys:assign",
      "sys:compute",
      "sys:evalexpression",
    ],
  },
  {
    id: "image",
    title: "图片",
    keys: [
      "sys:screenCapture",
      "sys:screenCapturePro",
      "sys:WriteImageFile",
      "sys:imgProcess",
      "sys:imageinfo",
      "sys:imgToBase64",
      "sys:createQrCode",
      "sys:readQrCode",
      "sys:searchBmp",
      "sys:basic-ocr",
      "sys:mathocr",
    ],
  },
  {
    id: "system",
    title: "系统与窗口",
    keys: [
      "sys:getWindowTitle",
      "sys:activateProcessMainWindow",
      "sys:checkProcessExists",
      "sys:getActiveProcessInfo",
      "sys:restoreActiveWindow",
      "sys:windowOperations",
      "sys:sendMessage",
      "sys:uiautomation",
      "sys:flauiautomation",
      "sys:getSelectedFiles",
      "sys:imeControl",
      "sys:keyoperation",
      "sys:playSound",
      "sys:recordSound",
      "sys:audioControl",
      "sys:quickeroperations",
      "sys:getSysInfo",
      "sys:winservice",
      "sys:getActionInfo",
      "sys:getQuickerInfo",
    ],
  },
  {
    id: "network",
    title: "网络与云服务",
    keys: [
      "sys:http",
      "sys:download",
      "sys:websocket",
      "sys:httpserver",
      "sys:smtp",
      "sys:ai",
      "sys:tempcloudstore",
      "sys:tempImgBed",
      "sys:cloud_oss",
      "sys:clouddata",
      "sys:webview2",
    ],
  },
  {
    id: "script",
    title: "脚本与代码",
    keys: [
      "sys:csscript",
      "sys:jsscript",
      "sys:pythonscript",
      "sys:runScript",
    ],
  },
  {
    id: "third-party",
    title: "第三方软件",
    keys: [
      "sys:chromecontrol",
      "sys:getChromeUrl",
      "sys:excelreadwrite",
      "sys:excelRange",
      "sys:excelObjects",
      "sys:officehelper",
      "sys:adobesoftscontrol",
      "sys:autocadcontrol",
      "sys:rhinocontrol",
    ],
  },
];

const CATEGORY_TITLES = {
  "flow-control": "程序流控制",
  basic: "常用基础",
  ui: "界面交互",
  clipboard: "剪贴板",
  file: "文件与目录",
  text: "文本处理",
  compute: "计算与数据结构",
  image: "图片",
  system: "系统与窗口",
  network: "网络与云服务",
  script: "脚本与代码",
  "third-party": "第三方软件",
  other: "其它",
};

for (const group of CATEGORY_GROUPS) {
  for (const key of group.keys) {
    CATEGORY_BY_KEY[key] = group.id;
  }
}

function parseArgs(argv) {
  const limitIdx = argv.indexOf("--limit");
  const keyIdx = argv.indexOf("--key");
  return {
    force: argv.includes("--force"),
    limit: limitIdx >= 0 ? Number(argv[limitIdx + 1]) : undefined,
    key: keyIdx >= 0 ? argv[keyIdx + 1] : undefined,
  };
}

function defaultSlug(key) {
  const tail = key.startsWith("sys:") ? key.slice(4) : key;
  return tail.toLowerCase();
}

function resolveSlug(key) {
  return SLUG_OVERRIDES[key] ?? defaultSlug(key);
}

function resolveCategory(key) {
  return CATEGORY_BY_KEY[key] ?? "other";
}

/** @param {string} key @param {Record<string, unknown>} meta */
function buildRefId(key) {
  return key.replace(/^sys:/, "").replace(/[^a-zA-Z0-9_-]+/g, "-");
}

/** @param {string} key @param {Record<string, unknown>} meta @param {string | null} docBody @param {string} slug */
function renderKcModuleRef(key, meta, docBody, slug) {
  const id = buildRefId(key);
  const category = resolveCategory(key);
  const categoryTitle = CATEGORY_TITLES[category] ?? category;
  const snippet = typeof meta.snippet === "string" ? meta.snippet : "";
  const docUrl = `${DOC_BASE}/${slug}`;

  /** @type {string[]} */
  const lines = [
    `# ${key}`,
    "",
    `> **分类**：${categoryTitle} · **来源**：KC 官方文档（\`npm run docs:modules:gen\`）· [${slug}](${docUrl})`,
    "",
  ];

  if (snippet) {
    lines.push(`**用途**：${snippet}`, "");
  }

  if (docBody) {
    lines.push(docBody, "");
  } else {
    lines.push(
      "（无独立 KC 文档页或抓取失败；参数含义以 `qkrpc_step_runner_get` 返回的 `purpose` 为准。）",
      "",
    );
  }

  return { id, markdown: lines.join("\n"), category, slug, docUrl };
}

async function fetchDoc(slug) {
  const url = `${DOC_BASE}/${slug}`;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": "quicker-rpc-doc-gen/1.0" },
      });
      if (!res.ok) {
        await sleep(400 * (attempt + 1));
        continue;
      }
      const raw = await res.text();
      const body = kcHtmlToMarkdown(raw);
      if (body) return body;
    } catch {
      // retry
    }
    await sleep(400 * (attempt + 1));
  }
  return null;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function loadSkipConfig() {
  try {
    const raw = await fs.readFile(SKIP_PATH, "utf8");
    const data = JSON.parse(raw);
    return {
      skip: new Set(/** @type {string[]} */ (data.skip ?? [])),
      authored: new Set(/** @type {string[]} */ (data.authored ?? [])),
    };
  } catch {
    return { skip: new Set(), authored: new Set() };
  }
}

/** @param {Set<string>} authoredKeys @param {Record<string, unknown>} keywords */
async function loadAuthoredCatalog(authoredKeys, keywords) {
  /** @type {{ id: string, key: string, title: string, category: string, docUrl: string }[]} */
  const items = [];
  for (const key of [...authoredKeys].sort()) {
    const meta = keywords[key];
    if (!meta) continue;
    const slug = resolveSlug(key);
    const id = buildRefId(key);
    const authoredPath = path.join(AUTHORED_DIR, `${id}.md`);
    try {
      await fs.access(authoredPath);
    } catch {
      console.warn(`authored reference missing: ${authoredPath} (${key})`);
      continue;
    }
    items.push({
      id,
      key,
      title: snippetTitle(key, meta),
      category: resolveCategory(key),
      docUrl: `${DOC_BASE}/${slug}`,
    });
  }
  return items;
}

async function pruneOrphanKcRefs(keywords) {
  let removed = 0;
  const keepIds = new Set(Object.keys(keywords).map((k) => buildRefId(k)));
  let files;
  try {
    files = await fs.readdir(KC_OUT_DIR);
  } catch {
    return 0;
  }
  for (const fname of files) {
    if (!fname.endsWith(".md")) continue;
    const id = fname.slice(0, -3);
    if (keepIds.has(id)) continue;
    await fs.unlink(path.join(KC_OUT_DIR, fname));
    removed++;
  }
  return removed;
}

async function mapPool(items, concurrency, fn) {
  /** @type {unknown[]} */
  const results = new Array(items.length);
  let next = 0;

  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => worker()),
  );
  return results;
}

async function main() {
  const { force, limit, key: onlyKey } = parseArgs(process.argv.slice(2));
  const keywords = JSON.parse(await fs.readFile(KEYWORDS_PATH, "utf8"));
  const { skip: skipKeys, authored: authoredKeys } = await loadSkipConfig();
  let entries = Object.entries(keywords);
  if (onlyKey) entries = entries.filter(([k]) => k === onlyKey);
  if (limit) entries = entries.slice(0, limit);

  await fs.mkdir(KC_OUT_DIR, { recursive: true });
  if (force && !limit && !onlyKey) {
    const removed = await pruneOrphanKcRefs(keywords);
    if (removed > 0) console.log(`removed orphan kc refs: ${removed}`);
  }

  /** @type {Record<string, { id: string, key: string, title: string, category: string, docUrl: string }[]>} */
  const kcByCategory = {};
  /** @type {Record<string, { key: string, title: string, docUrl: string }[]>} */
  const getOnlyByCategory = {};

  let written = 0;
  let skipped = 0;
  let failed = 0;
  let emptyDoc = 0;

  await mapPool(entries, 2, async ([key, meta]) => {
    const slug = resolveSlug(key);
    const category = resolveCategory(key);
    const docUrl = `${DOC_BASE}/${slug}`;
    const title = snippetTitle(key, meta);
    const refId = buildRefId(key);

    if (skipKeys.has(key) && !onlyKey) {
      if (!getOnlyByCategory[category]) getOnlyByCategory[category] = [];
      getOnlyByCategory[category].push({ key, title, docUrl });
    }

    const outPath = path.join(KC_OUT_DIR, `${refId}.md`);
    try {
      const stat = await fs.stat(outPath);
      if (!force && stat.size > 0) {
        skipped++;
        if (!kcByCategory[category]) kcByCategory[category] = [];
        kcByCategory[category].push({
          id: refId,
          key,
          title,
          category,
          docUrl,
        });
        return;
      }
    } catch {
      // missing
    }

    let docBody = null;
    try {
      docBody = await fetchDoc(slug);
      if (!docBody) emptyDoc++;
    } catch {
      failed++;
    }

    const { id, markdown, category: cat, docUrl: url } = renderKcModuleRef(
      key,
      /** @type {Record<string, unknown>} */ (meta),
      docBody,
      slug,
    );

    await fs.writeFile(outPath, `${markdown}\n`, "utf8");
    written++;

    if (!kcByCategory[cat]) kcByCategory[cat] = [];
    kcByCategory[cat].push({
      id,
      key,
      title,
      category: cat,
      docUrl: url,
    });
  });

  // Fill get-only catalog for all skipped keys
  if (!limit && !onlyKey) {
    for (const key of skipKeys) {
      const meta = keywords[key];
      if (!meta) continue;
      const category = resolveCategory(key);
      if (getOnlyByCategory[category]?.some((e) => e.key === key)) continue;
      if (!getOnlyByCategory[category]) getOnlyByCategory[category] = [];
      getOnlyByCategory[category].push({
        key,
        title: snippetTitle(key, meta),
        docUrl: `${DOC_BASE}/${resolveSlug(key)}`,
      });
    }
  }

  for (const list of Object.values(kcByCategory)) {
    list.sort((a, b) => a.key.localeCompare(b.key));
  }
  for (const list of Object.values(getOnlyByCategory)) {
    list.sort((a, b) => a.key.localeCompare(b.key));
  }

  const authoredCatalog = await loadAuthoredCatalog(authoredKeys, keywords);
  const catalogMd = renderCatalog(
    kcByCategory,
    getOnlyByCategory,
    authoredCatalog,
  );
  await fs.writeFile(path.join(OUT_DIR, "_catalog.md"), `${catalogMd}\n`, "utf8");

  console.log(
    `step-module kc refs: written=${written} cache-skipped=${skipped} empty-doc=${emptyDoc} fetch-fail=${failed} dir=${KC_OUT_DIR}`,
  );
}

/** @param {string} key @param {unknown} meta */
function snippetTitle(key, meta) {
  if (meta && typeof meta === "object" && "snippet" in meta) {
    const s = /** @type {{ snippet?: string }} */ (meta).snippet;
    if (s) return s;
  }
  return key;
}

/** @param {Record<string, { id: string, key: string, title: string, docUrl: string }[]>} byCat @param {Record<string, { key: string, title: string, docUrl: string }[]>} getOnly @param {{ id: string, key: string, title: string, category: string, docUrl: string }[]} authored */
function renderCatalog(byCat, getOnly, authored) {
  const order = [
    "flow-control",
    "basic",
    "ui",
    "clipboard",
    "file",
    "text",
    "compute",
    "image",
    "system",
    "network",
    "script",
    "third-party",
    "other",
  ];
  /** @type {string[]} */
  const lines = [
    "# 步骤模块目录",
    "",
    "大多数模块 **只需** `qkrpc_step_runner_get`（各字段 `purpose` / `controlField.selection` 已足够写步骤）。",
    "下列 **有 reference** 的模块：`docs_get_reference({ topic: \"step-modules\", file: \"<id>\" })`。",
    "",
    "- **手写**（`references/step-modules/authored/`）：仓库维护；见 `authored/SPEC.md`。",
    "- **KC 爬取**（`references/step-modules/kc/`）：官方全文，供搜索检索；`docs_get_reference({ file: \"kc/<id>\" })`。",
    "",
    "## 手写 reference",
    "",
  ];

  if (authored.length > 0) {
    lines.push("| ref id | key | 用途 | 官方 |");
    lines.push("|--------|-----|------|------|");
    for (const item of authored) {
      const slug = item.docUrl.split("/").pop() ?? "";
      lines.push(
        `| \`${item.id}\` | \`${item.key}\` | ${item.title.replace(/\|/g, "\\|")} | [${slug}](${item.docUrl}) |`,
      );
    }
    lines.push("");
  } else {
    lines.push("（无）", "");
  }

  lines.push("## KC 爬取 reference（全文）", "");

  for (const cat of order) {
    const list = byCat[cat];
    if (!list?.length) continue;
    lines.push(`### ${CATEGORY_TITLES[cat] ?? cat}`, "");
    lines.push("| ref id | key | 用途 | 官方 |");
    lines.push("|--------|-----|------|------|");
    for (const item of list) {
      const slug = item.docUrl.split("/").pop() ?? "";
      lines.push(
        `| \`kc/${item.id}\` | \`${item.key}\` | ${item.title.replace(/\|/g, "\\|")} | [${slug}](${item.docUrl}) |`,
      );
    }
    lines.push("");
  }

  lines.push("## 仅 step-runner get（无 reference 文件）", "");
  lines.push("| key | 用途 | 官方 |");
  lines.push("|-----|------|------|");
  for (const cat of order) {
    const list = getOnly[cat];
    if (!list?.length) continue;
    for (const item of list) {
      const slug = item.docUrl.split("/").pop() ?? "";
      lines.push(
        `| \`${item.key}\` | ${item.title.replace(/\|/g, "\\|")} | [${slug}](${item.docUrl}) |`,
      );
    }
  }
  lines.push("");
  return lines.join("\n");
}

if (process.argv.includes("--test-http")) {
  testOne("http")
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
} else {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

async function testOne(slug) {
  const body = await fetchDoc(slug);
  console.log(`test ${slug}:`, body ? body.slice(0, 400) : "(null)");
}
