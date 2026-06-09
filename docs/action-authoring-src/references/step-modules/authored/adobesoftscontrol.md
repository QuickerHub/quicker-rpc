# sys:adobesoftscontrol

> **分类**：第三方软件 · **来源**：仓库手写 · **官方**：[adobesoftscontrol](https://getquicker.net/KC/Help/Doc/adobesoftscontrol)

**用途**：对 Photoshop / Illustrator / After Effects 执行 JSX 脚本（目标软件须已启动）。

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

## 陷阱

多版本 Adobe 并存时只能控制其中一个；`tryRunScriptUsingExe` 无法等待完成且无返回值。

## 相关

runScript · step-runner-get
