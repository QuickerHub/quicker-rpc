# sys:charInfo

> **分类**：文本处理 · **来源**：仓库手写 · **官方**：[charinfo](https://getquicker.net/KC/Help/Doc/charinfo)

**用途**：获取单字符 Unicode 编码与汉字拼音（含多音字全部读音输出）。

## 示例

### 单字 Unicode 与拼音

```json
{
  "stepRunnerKey": "sys:charInfo",
  "inputParams": {
    "char": "中"
  },
  "outputParams": {
    "unicodeNum": "Unicode数",
    "unicodeHex": "Unicode十六进制",
    "pinyin": "拼音",
    "pinyinFirstChar": "首字母"
  }
}
```

### 从变量取首字符

```json
{
  "stepRunnerKey": "sys:charInfo",
  "inputParams": {
    "char.var": "待分析文本"
  },
  "outputParams": {
    "pinyinAll": "全部读音",
    "pinyinFirstCharAll": "全部首字母"
  }
}
```

## 陷阱

- 输入多个字符时只分析**第一个**；长文本先截取或用 `char.var` 绑定单字变量。
- `pinyinAll` / `pinyinFirstCharAll` 仅覆盖**常用**多音字，生僻多音字可能不全。

## 相关

stringProcess · evalexpression · step-runner-get
