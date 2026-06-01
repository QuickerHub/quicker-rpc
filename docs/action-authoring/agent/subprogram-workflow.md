# 公共子程序
全局库：**`qkrpc_subprogram_*` 工具**。动作内调用走 **`authoring-workflow`** P5–P6 + 下文 B 链。
## A 管理子程序
```text
subprogram search/list → get → step-runner get → subprogram patch
```


```text
qkrpc_subprogram_get({ id: "<id|name>", returnMode: "full" })
```
（create / patch 子程序：agent-ui 暂无，请用终端 qkrpc CLI。）

patch 形状同 **`patch-workflow`**。
## B 在动作中调用
```text
subprogram search/get → callIdentifier
→ `qkrpc_step_runner_get({ key: "sys:subprogram" })`
→ `qkrpc_action_patch` 添加步骤，`inputParams.subProgram.value = callIdentifier`
```
**`callIdentifier`** 通常 `%%{guid}`，从 `subprogram search/get` 读取；未知标识会在 RPC/工具报错。
## 相关
`authoring-workflow` · `patch-workflow` · `overview`
