# sys:group

> **来源**：step JSON 示例 · **官方**：[group](https://getquicker.net/KC/Help/Doc/group)

**用途**：将相关子步骤折叠成组，可整体禁用或忽略组内错误。

## 示例

### 基础步骤组

子步骤挂在组内；本步仅声明组容器。

```json
{
  "stepRunnerKey": "sys:group"
}
```

### 忽略组内错误

```json
{
  "stepRunnerKey": "sys:group",
  "inputParams": {
    "skipErr": "1"
  },
  "outputParams": {
    "isSuccess": "成功",
    "errorMessage": "错误信息"
  }
}
```
