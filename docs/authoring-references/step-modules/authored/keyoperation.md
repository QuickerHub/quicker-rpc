# sys:keyoperation

> **分类**：系统与窗口 · **来源**：仓库手写 · **官方**：[keyoperation](https://getquicker.net/KC/Help/Doc/keyoperation)

**用途**：查询或控制**单个**键盘/鼠标键的按下、锁定状态（down/up 需配对）。

## 示例

### 按下键

```json
{
  "stepRunnerKey": "sys:keyoperation",
  "inputParams": {
    "type": "key_down",
    "key": "Shift"
  }
}
```

### 抬起键

```json
{
  "stepRunnerKey": "sys:keyoperation",
  "inputParams": {
    "type": "key_up",
    "key": "Shift"
  }
}
```

### 查询 CapsLock 状态

```json
{
  "stepRunnerKey": "sys:keyoperation",
  "inputParams": {
    "type": "get_key_state",
    "key": "CapsLock"
  },
  "outputParams": {
    "isDown": "是否按下",
    "isToggled": "是否锁定"
  }
}
```

## 陷阱

- `key_down` / `key_up` 必须配对；`get_key_state` 的 `isToggled` 仅 CapsLock/NumLock 等有效。
- 被 Quicker 扩展热键或触发占用的键检测不到，属正常；键名/虚拟键码见 KC waitkeyboard 文档。
- 虚拟键 V1 模式：`key_keydown_v1` + `keepMs` 自动抬起，与物理键 down/up 不同。

## 相关

keyInput · sendKeys · waitKeyboard · imeControl · step-runner-get
