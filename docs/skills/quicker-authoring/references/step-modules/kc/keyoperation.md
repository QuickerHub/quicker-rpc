# sys:keyoperation

> **分类**：系统与窗口 · **来源**：KC 官方文档（`npm run docs:modules:gen`）· [keyoperation](https://getquicker.net/KC/Help/Doc/keyoperation)

**用途**：Query or control a single key state

用于获取单个 **键盘**\**鼠标** 按键的按下、锁定状态，或按下、抬起某个按键。

[image]

**注意**：如果按键被设置为“扩展热键”，或被Quicker用于触发功能的鼠标键，这时候按键消息会被Quicker拦截，会识别不到。这种情况下是正常的，请只用于检测没有被Quicker特殊处理的按键。

## 应用场景示例

- 某些情况下模拟一直按下按键进行的其他操作。
- 获取大小写锁定状态并自动设置为需要的状态。
- 开始动作时根据是否按下某个键做动作功能的切换。

# 参数

【类型】操作类型：

- 获取按键状态：获取指定按键的状态信息（是否按下，是否锁定）。
- 按下按键：按下指定按键。注意按下和抬起需要配对使用。
- 抬起按键：抬起某个按下的按键。

【按键】要读取或操作的按键键名或虚拟键码。可参考“[等待按键](https://www.yuque.com/quicker/help/waitkeyboard#26Hmf)”文档。

# 输出

【是否按下】按键是否处于按下状态。

【是否锁定】按是否处于锁定状态，仅对NumLock、CapsLock按键有效。

# 版本历史

- 1.2.15版本中开始提供。
