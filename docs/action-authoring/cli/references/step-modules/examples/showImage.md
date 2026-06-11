# sys:showImage

> **来源**：step JSON 示例 · **官方**：[showimage](https://getquicker.net/KC/Help/Doc/showimage)

**用途**：在独立窗口显示图片文件或变量。

## 示例

### 显示文件

```json
{
  "stepRunnerKey": "sys:showImage",
  "inputParams": {
    "source": "file",
    "path.var": "图片路径",
    "scale": "100"
  },
  "outputParams": {
    "isExists": "窗口存在",
    "hwnd": "窗口句柄"
  }
}
```

### 显示变量

```json
{
  "stepRunnerKey": "sys:showImage",
  "inputParams": {
    "source": "var",
    "imgVar.var": "截图",
    "opacity": "90",
    "autoCloseTime": "5"
  },
  "outputParams": {
    "isExists": "窗口存在"
  }
}
```

### 关闭指定窗口

```json
{
  "stepRunnerKey": "sys:showImage",
  "inputParams": {
    "source": "closeWindow",
    "autoCloseKey.var": "窗口标识"
  },
  "outputParams": {
    "windowIdList": "窗口列表"
  }
}
```
