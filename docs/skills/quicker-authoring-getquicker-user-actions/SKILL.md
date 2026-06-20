---
name: quicker-authoring-getquicker-user-actions
description: "getquicker User/Actions 分页 HTML 抓取：汇总获赞 totalLikes 与动作数 actionCount。写分页 HTTP 抓取、HTML 解析聚合类动作时加载。"
allowed-tools: docs
compatibility: "QuickerAgent (on-demand); requires Quicker + QuickerRpc plugin"
---


# getquicker 用户动作获赞统计（quicker-authoring-getquicker-user-actions）

> **父 skill**：quicker-authoring · **状态**：promoted · **参考**：QuickerBench `user-action-likes-total`

## 何时加载

从 getquicker.net **User/Actions** 分享页（含分页）抓取公开动作列表，汇总 **获赞总数** 与 **动作个数**，写入输出变量。不要 msgbox / textwindow / form。

## 步骤骨架

1. **输入**：动作参数 `quicker_in_param`（完整 URL 或 `User/Actions/…` 路径）
2. **规范化 URL**：`sys:evalexpression` 或 `sys:assign` — 补 `https://getquicker.net/` 前缀，去掉尾部 `?p=`
3. **首页 GET**：`sys:http` method GET → 变量 `pageHtml` / `httpContent`
4. **解析分页**：从首页 HTML 取 `maxPage`（链接里 `?p=(\d+)` 最大值，通常 1–5）和可选 `共 (\d+) 个动作`
5. **分页循环**：`sys:repeat`（`stopCondition` 或固定次数）或 `page=1..maxPage`
   - 每页 GET：`baseUrl` 或 `baseUrl?p={page}`（第 1 页可无 query）
   - **Bench/mock**：HTTP 由 mock profile 注入 fixture HTML — **勿** web_search / browser
6. **解析表格**：每页 HTML 中 `<tr>` 含 `Sharedaction?code=` 的行 → 取 **第二个** 数字列（likes）
   - 推荐单步 `sys:evalexpression` + C# `Regex.Matches` 累加；复杂 C# 放 `files/*.eval.cs` 再 `file_write` + patch
7. **输出变量**：`totalLikes`、`actionCount` 设 **IsOutput=true**

## 硬规则（本场景）

- `step_runner_search` → `get`：`http|regexExtract|repeat|evalexpression|assign` — 可多次 search 不同模块，禁止猜 `inputParams`。
- 子程序式：结果只写 **输出变量**；禁止弹窗展示结果。
- `repeat` / `each` 子步骤挂 **`ifSteps`**；单分支用 **`simpleIf`**。
- patch 后 **`workspace_program diagnostics`** — 禁止 `read_data` 验证；mock assert 会检查输出变量。
- 大段 C#（含 `{` `}`）勿内联进 `qkrpc_action_create` JSON — 用 `workspace_program file_write` 写 `.eval.cs`。

## HTML 提示（113342-Cea fixture）

- 分页链接：`?p=2` … `?p=5`；首页文本 `共 117 个动作`
- 数据行：`<tr>` 含 `Sharedaction?code=`（跳过含 `<th` 的行）
- **获赞**在 `class="align-middle text-center  d-none d-md-table-cell small"` 的 **第一个** 数字单元格（不是「点赞」文本）
- 表头列顺序：… 大小（非 small 纯数字 td）→ **获赞** → 用户

## 推荐解析（与 QuickerBench oracle 一致）

`files/parsePage.eval.cs` — 每页 HTTP 后执行，累加 `totalLikes` / `actionCount`，首次页还可算 `maxPage`：

```csharp
var rows = System.Text.RegularExpressions.Regex.Matches(pageHtml, @"<tr>[\s\S]*?</tr>");
int pageLikes = 0, pageCount = 0;
foreach (System.Text.RegularExpressions.Match rm in rows)
{
    var row = rm.Value;
    if (!row.Contains("Sharedaction") || row.Contains("<th")) continue;
    var cells = System.Text.RegularExpressions.Regex.Matches(
        row,
        @"<td class=""align-middle text-center\s+d-none d-md-table-cell small"">([\s\S]*?)</td>");
    if (cells.Count < 1) continue;
    var likesRaw = System.Text.RegularExpressions.Regex.Replace(cells[0].Groups[1].Value, @"<[^>]+>", "").Trim();
    if (int.TryParse(likesRaw, out var likes)) { pageLikes += likes; pageCount++; }
}
{totalLikes} = {totalLikes} + pageLikes;
{actionCount} = {actionCount} + pageCount;
if ({maxPage} <= 1)
{
    int mp = 1;
    foreach (System.Text.RegularExpressions.Match m in System.Text.RegularExpressions.Regex.Matches(pageHtml, @"[?&]p=(\d+)"))
        mp = System.Math.Max(mp, int.Parse(m.Groups[1].Value));
    {maxPage} = mp;
}
```

`files/initUrl.eval.cs` — 规范化输入 URL：

```csharp
var raw = "{quicker_in_param}";
{userUrl} = raw.StartsWith("http", System.StringComparison.OrdinalIgnoreCase)
    ? raw.Split('?')[0].TrimEnd('/')
    : "https://getquicker.net/" + raw.TrimStart('/').Split('?')[0].TrimEnd('/');
```

## 步骤顺序（minimal）

1. assign 0 → `totalLikes`, `actionCount`；`maxPage` default 1
2. evalexpression `expression.file` = `files/initUrl.eval.cs`
3. http GET `{userUrl}` → `pageHtml`
4. evalexpression `expression.file` = `files/parsePage.eval.cs`
5. evalexpression `{loopCount}={maxPage}>1?{maxPage}-1:0;`
6. `sys:repeat` count=`{loopCount}` startIndex=2，`ifSteps`：http GET `{userUrl}?p={page}` → parsePage.eval.cs

**禁止**用 `点赞` 文本 regex — HTML 列标题是 **获赞**。

## 变量约定

| 角色 | key |
|------|-----|
| 输入 | `quicker_in_param` |
| 当前页 HTML | `pageHtml` |
| 页码 | `page` / `pageNum` |
| 累计获赞 | `totalLikes` (output) |
| 动作数 | `actionCount` (output) |

## 陷阱

- 勿用 web_search / browser 探页面结构 — mock/bench 已提供 HTTP 响应。
- `regexExtract` 的 output 键名 **`match1 `** 带尾随空格 — 从 get schema 复制。
- 分页 URL：mock 键为完整 URL（含 `?p=N`），与 `quicker_in_param` 规范化后的 base 一致。

## 深度阅读

- QuickerBench oracle：`scripts/quickerbench/lib/user-actions-likes.mjs`
- authored: http · regexExtract · repeat · evalexpression
