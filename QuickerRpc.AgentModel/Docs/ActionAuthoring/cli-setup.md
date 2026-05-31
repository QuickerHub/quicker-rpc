# CLI setup for agents

无头编辑使用 **`qkrpc.exe`**。Quicker 运行中且已加载 QuickerRpc 插件。

## Quick check

```powershell
qkrpc ping --json
qkrpc help --json
qkrpc guide get --topic authoring-workflow --json
```

## Agent workflow

见 **`authoring-workflow`**（步骤搜索、`step-runner get` schema、patch JSON 语法、保存后约束）。

最小命令链：

```powershell
qkrpc action list --query <keyword> --json
qkrpc action get --id <guid> --return-mode full --json
qkrpc step-runner get --key <stepRunnerKey> --json
qkrpc action patch --id <guid> --patch-file patch.json --expected-edit-version <N> --json
```

Patch 从 stdin：

```powershell
Get-Content patch.json -Raw | qkrpc action patch --id <guid> --patch-file - --json
```

## Topics

`authoring-workflow` · `overview` · `patch-workflow` · `xaction-json` · `variables` · `expressions` · `step-modules` · `step-runner-search` · `implementation-fallback` · `cli-setup`
