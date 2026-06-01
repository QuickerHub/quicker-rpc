# CLI setup for agents
## P0 连通
```powershell
qkrpc ping --json
qkrpc help --json
qkrpc guide get --topic overview --json
qkrpc guide get --topic authoring-workflow --json
```
Quicker 运行中且已加载 QuickerRpc 插件。
## 最小编辑链（P1→P6）
```powershell
qkrpc action list --query <keyword> --json
qkrpc action get --id <guid> --return-mode full --json
qkrpc step-runner get --key <stepRunnerKey> --json
qkrpc action patch --id <guid> --patch-file patch.json --expected-edit-version <N> --json
```
Patch stdin：`Get-Content patch.json -Raw | qkrpc action patch --id <guid> --patch-file - --json`
## 专题
`overview` · `authoring-workflow` · `patch-workflow` · `action-icons` · `xaction-json` · `variables` · `expressions` · `step-modules` · `step-runner-search` · `implementation-fallback`
