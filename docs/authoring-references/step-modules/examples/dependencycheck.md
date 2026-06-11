# sys:dependencycheck

> **来源**：step JSON 示例 · **官方**：[dependencycheck](https://getquicker.net/KC/Help/Doc/dependencycheck)

**用途**：检查并解析 NuGet 依赖包路径。

## 示例

### 检查已安装包

```json
{
  "stepRunnerKey": "sys:dependencycheck",
  "inputParams": {
    "packageName": "Newtonsoft.Json",
    "packageVersion": "13.0.3"
  },
  "outputParams": {
    "isSuccess": "成功",
    "packagePath": "包路径"
  }
}
```

### 仅指定包名（最高版本）

```json
{
  "stepRunnerKey": "sys:dependencycheck",
  "inputParams": {
    "packageName": "HtmlAgilityPack",
    "packageVersion": ""
  },
  "outputParams": {
    "isSuccess": "成功",
    "packagePath": "包路径"
  }
}
```
