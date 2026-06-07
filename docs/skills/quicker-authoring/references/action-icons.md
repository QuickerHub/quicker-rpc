# Action icons

P3 metadata, context menu items, CommonOperationItem — Font Awesome and image URL rules. **NO** guessing `fa:` names.

## When

- set action `icon` (create / set-metadata / patch)
- edit `ContextMenuData` / SelectionItems `[fa:…]` — **common-operation-item**
- unknown icon / invalid spec errors

## Valid shapes

| type | example | notes |
|------|---------|-------|
| Font Awesome | `fa:Light_AddressBook` | default Light; fa search returns Light_* / Brands_* |
| FA + color | `fa:Light_Cog:#3b82f6` | optional #RRGGBB |
| image URL | `https://files.getquicker.net/_icons/....png` | absolute http(s) |

**FORBIDDEN**: `fa:clipboard` (no style prefix), guessed names, relative paths.

## Get spec

```text
qkrpc_fa_search({ query: "clipboard" })
qkrpc_action_set_metadata({ id, icon: "fa:Light_<Name>", expectedEditVersion: N })
```
Compressed results writable as `icon`; expand for Solid/Brands when needed.

## Write locations

| scene | field |
|-------|-------|
| action metadata | info.json / patch top `icon` |
| context menu | ContextMenuData lines `[fa:…]title(hint)\|data` |

## Related

common-operation-item · authoring-workflow (P3) · search icons: **qkrpc_fa search**
