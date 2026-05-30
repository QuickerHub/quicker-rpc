# quicker-rpc 发布到 Quicker（qkbuild -p）

在仓库根目录执行：打包 **quicker.rpc** 并上传到 Quicker 依赖/OSS，同时发布本地 `qkrpc.exe`。

1. **Read** `.cursor/skills/quicker-rpc-publish/SKILL.md`
2. 确认用户接受 **版本 bump** 与线上依赖更新；若仅重传当前版本，改用 `pwsh ./build.ps1 -p -n`
3. 默认发布（小版本 +1 并上传）：

```powershell
pwsh ./build.ps1 -p
```

4. 成功后：
   - **Read** `version.json` 汇报 `QuickerRpc` 版本
   - 确认 `QuickerRpc.Plugin/publish/QuickerRpc.*.zip` 与 `QuickerRpc_Run` 子程序版本已更新（见 build 日志）
5. 若 `version.json` 变更，建议提交：

```powershell
git add version.json
git commit -m "chore(quicker-rpc): bump version to X.Y.Z.W"
```

用户要求时再 `git push`。
