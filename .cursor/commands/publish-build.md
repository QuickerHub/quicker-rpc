# quicker-rpc 本地构建

在仓库根目录执行，**不上传** Quicker 依赖。

1. **Read** `.cursor/skills/quicker-rpc-publish/SKILL.md`
2. 运行：

```powershell
pwsh ./build.ps1
```

如需构建但不改 `version.json`：

```powershell
pwsh ./build.ps1 -n
```

3. 退出码 0 后汇报：`version.json`、zip（`QuickerRpc.Plugin/publish/`）、`publish/cli/qkrpc.exe`、`publish/plugin/` 下插件 DLL。
