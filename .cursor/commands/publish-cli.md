# quicker-rpc 仅发布 CLI

不跑 qkbuild，只将 `QuickerRpc.Console` / `QuickerRpc.Plugin` 发布到 `publish/`。

1. **Read** `.cursor/skills/quicker-rpc-publish/SKILL.md`
2. 在仓库根执行：

```powershell
pwsh -NoProfile -File ./publish/publish-rpc.ps1
```

3. 退出码 0 后确认 `publish/cli/qkrpc.exe`；若日志提示 PATH 已更新，提醒用户新开终端。

适用：仅改 CLI 或 Contracts 客户端、不需要上传 `quicker.rpc` zip 时。
