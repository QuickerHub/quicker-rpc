# sys:form

> **分类**：界面交互 · **来源**：仓库手写 · **官方**：[form](https://getquicker.net/KC/Help/Doc/form)

**用途**：多字段表单一次编辑变量或词典键值。

**何时读**：`get` 定工作模式后；`formDef` 外链或动态表单前读。复杂表单定义见 **form-spec**。

## wire 要点

| param | wire | notes |
|-------|------|-------|
| 工作模式 | 编辑变量 / 词典 / 动态词典 | 词典模式须预先存在键 |
| 表单定义 | inline / `formDef.file` | 长定义 → `files/*.txt`（form-spec） |
| 词典变量 | 词典模式必填 | 编辑已有键，非自动建键 |
| 取消后停止 | true | 取消则中止后续步骤 |

动态提示刷新：字段扩展设置加 `refresh_help`。

## 模式

| 模式 | 用途 |
|------|------|
| 编辑动作变量 | 设置界面、状态变量 |
| 编辑词典数据 | 改词典内若干键 |
| 编辑词典（动态） | 运行时生成 formDef |

## 示例

```json
{
  "stepRunnerKey": "sys:form",
  "inputParams": {
    "工作模式": "编辑动作变量的值",
    "formDef.file": "files/settings-form.txt",
    "窗口标题": "Settings"
  }
}
```

## 相关

form-spec · step-runner-get · store-settings · action-project-files
