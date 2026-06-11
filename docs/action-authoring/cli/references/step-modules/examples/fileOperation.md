# sys:fileOperation

> **来源**：step JSON 示例 · **官方**：[fileoperation](https://getquicker.net/KC/Help/Doc/fileoperation)

**用途**：复制/移动/删除/列举文件与目录。

## 示例

### 复制到目录

```json
{
  "stepRunnerKey": "sys:fileOperation",
  "inputParams": {
    "type": "copyInto",
    "path.var": "源文件",
    "dstPath.var": "目标目录",
    "overwrite": "1"
  },
  "outputParams": {
    "isSuccess": "成功"
  }
}
```

### 列举文件夹内文件

```json
{
  "stepRunnerKey": "sys:fileOperation",
  "inputParams": {
    "type": "enumFiles",
    "path.var": "目录",
    "searchPattern": ".jpg;.png",
    "isAll": "1"
  },
  "outputParams": {
    "isSuccess": "成功",
    "files": "文件列表"
  }
}
```

### 移入回收站

```json
{
  "stepRunnerKey": "sys:fileOperation",
  "inputParams": {
    "type": "recycleNoUi",
    "path.var": "待删文件"
  },
  "outputParams": {
    "isSuccess": "成功"
  }
}
```
