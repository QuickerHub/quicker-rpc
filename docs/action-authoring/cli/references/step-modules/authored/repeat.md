# sys:repeat

> **分类**：程序流控制 · **来源**：仓库手写 · **官方**：[repeat](https://getquicker.net/KC/Help/Doc/repeat)

**用途**：按次数重复执行子步骤，可选条件提前中止。

## 示例

### 固定次数循环

```json
{
  "stepRunnerKey": "sys:repeat",
  "inputParams": {
    "count": 10
  },
  "outputParams": {
    "count": "当前序号"
  }
}
```

### 带中止条件

```json
{
  "stepRunnerKey": "sys:repeat",
  "inputParams": {
    "count": 100,
    "stopCondition": "$={完成}"
  },
  "outputParams": {
    "count": "当前序号"
  }
}
```

## 陷阱

- 子步骤挂在 **repeat 的 children**；输出 `count` 为循环序号（受 `startIndex` 影响）。
- `count: -1` 无限循环，务必配 `stopCondition` 或内部 `break`；`stopCondition` 用 **`$=`** 布尔表达式，每轮开始检查。
- 遍历列表用 `each`；`repeatDelayMs` 防 CPU 空转；`progressBarTitle` 显示进度条。

## 相关

each · break · continue · if · group · step-runner-get
