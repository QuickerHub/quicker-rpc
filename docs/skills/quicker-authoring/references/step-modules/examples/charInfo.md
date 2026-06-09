# sys:charInfo

> **来源**：step JSON 示例 · **官方**：[charinfo](https://getquicker.net/KC/Help/Doc/charinfo)

**用途**：获取字符 Unicode 编码与汉字拼音信息。

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
