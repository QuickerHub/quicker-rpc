# QuickerAgent 本地插件契约

> 当前只维护已经进入代码的最小契约。产品状态见 [EXT](product/README.md#p-ext)，目录与迁移见 [用户数据与插件](agent-gui-plugin-storage.md)。

本规范只覆盖 QuickerAgent sidecar runtime，不包括 Quicker 内的 `QuickerRpc.Plugin`、ActionRuntime modules 或 qkrpc MCP。

## 当前目录

`agent-gui/lib/plugin-catalog.ts` 是插件可见性事实源：

| pluginId | 状态 | transport |
|---|---|---|
| `voice-asr` | available | HTTP health + `quicker-voice-v1` WebSocket |
| `clipboard-history` | disabled | 代码保留，产品入口关闭 |

只有 `availability === "available"` 的条目可以显示安装或设置操作。

## 本地结构

```text
%APPDATA%/QuickerAgent/plugins/<plugin-id>/
  manifest.json
  settings.json
  runtime/
  models/
```

Manifest 只描述本地 runtime 身份、版本、入口、transport 和资源；远程下载地址、SHA256 与版本更新由 channel/发布配置负责，不写进用户设置。

## Host 生命周期

```text
catalog -> status -> install/update -> start on demand -> health -> use -> stop
```

- Host 负责下载校验、进程启停、健康检查和退出清理。
- Runtime 独立发版时，只要本地协议兼容，通常不需要升级 QuickerAgent。
- 启动失败返回结构化状态，不让 UI 猜测进程状态。
- disabled 插件不得自动启动或出现在正式卖点中。

## 接入新插件的门槛

1. 在 plugin catalog 增加稳定 id、说明、体积提示和 availability。
2. 定义最小 manifest/channel 与本地 transport。
3. 实现安装、校验、启动、健康、停止和升级失败回滚。
4. 在设置 UI 展示明确状态和可恢复错误。
5. 增加生命周期、路径迁移和资源释放测试。
6. 更新 `docs/product/README.md`，不能只写一份设计稿。

不维护尚未实现的通用 registry/activationEvents API；需要时从实际第二个可用插件抽象。
