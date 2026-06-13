# sys:group

> **分类**：程序流控制 · **来源**：仓库手写 · **官方**：[group](https://getquicker.net/KC/Help/Doc/group)

**用途**：将子步骤折叠成组，便于整体禁用/移动；可选忽略组内错误或启用多线程。

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
    "skipErr": true
  },
  "outputParams": {
    "isSuccess": "成功",
    "errorMessage": "错误信息"
  }
}
```

## 陷阱

- 子步骤作为组的 **children** 写入 patch，不是顺序平铺的下一步。
- `skipErr: true` 时组内步骤失败仍继续后续流程，可绑定 `errorMessage` 查看首个错误。
- `useMultiThread` 通常勿启用；调试时可设 `skipWhenDebugging` 减少 trace 噪音。

## 相关

if · each · repeat · stop · step-runner-get
