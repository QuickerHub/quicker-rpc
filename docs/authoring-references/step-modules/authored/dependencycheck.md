# sys:dependencycheck

> **分类**：程序流控制 · **来源**：仓库手写 · **官方**：[dependencycheck](https://getquicker.net/KC/Help/Doc/dependencycheck)

**用途**：从 getquicker 依赖托管检查/下载 NuGet 风格 zip 包，返回本地解压路径供脚本引用。

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

## 陷阱

- `packageVersion` 留空表示**不限制版本**（取已安装最高版）；填 `1.2.3` 表示**最低**版本要求。
- 解压路径为 `文档\Quicker\_packages\<包名>\<版本>\`；后续 `csscript` / `runScript` 用 `packagePath` 拼接 DLL 或脚本相对路径。
- 依赖须已在 [getquicker 依赖列表](https://getquicker.net/share/depd/index) 发布；动作内勿对外泄露下载直链。

## 相关

csscript · runScript · step-runner-get · implementation-fallback
