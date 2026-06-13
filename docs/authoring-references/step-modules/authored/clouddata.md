# sys:clouddata

> **分类**：网络与云服务 · **来源**：仓库手写 · **官方**：[clouddata](https://getquicker.net/KC/Help/Doc/clouddata)

**用途**：按全局键名读写 Quicker 云状态（跨设备共享的文本 KV；非动作本地 `stateStorage`）。

## 示例

### 从网络读取状态

```json
{
  "stepRunnerKey": "sys:clouddata",
  "inputParams": {
    "type": "readGlobalState",
    "key": "my_action_last_path"
  },
  "outputParams": {
    "isSuccess": "成功",
    "value": "状态值",
    "errCode": "错误码"
  }
}
```

### 写入状态

```json
{
  "stepRunnerKey": "sys:clouddata",
  "inputParams": {
    "type": "saveGlobalState",
    "key": "my_action_last_path",
    "value.var": "当前路径"
  },
  "outputParams": {
    "isSuccess": "成功"
  }
}
```

### 删除状态（写入 *NULL*）

```json
{
  "stepRunnerKey": "sys:clouddata",
  "inputParams": {
    "type": "saveGlobalState",
    "key": "my_action_last_path",
    "value": "*NULL*"
  },
  "outputParams": {
    "isSuccess": "成功"
  }
}
```

## 陷阱

- 键名**全局**共享（多动作可读写同一条目）；仅文本，非文本变量会转字符串；勿在 `each`/`repeat` 内高频读写（有日次数与容量配额）。
- 读取不存在键时 `errCode` 为 `NoSuchKey`；删除条目写 `value: "*NULL*"`（字面量，非变量）。
- 需要动作内持久化用 `sys:stateStorage`；大文件/临时 URL 用 `tempcloudstore` / `cloud_oss`。

## 相关

stateStorage · tempcloudstore · http · step-runner-get · implementation-fallback
