# 动作图标

P3 元数据、右键菜单项、CommonOperationItem 中的 **Font Awesome** 与图片 URL 规则。**禁止**手写 `fa:` 枚举名。

## 何时读

- 设置动作 `icon`（create / set-metadata / patch 顶层）
- 编辑 `ContextMenuData` 或 SelectionItems 中的 `[fa:…]`（见 **`common-operation-item`**）
- 校验失败提示 unknown icon / invalid spec

## 合法形状

| 类型 | 示例 | 说明 |
|------|------|------|
| Font Awesome | `fa:Light_AddressBook` | 默认 Light 风格；`fa search` 返回 `Light_*` / `Brands_*` |
| FA + 颜色 | `fa:Light_Cog:#3b82f6` | `#RRGGBB` 可选（菜单项 `[fa:Light_Cog:#FF0000]标题\|数据`） |
| 图片 URL | `https://files.getquicker.net/_icons/....png` | 绝对 `http(s)://`；设计器图片图标原样写回 |

**禁止**：`fa:clipboard`（缺风格前缀）、猜测枚举名、相对路径。

## 如何取得 spec

```text
qkrpc_fa_search({ query: "clipboard" })
qkrpc_action_set_metadata({ id, icon: "fa:Light_<Name>", expectedEditVersion: N })
```
默认压缩结果可直接写入 `icon`；需要 Solid/Brands 全量时用工具说明中的 expand 选项。

## 写入位置

| 场景 | 字段 |
|------|------|
| 动作元数据 | `info.json` / patch 顶层 `icon` |
| 右键菜单 | `ContextMenuData` 各行 `[fa:…]标题(提示)\|数据` |

## 相关

`common-operation-item` · `authoring-workflow`（P3） · 搜图标：**`qkrpc_fa_search`**。
