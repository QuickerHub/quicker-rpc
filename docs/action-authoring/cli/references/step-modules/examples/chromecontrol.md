# sys:chromecontrol

> **来源**：step JSON 示例 · **官方**：[chromecontrol](https://getquicker.net/KC/Help/Doc/chromecontrol)

**用途**：经 Quicker 浏览器扩展控制 Chrome/Edge/Firefox 标签页与页面。

## 示例

### 打开网址（新标签）

```json
{
  "stepRunnerKey": "sys:chromecontrol",
  "inputParams": {
    "operation": "OpenUrl",
    "windowId": "New",
    "url": "https://example.com",
    "waitComplete": true
  },
  "outputParams": {
    "isSuccess": "成功",
    "tabId": "标签ID"
  }
}
```

### 对活动标签执行 JS

```json
{
  "stepRunnerKey": "sys:chromecontrol",
  "inputParams": {
    "operation": "RunScript",
    "script": "document.title",
    "executionWorld": "MAIN"
  },
  "outputParams": {
    "isSuccess": "成功",
    "rawResponse": "脚本返回"
  }
}
```

### 读取元素文本

```json
{
  "stepRunnerKey": "sys:chromecontrol",
  "inputParams": {
    "operation": "GetElementInfo",
    "tabId.var": "标签ID",
    "selector": "#main h1",
    "elementInfo": "InnerText"
  },
  "outputParams": {
    "isSuccess": "成功",
    "firstValue": "标题"
  }
}
```

### 填写输入框

```json
{
  "stepRunnerKey": "sys:chromecontrol",
  "inputParams": {
    "operation": "UpdateElement",
    "tabId.var": "标签ID",
    "selector": "input[name=q]",
    "updateElementInfo": "Value",
    "updateElementValue": "quicker automation"
  },
  "outputParams": {
    "isSuccess": "成功"
  }
}
```

### 等待元素出现

```json
{
  "stepRunnerKey": "sys:chromecontrol",
  "inputParams": {
    "operation": "Wait",
    "tabId.var": "标签ID",
    "selector": ".result-item",
    "waitEventType": "elementExists",
    "timeoutMs": 15000
  },
  "outputParams": {
    "isSuccess": "成功"
  }
}
```

### 获取标签页信息

```json
{
  "stepRunnerKey": "sys:chromecontrol",
  "inputParams": {
    "operation": "GetTabInfo",
    "tabId.var": "标签ID"
  },
  "outputParams": {
    "isSuccess": "成功",
    "url": "网址",
    "title": "标题",
    "browser": "浏览器"
  }
}
```

### 指定连接的浏览器

```json
{
  "stepRunnerKey": "sys:chromecontrol",
  "inputParams": {
    "operation": "SetBrowser",
    "browser": "msedge"
  },
  "outputParams": {
    "isSuccess": "成功"
  }
}
```

### 激活标签页（按 URL）

```json
{
  "stepRunnerKey": "sys:chromecontrol",
  "inputParams": {
    "operation": "ActivateTab",
    "url": "https://example.com/dashboard"
  },
  "outputParams": {
    "isSuccess": "成功",
    "tabId": "标签ID",
    "url": "网址",
    "title": "标题"
  }
}
```

### 等待加载完成

```json
{
  "stepRunnerKey": "sys:chromecontrol",
  "inputParams": {
    "operation": "WaitTabComplete",
    "tabId.var": "标签ID",
    "timeoutMs": 30000
  },
  "outputParams": {
    "isSuccess": "成功"
  }
}
```

### 点击按钮（触发事件）

```json
{
  "stepRunnerKey": "sys:chromecontrol",
  "inputParams": {
    "operation": "TriggerEvent",
    "tabId.var": "标签ID",
    "selector": "button[type=submit]",
    "triggerEventType": "click"
  },
  "outputParams": {
    "isSuccess": "成功"
  }
}
```

### 运行后台命令（列出标签页 URL）

```json
{
  "stepRunnerKey": "sys:chromecontrol",
  "inputParams": {
    "operation": "BackgroundCommand",
    "backgroundCommand": "api_tabs_query",
    "backgroundCommandArgs": "{\"active\": true}",
    "waitComplete": true,
    "returnFilter": "url"
  },
  "outputParams": {
    "isSuccess": "成功",
    "rawResponse": "标签列表"
  }
}
```
