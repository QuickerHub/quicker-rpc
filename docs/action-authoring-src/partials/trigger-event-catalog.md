## Pick eventType (intent → event)

Match user intent to **one** `eventType` (case sensitive). Then `action=events` with that `eventType` for `fields` / `variables`.

| User intent (zh / en) | eventType | Key params |
|-----------------------|-----------|------------|
| 浏览器网址变化 / 打开网页 / URL / tab / GitHub page | `BrowserUrlChanged` | `UrlPattern`, `OnlyActiveTab` |
| 窗口获得焦点 / 切换到某应用 / foreground / VS Code focus | `WindowActivated` | `ProcessName`, `WindowTitle`, `WindowClass`, `ProcChangeCondition` |
| 窗口失去焦点 / background | `WindowDeactivated` | same as WindowActivated |
| 进程启动 / app started / 打开程序 | `ProcessStarted` | `ProcessName` (required) |
| 进程退出 / app closed | `ProcessExited` | `ProcessName` (required) |
| 剪贴板变化 / copy paste / clipboard | `ClipboardChanged` | `ContentType`, `TextPattern`, `ProcessName` |
| 文件创建修改删除 / 目录监控 / file watch | `FileSystemChange` | `Path`, `Filter`, `WatchCreated`… + `throttleMs` |
| 定时 / 每隔 N 秒 / timer / cron-like | `Repeat` | `RepeatInternval`, `MaxRepeatCount` |
| 空闲一段时间 / idle / 无人操作 | `IdleTimeExpire` | `ExpireSeconds`, `InputMethod`, `RepeatInternval` |
| 结束空闲 / 恢复操作 | `IdleEnd` | `ExpireSeconds`, `InputMethod` |
| 连续使用过久 / busy | `BusyTimeExpire` | `ExpireSeconds`, `IdelResetSeconds`, `RepeatInternval` |
| 网络连接 / WiFi 连接 | `NetworkConnected` | `NetworkName`, `MinConnectivityLevel` |
| 网络断开 | `NetworkDisconnected` | (no params) |
| U盘插入 / 磁盘插入 / USB drive | `DriveInserted` | `DriveLetter`, `DriveVolumeLabel` |
| 蓝牙连接/断开/进入范围/离开 | `BluetoothDeviceConnected` / `Disconnected` / `InRange` / `OutOfRange` | `DeviceName` |
| 音频设备插入/拔出 | `AudioDeviceActive` / `AudioDeviceUnplugged` | `DeviceName` |
| 大小写锁定等按键灯 | `KeyToggled` | `Key` |
| 电源模式 / 插电拔电 | `PowerModeChanged` | (no params) |
| 锁屏 / 解锁 | `SessionLock` / `SessionUnlock` | (no params) |
| 注销关机前 | `SessionEnding` | (no params) |
| 显示器设置变化 | `DisplaySettingsChanged` | (no params) |

Unsure? `quicker_trigger({ action: "events" })` lists all types; add `query` with a keyword (e.g. `网址`, `clipboard`, `file`) to filter the catalog in the tool response.

Existing rule? `quicker_trigger({ action: "list", query: "<keyword>" })` — matches note, eventType, action name/id.
