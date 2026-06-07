# {{#topic-title}}

**When**: action **ContextMenuData** (right-click menu) or SelectionItems-shaped multi-line text (variables, form select, sys:custompanel contextMenuData).

## Model

**CommonOperationItem** — multi-line text → `ParseLines` / `ParseLinesWithSubItems`. Action context menu is main metadata use; same display rules for step params.

## ContextMenuData

| item | notes |
|------|-------|
| field | ActionItem.ContextMenuData (~1500 chars max) |
| trigger | right-click → ActionTrigger.ContextMenu |
| param | data after `\|` → **quicker_in_param** — expressions |

Line example:

```text
[fa:Light_Cog:#FF0000]Settings(open settings)|settings
```

## Line format

```text
[icon]Title(tooltip)|data
```

| part | required | notes |
|------|----------|-------|
| [icon] | no | action-icons / fa search |
| Title | recommended | display text |
| (tooltip) | no | outermost `()` pair |
| \| | context-dependent | display \| data; or \|= custom sep |
| data | no | string or operation= query |

No `\|`: whole line = title = data. Empty lines skip. `////` comment lines skip.

## Icons

Leading `[` with known prefix: `fa:`, `url:`, `icon:`, `previmg:`, `shellicon:`, `action:`, `text:` — see **action-icons**.

## Submenus

**[+]/[-]** prefix or indent hierarchy (designer export). `----` = separator.

## Data part

Context menu: plain string → quicker_in_param. Advanced: `operation=runAction&actionId=…` query string.

SelectionItems (dropdown): display \| value per line; same icon/title rules without operation= unless menu scenario.

## Related

action-icons · expressions · authoring-workflow (P3) · overview
