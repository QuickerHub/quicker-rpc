# sys:zip

> **来源**：step JSON 示例 · **官方**：[zip](https://getquicker.net/KC/Help/Doc/zip)

**用途**：轻量 zip 压缩或解压。

## 示例

### 压缩文件夹

```json
{
  "stepRunnerKey": "sys:zip",
  "inputParams": {
    "type": "Zip",
    "sourcePath.var": "源目录",
    "targetZipFile.var": "目标zip",
    "keepBaseFolder": "1",
    "level": "6"
  },
  "outputParams": {
    "isSuccess": "成功",
    "resultPath": "结果路径"
  }
}
```

### 压缩到同目录

```json
{
  "stepRunnerKey": "sys:zip",
  "inputParams": {
    "type": "Zip",
    "sourcePath.var": "文件路径",
    "targetZipFile": "."
  },
  "outputParams": {
    "resultPath": "结果路径"
  }
}
```

### 解压到当前目录

```json
{
  "stepRunnerKey": "sys:zip",
  "inputParams": {
    "type": "Unzip",
    "sourceZipFile.var": "zip路径",
    "outputPath": ".",
    "overwrite": "1"
  },
  "outputParams": {
    "isSuccess": "成功",
    "resultPath": "解压目录"
  }
}
```

### 带密码解压

```json
{
  "stepRunnerKey": "sys:zip",
  "inputParams": {
    "type": "Unzip",
    "sourceZipFile.var": "zip路径",
    "outputPath.var": "输出目录",
    "password.var": "密码"
  },
  "outputParams": {
    "isSuccess": "成功"
  }
}
```
