# step-module examples 全覆盖 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 44 个 `authored/<id>.md` 改为以压缩 step JSON 示例为主；删除对应 `kc/<id>.md`；生成脚本永久跳过 authored；loop 直至 `.examples-progress.json` 全部 `done`。

**Architecture:** 进度文件驱动批次执行；每模块 `step-runner get` + KC 全文 → 重写 authored → 删 kc 重复 → `compress-module-ref-examples.mjs` 校验；批次末跑 `docs:modules:analyze` + `docs:gen`。

**Tech Stack:** Node scripts, qkrpc CLI, markdown refs under `docs/action-authoring-src/references/step-modules/`

**Spec:** [2026-06-10-step-module-examples-design.md](../specs/2026-06-10-step-module-examples-design.md)

**Progress:** `docs/action-authoring-src/references/step-modules/.examples-progress.json`

**Loop prompt（每 tick 执行）:**

```text
续跑 step-module examples 迁移：读 docs/superpowers/plans/2026-06-10-step-module-examples.md 与 .examples-progress.json；node scripts/step-module-examples-progress.mjs --next 取下一批；若输出 ALL_DONE 则 npm run docs:modules:analyze && npm run docs:modules:gen && npm run docs:gen 后结束。否则对本批每模块执行 Task 1 工作流；批末 mark-done 并汇报进度。
```

---

## Task 0: 基础设施（一次性）

**Files:**
- Modify: `scripts/generate-step-module-refs.mjs`
- Modify: `docs/action-authoring-src/references/step-modules/authored/SPEC.md`
- Create: `scripts/step-module-examples-progress.mjs`（已完成）
- Create: `.examples-progress.json`（已完成）

- [ ] **Step 1: 生成脚本跳过 authored**

在 `generate-step-module-refs.mjs` 的 `mapPool` 回调开头：若 `authoredKeys.has(key) && !onlyKey` 则 `return`（不 fetch、不写 kc）。`pruneOrphanKcRefs` 扩展：删除 id 在 authored 集合中的 kc 文件。

- [ ] **Step 2: 更新 SPEC §3 为 examples-first**

删除「wire 要点 / 何时读」为必选；`## 示例` 为必选；行数上限 150。

- [ ] **Step 3: 验证 progress 脚本**

```bash
node scripts/step-module-examples-progress.mjs
node scripts/step-module-examples-progress.mjs --next
```

Expected: `progress: 0/44 done` + `next: rhinocontrol autocadcontrol adobesoftscontrol mathocr`

---

## Task 1: 单模块工作流（每模块重复）

**Files per module `<id>`:**
- Modify: `docs/action-authoring-src/references/step-modules/authored/<id>.md`
- Delete: `docs/action-authoring-src/references/step-modules/kc/<id>.md`（存在则删）

- [ ] **Step 1: 拉 schema**

```bash
qkrpc step-runner get --key sys:<key> --json
```

记录 `controlField`、各分支 `inputParams` 键名与 `purpose`。

- [ ] **Step 2: 读 KC 素材**

`docs/action-authoring-src/references/step-modules/kc/<id>.md`（删前阅读）或 getquicker KC URL。

- [ ] **Step 3: 重写 authored**

结构：元信息 + 用途 + `## 示例`（每场景 `###` + json 块）+ 可选陷阱 + 相关。  
保留已有 `<!-- QuickerModuleDoc examples -->` 块但改短标题、校对键名。  
`minExamples` 见 progress 文件。

- [ ] **Step 4: 压缩示例（qkrpc 在线时）**

```bash
node scripts/compress-module-ref-examples.mjs
```

- [ ] **Step 5: 删 kc 重复 + mark done**

```bash
rm -f docs/action-authoring-src/references/step-modules/kc/<id>.md
node scripts/step-module-examples-progress.mjs --mark-done <id>
```

---

## 全模块清单（44）— 每模块必写示例场景

### Batch 1 — XS（8 模块，各 ≥2 例）

| id | key | 必覆盖场景 |
|----|-----|------------|
| rhinocontrol | sys:rhinocontrol | 执行命令；执行脚本 |
| autocadcontrol | sys:autocadcontrol | 发送命令行；LISP 脚本 |
| adobesoftscontrol | sys:adobesoftscontrol | Photoshop 脚本；Illustrator 操作（按 get 分支） |
| mathocr | sys:mathocr | 识别剪贴板/变量图片公式 |
| flauiautomation | sys:flauiautomation | 查找元素；点击/输入（与 uiautomation 区分用 FlaUI 分支） |
| translation | sys:translation | 文本翻译；指定源/目标语言 |
| jsscript | sys:jsscript | 内联 JS；`code.file` 外链 |
| pythonscript | sys:pythonscript | 内联 Python；输出到变量 |

### Batch 2 — S（10 模块）

