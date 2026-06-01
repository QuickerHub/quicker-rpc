# 公共子程序
全局库：**`qkrpc subprogram`**。动作内调用走 **`authoring-workflow`** P5–P6 + 下文 B 链。
## A 管理子程序
```text
subprogram search/list → get → step-runner get → subprogram patch
```

```powershell
qkrpc subprogram create --name "名" [--icon fa:Light_*] --json
qkrpc subprogram get --id <id|name> --return-mode full --json
qkrpc subprogram patch --id <id> --patch-file patch.json --expected-edit-version <N> --json
```


patch 形状同 **`patch-workflow`**。
## B 在动作中调用
```text
subprogram search/get → callIdentifier
→ `step-runner get --key sys:subprogram`
→ `action patch` 添加步骤，`inputParams.subProgram.value = callIdentifier`
```
**`callIdentifier`** 通常 `%%{guid}`，从 `subprogram search/get` 读取；未知标识会在 RPC/工具报错。
## 相关
`authoring-workflow` · `patch-workflow` · `overview`
