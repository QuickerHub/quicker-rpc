# sys:basic-ocr

> **分类**：图片 · **来源**：仓库手写 · **官方**：[basic-ocr](https://getquicker.net/KC/Help/Doc/basic-ocr)

**用途**：图片 OCR（在线服务或离线引擎）。

**何时读**：选型在线/离线、表格识别、找字坐标前读。

## wire 要点

| param | wire | notes |
|-------|------|-------|
| 图片变量 | 变量 / 路径 / base64 | 越小越快 |
| 离线模式 | 自动 / 仅在线 / 仅离线 | 循环自动化用离线；偶发用在线 |
| 语言 | 中英/英/日/韩/繁体等 | 与图内文字匹配 |
| 合并段落 | 多行→段 | 按句末标点 |
| 识别表格 | 表格模式 | 输出结构化表格变量 |

## 模式

| 引擎 | 适用 |
|------|------|
| 在线 | 免安装；免费版限速/日限额 |
| 离线 | 专业版佳；无网；支持找字；**勿**多线程并行调用 |

表格 OCR、坐标找字等子模式见 get `controlField`。


## 示例

<!-- QuickerModuleDoc examples -->

### 截图识别并自动复制结果

```json
{
  "stepRunnerKey": "sys:basic-ocr",
  "inputParams": {
    "imgVar.var": "img",
    "lang.var": "lang"
  },
  "outputParams": {
    "content": "text"
  }
}
```
## 相关

mathocr · searchBmp · imgProcess · step-runner-get