| id | key | min | 必覆盖场景 |
|----|-----|-----|------------|
| enc | sys:enc | 3 | AES 加解密；SHA256 哈希；HMAC |
| smtp | sys:smtp | 2 | 纯文本邮件；HTML 正文 + 附件路径 |
| record | sys:record | 2 | 开始录制；停止并保存 |
| playRecords | sys:playRecords | 2 | 播放录制文件；变速/次数 |
| tempcloudstore | sys:tempcloudstore | 2 | 上传文本得 URL；上传文件 |
| zip | sys:zip | 3 | 压缩目录；解压到路径；仅列出内容 |
| websocket | sys:websocket | 3 | 连接；发送消息；关闭 |
| excelObjects | sys:excelObjects | 2 | 获取 Range 对象；Chart 对象操作 |
| excelRange | sys:excelRange | 2 | 读取区域；写入区域 |
| officehelper | sys:officehelper | 2 | 启动 Excel；获取活动工作簿 |

### Batch 3 — M（12 模块）

| id | key | min | 必覆盖场景 |
|----|-----|-----|------------|
| http | sys:http | 5 | GET 文本；POST JSON；POST FORM；POST 文件 multipart；SSE 流式 |
| download | sys:download | 3 | URL 下载到文件；断点续传分支（若有）；请求头 |
| cloud_oss | sys:cloud_oss | 3 | 阿里云图片 `.var`；文本上传；COS 分支（若 get 有） |
| dboperation | sys:dboperation | 3 | 查询；执行 SQL；参数化 |
| tableoperation | sys:tableoperation | 3 | 筛选行；添加列；导出 CSV |
| stringProcess | sys:stringProcess | 4 | 去空白；截取；正则替换；大小写 |
| htmlExtract | sys:htmlExtract | 3 | CSS 选择器；XPath；属性提取 |
| jsonExtract | sys:jsonExtract | 3 | JSONPath；JMESPath；多结果列表 |
| regexExtract | sys:regexExtract | 3 | 首个匹配；全部匹配；命名组 |
| imgProcess | sys:imgProcess | 3 | 缩放；裁剪；旋转 |
| searchBmp | sys:searchBmp | 3 | 找图；找色；OCR 字 |
| basic-ocr | sys:basic-ocr | 3 | 屏幕区域；图片变量；多语言 |

### Batch 4 — M+（8 模块）

| id | key | min | 必覆盖场景 |
|----|-----|-----|------------|
| form | sys:form | 2 | `formDef.file` 外链；输出到变量（schema-backed，指向 form-spec） |
| customwindow | sys:customwindow | 3 | 打开自定义窗；关闭；传参 |
| custompanel | sys:custompanel | 3 | 侧面板 HTML；与动作通信用法 |
| webview2 | sys:webview2 | 3 | 打开 URL；执行 JS；关闭窗口 |
| runScript | sys:runScript | 3 | PowerShell 内联；CMD；脚本文件路径 |
| csscript | sys:csscript | 3 | 内联 C#；引用程序集；输出变量 |
| subprogram | sys:subprogram | 3 | 调用共享子程序；本地子程序；传参/返回值 |
| uiautomation | sys:uiautomation | 4 | 查找控件；点击；取值；等待出现 |

### Batch 5 — L（6 模块）

| id | key | min | 必覆盖场景 |
|----|-----|-----|------------|
| fileOperation | sys:fileOperation | 5 | 复制；移动；删除；重命名；创建目录 |
| excelreadwrite | sys:excelreadwrite | 4 | 打开工作簿；读单元格；写区域；保存关闭 |
| chromecontrol | sys:chromecontrol | 6 | 连接标签；执行 JS；填表；截图；下载；关闭 |
| ai | sys:ai | 4 | 对话补全；流式输出变量；多轮 messages |
| httpserver | sys:httpserver | 3 | 启动监听；单请求响应；停止 |
| inputScript | sys:inputScript | 4 | 键盘宏 DSL；鼠标点击；等待；循环块 |

---

## Task 2: 批次收尾（每 4 模块或全部 done）

- [ ] **Step 1: 更新 catalog**

```bash
npm run docs:modules:analyze
npm run docs:modules:gen
```

- [ ] **Step 2: 渲染 skill 输出**

```bash
npm run docs:gen
```

- [ ] **Step 3: 进度汇报**

```bash
node scripts/step-module-examples-progress.mjs
```

当 `44/44 done`：停止 loop，确认 `kc/` 下无 authored id 残留。

---

## Loop 调度

| tick | 预期模块 |
|------|----------|
| 0（立即） | Task 0 + batch1 前 4 |
| 1 | batch1 后 4 |
| 2–10 | batch2–5 各 2–3 tick |
| 末 | Task 2 全量 regen |

动态 fallback：`sleep 1200`（20min）若 tick 未完成。

---

## 验收

- 每篇 `authored/<id>.md` 含 `## 示例` 且 JSON 块 ≥ `minExamples`
- 无 `kc/<id>.md` 与 authored 同 id
- `docs_get_reference({ topic:"step-modules", file:"<id>" })` 可返回示例
- compress 脚本无键名错误（警告可接受）
