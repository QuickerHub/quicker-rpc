# 动作图标（Font Awesome）
说明 **`icon` 参数值** 怎么写。{{#ref action-icons.help}}。
## 枚举名
`fa search` / **`qkrpc_fa_search`** 默认压缩 `names[]`：同图形 **Solid/Regular/Light → `Light_{图形id}`**；品牌 **`Brands_{图形id}`**。CLI `--expand` 时 `names[]` 为各样式行（`Solid_*` 等）。
## icon 字符串格式
```text
fa:{enumName}
fa:{enumName}:{#color}
```
| 段 | 规则 | 示例 |
|----|------|------|
| 前缀 | `fa:` | |
| enumName | `names[]` 一项，原样 | `Light_Flask`、`Brands_Google` |
| color | 可选 `#` + 十六进制 | `#3b82f6` |
示例：`fa:Light_Flask`、`fa:Light_Flask:#ff6600`
## 写到哪里
| 位置 | 字段 |
|------|------|
| `action create` / `set-metadata` | `--icon` / `icon` 参数 |
| `action patch` / `subprogram create` | JSON 顶层 `"icon"` |
格式或未知枚举名会在 {{#ref errors.source}}；可用 **`qkrpc_fa_search`** / `fa search` 核对 `names[]`。
## 相关
`authoring-workflow`（P3）· `patch-workflow` · `overview`
