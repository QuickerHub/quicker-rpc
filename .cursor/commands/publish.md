# quicker-rpc 发布（编排）

在 **quicker-rpc 仓库根目录** 执行。先 **Read** skill：`.cursor/skills/quicker-rpc-publish/SKILL.md`。

## 阶段一：前置

1. `git status`、当前分支。
2. **Read** `version.json` 记录发布前 `QuickerRpc` 版本（仅核对，勿据此写最终结论）。

## 阶段二：构建方式（AskQuestion）

Agent **必须** 调用 **AskQuestion**（单选），未获回答前 **不得** 执行 `build.ps1`。

**title**：`quicker-rpc：选择发布方式`

**prompt**：`build.ps1 会先 qkbuild 再 publish-rpc.ps1。带 -p 会上传 Quicker 依赖 quicker.rpc 并可能 bump version.json。`

| 选项 `id` | `label` |
|-----------|---------|
| `build` | `1. 本地构建` → `pwsh ./build.ps1`（zip + 本地 publish，不上传） |
| `build-n` | `2. 构建不改版本` → `pwsh ./build.ps1 -n` |
| `build-p` | `3. Quicker 发布` → `pwsh ./build.ps1 -p`（bump + 上传 + CLI） |
| `build-p-n` | `4. 发布不改版本` → `pwsh ./build.ps1 -p -n` |
| `cli-only` | `5. 仅 CLI/本地插件` → `pwsh ./publish/publish-rpc.ps1`（跳过 qkbuild） |

### 按选项执行

```powershell
# build
pwsh ./build.ps1

# build-n
pwsh ./build.ps1 -n

# build-p
pwsh ./build.ps1 -p

# build-p-n
pwsh ./build.ps1 -p -n

# cli-only
pwsh -NoProfile -File ./publish/publish-rpc.ps1
```

等待退出码 **0**。失败则读日志修复后重试，**不要** 换模式偷偷重跑 `-p`。

## 阶段三：构建后

1. **重新 Read** `version.json`。
2. 列出产物是否存在：
   - `QuickerRpc.Plugin/publish/QuickerRpc.*.zip`（若跑了 qkbuild）
   - `publish/cli/qkrpc.exe`
   - `publish/plugin/QuickerRpc.Plugin.*.dll`
3. 若版本号相对阶段一变化，在回复中说明旧 → 新。
4. 给出 Quicker 加载示例（`load` / `type` 行，版本与 DLL 文件名一致）。

## 阶段四：Git（可选，用户要求或 `-p` 改了 version.json 时）

若 `version.json` 有变更且应入库：

```powershell
git add version.json
git commit -m "chore(quicker-rpc): bump version to X.Y.Z.W"
```

用户明确要求时再 `git push`。

## 编排索引

- Skill：`.cursor/skills/quicker-rpc-publish/SKILL.md`
