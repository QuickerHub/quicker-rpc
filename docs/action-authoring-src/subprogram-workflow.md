# 公共子程序
{{#ref subprogram.product}}。动作内调用走 **`authoring-workflow`** P5–P6 + 下文 B 链。
## A 管理子程序
```text
subprogram search/list → get → step-runner get → subprogram patch
```
{{#only-cli}}
```powershell
{{@ subprogram.create}}
{{@ subprogram.get}}
{{@ subprogram.patch}}
```
{{/only-cli}}
{{#only-agent}}
```text
{{@ subprogram.get}}
```
（create / patch 子程序：agent-ui 暂无，请用终端 qkrpc CLI。）
{{/only-agent}}
patch 形状同 **`patch-workflow`**。
## B 在动作中调用
```text
subprogram search/get → callIdentifier
{{#ref subprogram.call.chain}}
```
**`callIdentifier`** 通常 `%%{guid}`，从 `subprogram search/get` 读取；未知标识会在 RPC/工具报错。
## 相关
`authoring-workflow` · `patch-workflow` · `overview`
