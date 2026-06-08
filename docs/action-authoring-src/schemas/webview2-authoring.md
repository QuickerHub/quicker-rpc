# {{#topic-title}}

**When**: **sys:webview2** custom HTML UI (dashboard, tools, games). After P4 pick, before steps + files/. Param keys: **step-runner-get** (`controlField: OpenUrl`); KC: **docs_get_reference(step-modules, webview2)**.

## P4 pick

| need | pick |
|------|------|
| custom HTML/CSS/JS | **sys:webview2** (this topic) |
| native multi-field form | **sys:form** + **form-spec** |
| simple dialog | sys:MsgBox + **expressions** |
| open external URL only | webview2 OpenUrl + https URL, or subprogram |

NO csscript-built full HTML popups; long pages in **files/**, step references path only.

## P5 schema

```text
step_runner_search({ query: "webview2" })
step_runner_get({ key: "sys:webview2", controlField: "OpenUrl" })
```

Common **inputParams** (keys from get):

| key | typical | notes |
|-----|---------|-------|
| type | OpenUrl | open page, continue steps |
| url | `"url.file": "files/page.html"` or `"url": "https://…"` | HTML or URL; long HTML → url.file |
| title | `"My tool"` | optional |
| winSize | `"800,600"` | w,h px or % |
| winLocation | CenterScreen | see get enum |
| virtualHostToFolder | `myserver\|files/assets` | map folder to https://myserver/… |
| autoCloseKey | `=` | current action id — avoid duplicate windows |
| script.file | `files/inject.js` | optional inject JS |

Other types (SendMessage, ExecuteScript, wait close) → get with matching control on **type**.

## P6 disk layout

```json
{
  "stepRunnerKey": "sys:webview2",
  "inputParams": {
    "type": "OpenUrl",
    "url.file": "files/page.html",
    "title": "My tool",
    "winSize": "960,640"
  }
}
```

| rule | notes |
|------|-------|
| HTML >4 lines | files/*.html + url.file |
| single file | inline CSS/JS in one .html OK |
| multi-file assets | files/assets/ + virtualHostToFolder |
| variables | page JS: $quicker / $quickerSync — reference webview2 |

Short placeholder may use inline url string; workspace prefers **url.file**.

## Related

webview2 (step-modules) · action-data-schema · action-project-files · step-runner-get · authoring-workflow
