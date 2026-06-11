# sys:fileOperation
<!-- qkrpc-search-aliases: 文件操作, 读写文件, 复制文件 -->

> **分类**：文件与目录 · **来源**：仓库手写 · **官方**：[fileoperation](https://getquicker.net/KC/Help/Doc/fileoperation)

**用途**：复制/移动/删除/列举文件与目录。

**何时读**：`get` 定「操作类型」后；多文件路径、搜索模式、通配符前读 wire。

## wire 要点

| param | wire | notes |
|-------|------|-------|
| 操作类型 | `controlField` | 各类型互斥参数见 get |
| 路径 | 单路径 / 列表 / 多行文本 | Windows 版复制/移动支持 `*` 通配 |
| 目标路径 | 目录或完整目标路径 | 「复制为/移动为」需含文件名 |
| 搜索内容 | 通配 / `regex:` / `;` 后缀列表 | 列举文件：`.jpg;.png`；文件夹名匹配 |

## 模式（操作类型摘要）

| 类型 | 要点 |
|------|------|
| 复制/移动到目录 | 单路径；或 Windows 版多路径 |
| 复制为 / 移动重命名为 | `目标路径` 含完整新路径 |
| 删除 / 回收站 | 备份敏感数据；大文件可能直接删 |
| 列举文件 | `包含子目录` + 搜索内容（通配/regex/后缀） |
| 列举子文件夹 | 通配或 `regex:` 文件夹名 |

## 禁止 / 常见错误

| 写法 | 问题 |
|------|------|
| 未备份即批量删除 | 不可恢复 |
| 列举用错搜索语法 | 文件用后缀列表；夹用 regex 扫名称 |

## 示例

<!-- QuickerModuleDoc examples -->

### 在当前文件夹下创建指定名称的docx文件并打开

```json
{
  "stepRunnerKey": "sys:fileOperation",
  "inputParams": {
    "path.var": "fullPath"
  },
  "outputParams": {
    "isSuccess": "isSuccess"
  }
}
```
## 相关

step-runner-get · checkPathExists · readFile · zip · action-project-files
