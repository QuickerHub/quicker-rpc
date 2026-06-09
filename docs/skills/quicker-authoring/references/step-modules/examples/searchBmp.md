# sys:searchBmp

> **来源**：step JSON 示例 · **官方**：[searchbmp](https://getquicker.net/KC/Help/Doc/searchbmp)

**用途**：在屏幕或窗口上查找图片、颜色或文字并返回坐标。

## 示例

### 按文件找图

```json
{
  "stepRunnerKey": "sys:searchBmp",
  "inputParams": {
    "type": "locateByBitmapFile",
    "bmp.file": "按钮.png",
    "bmpTargetType": "Window",
    "bmpPosition": "Center",
    "retryCount": "3"
  },
  "outputParams": {
    "isSuccess": "成功",
    "firstPoint": "第一个点",
    "allPoints": "所有点"
  }
}
```

### 按变量找图（坐标范围）

```json
{
  "stepRunnerKey": "sys:searchBmp",
  "inputParams": {
    "type": "locateByBitmapVar",
    "bmpVar.var": "截图",
    "bmpTargetType": "Rect",
    "searchRect": "0,0,800,600",
    "maxFindCount": "5"
  },
  "outputParams": {
    "isSuccess": "成功",
    "firstPoint": "第一个点"
  }
}
```

### OCR 找字

```json
{
  "stepRunnerKey": "sys:searchBmp",
  "inputParams": {
    "type": "locateByText",
    "searchText": "确定",
    "bmpTargetType": "Rect",
    "searchRect": "200,300,800,500",
    "x": "3",
    "y": "4",
    "retryCount": "2",
    "ignoreWindowsOcr": "true"
  },
  "outputParams": {
    "isSuccess": "成功",
    "firstPoint": "第一个点",
    "allPoints": "所有点"
  }
}
```

### 找色

```json
{
  "stepRunnerKey": "sys:searchBmp",
  "inputParams": {
    "type": "locateByColor",
    "color": "#FF0000",
    "bmpTargetType": "PrimaryScreen",
    "bmpColorError": "10"
  },
  "outputParams": {
    "isSuccess": "成功",
    "firstPoint": "第一个点"
  }
}
```
