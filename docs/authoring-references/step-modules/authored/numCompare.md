# sys:numCompare

> **分类**：计算与数据结构 · **来源**：仓库手写 · **官方**：[numcompare](https://getquicker.net/KC/Help/Doc/numcompare)

**用途**：比较两数关系，供 `if` / `simpleIf` 分支（已废弃；优先 `evalexpression` 或 `simpleIf` 内 `$=`）。

## 示例

### 大于判断

```json
{
  "stepRunnerKey": "sys:numCompare",
  "inputParams": {
    "param1.var": "数量",
    "type": ">",
    "param2": "0"
  }
}
```

### 区间上界

```json
{
  "stepRunnerKey": "sys:numCompare",
  "inputParams": {
    "param1.var": "得分",
    "type": "<=",
    "param2.var": "满分"
  }
}
```

## 陷阱

- `type`: `>`/`=`/`</`>=`/`<=`/`!=`；无独立 output，结果供后续 if 子树使用（旧设计器模式）。
- 新步骤：`simpleIf` + `$={数量} > 0` 或 `strCompare`/`evalexpression`。

## 相关

evalexpression · simpleIf · strCompare · step-runner-get
