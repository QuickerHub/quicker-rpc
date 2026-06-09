# sys:adobesoftscontrol

> **来源**：step JSON 示例 · **官方**：[adobesoftscontrol](https://getquicker.net/KC/Help/Doc/adobesoftscontrol)

**用途**：对 Photoshop / Illustrator / After Effects 执行 JSX 脚本。

## 示例

### Photoshop 内联 JSX

```json
{
  "stepRunnerKey": "sys:adobesoftscontrol",
  "inputParams": {
    "software": "Photoshop.Application",
    "operation": "dojavascript",
    "script": "app.activeDocument.rotateCanvas(90);"
  },
  "outputParams": {
    "isSuccess": "成功"
  }
}
```

### Illustrator 执行脚本文件

```json
{
  "stepRunnerKey": "sys:adobesoftscontrol",
  "inputParams": {
    "software": "Illustrator.Application",
    "operation": "dojavascriptfile",
    "scriptFile": "D:\\scripts\\resize-icons.jsx"
  },
  "outputParams": {
    "isSuccess": "成功",
    "output": "脚本输出"
  }
}
```

### After Effects 内联脚本

```json
{
  "stepRunnerKey": "sys:adobesoftscontrol",
  "inputParams": {
    "software": "afterfx",
    "operation": "dojavascript",
    "script": "alert('AE script');"
  },
  "outputParams": {
    "isSuccess": "成功"
  }
}
```
