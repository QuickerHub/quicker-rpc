# sys:zip

> **分类**：文件与目录 · **来源**：仓库手写 · **官方**：[zip](https://getquicker.net/KC/Help/Doc/zip)

**用途**：轻量 zip 打包或解压（非大文件场景）。

**何时读**：`get` 定压缩/解压；目标路径 `.` `*` 简写前读。

## 模式

**压缩**

| param | 要点 |
|-------|------|
| 源路径 | 单文件夹 / 单文件 / 同目录多选 |
| Zip路径 | 完整路径；空或 `.` → 临时或同目录自动生成 |
| 含文件夹本身 | 单文件夹时是否打包外层目录名 |

**解压**

| 目标路径 | `.` = zip 同目录；`*` = 建子文件夹 |

支持密码、级别、进度条；大归档勿用本模块。


## 示例

<!-- QuickerModuleDoc examples -->

### 67.Zip压缩打包

```json
{
  "stepRunnerKey": "sys:zip",
  "inputParams": {
    "sourceZipFile.var": "savedPath",
    "outputPath": ".",
    "overwrite": "1",
    "showProgress": "1"
  },
  "outputParams": {
    "isSuccess": "解压成功",
    "resultPath": "resultPath"
  }
}
```
## 相关

fileOperation · step-runner-get
