# sys:jsscript

> **分类**：脚本与代码 · **来源**：仓库手写 · **官方**：[jsscript](https://getquicker.net/KC/Help/Doc/jsscript)

**用途**：Jint 执行 JS（`exec()` 入口）。

**何时读**：写 `exec`、变量读写、AllowClr 前读。

## 协议

```javascript
function exec() {
  var v = quickerGetVar('name');
  quickerSetVar('name', 'Hello, ' + v);
  return 0; // 非 0 = 失败
}
```

| API | 说明 |
|-----|------|
| `quickerGetVar` / `quickerSetVar` | 部分变量类型；列表/词典为副本，改完须 Set 回 |
| `log` / `alert` | 调试（1.43.7+） |
| AllowClr | 允许 JS 访问 .NET BCL |

## 相关

csscript · step-runner-get · implementation-fallback
