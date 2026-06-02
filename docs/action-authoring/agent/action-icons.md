# 动作图标（Font Awesome 与图片 URL）
说明 **`icon` 参数值** 怎么写。搜索图标用 **`qkrpc_fa_search`**；格式见下文。
## 枚举名（Font Awesome）
`fa search` / **`qkrpc_fa_search`** 默认压缩 `names[]`：同图形 **Solid/Regular/Light → `Light_{图形id}`**；品牌 **`Brands_{图形id}`**。CLI `--expand` 时 `names[]` 为各样式行（`Solid_*` 等）。
## Font Awesome 格式
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
## 图片 URL 格式
保留或恢复 Quicker 设计器里选的**图片图标**时，把 `action get` / 列表返回的 `icon` 原样写回（勿改成 `fa:`）。
```text
https://...
http://...
```
| 规则 | 说明 |
|------|------|
| 必须是绝对 URL | `http` 或 `https`，含主机名 |
| 典型来源 | `files.getquicker.net/_icons/...` 等 Quicker 图标 CDN |
| 与 FA 二选一 | 同一 `icon` 字段只存一种形式 |
示例：`https://files.getquicker.net/_icons/ED114190F25E5C2DFD8C245B8F3D2F9DA76E2666.png`
## 写到哪里
| 位置 | 字段 |
|------|------|
| `action create` / `set-metadata` | `--icon` / `icon` 参数 |
| `action patch` / `subprogram create` | JSON 顶层 `"icon"` |
格式或未知枚举名会在 由工具返回的 `errorMessage` / stderr；可用 **`qkrpc_fa_search`** / `fa search` 核对 `names[]`。
## 相关
`authoring-workflow`（P3）· `patch-workflow` · `overview`
