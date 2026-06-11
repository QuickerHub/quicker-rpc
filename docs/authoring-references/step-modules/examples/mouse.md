# sys:mouse

> **来源**：step JSON 示例 · **官方**：[mouse](https://getquicker.net/KC/Help/Doc/mouse)

**用途**：移动鼠标、点击、找图点击等。

## 示例

### 左键单击

```json
{
  "stepRunnerKey": "sys:mouse",
  "inputParams": {
    "type": "click",
    "btn": "left"
  },
  "outputParams": {
    "isSuccess": "成功"
  }
}
```

### 移动到坐标

```json
{
  "stepRunnerKey": "sys:mouse",
  "inputParams": {
    "type": "moveToXy",
    "x": "100",
    "y": "200"
  },
  "outputParams": {
    "isSuccess": "成功",
    "mouseX": "X",
    "mouseY": "Y"
  }
}
```

### 恢复鼠标位置

```json
{
  "stepRunnerKey": "sys:mouse",
  "inputParams": {
    "type": "restore"
  },
  "outputParams": {
    "isSuccess": "成功"
  }
}
```
