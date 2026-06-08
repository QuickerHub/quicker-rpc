# sys:imgProcess

> **分类**：图片 · **来源**：仓库手写 · **官方**：[imgprocess](https://getquicker.net/KC/Help/Doc/imgprocess)

**用途**：缩放、旋转、灰度、反色、组合处理、生成 ico 等。

**何时读**：`get` 定「操作类型」后；「组合处理」多行参数前读。

## wire 要点

| param | wire | notes |
|-------|------|-------|
| 图片 | 图片变量或路径 | |
| 操作类型 | `controlField` | 缩小/旋转/组合处理等 |
| 缩小比例 / 最大宽高 | 像素或 % | 保持长宽比；`0` 一边自动 |
| 旋转方式 | 0–7 或 `99` Exif | 见 get 对照表 |
| 处理参数 | 组合处理时多行 | 每行一步；参考 ImageProcessor 语义 |

## 模式

| 操作 | 要点 |
|------|------|
| 复制图片 | 先复制再 destructive 操作 |
| 组合处理 | `处理参数` 行式流水线 |
| 生成图标 | 输出 ico 路径 |

部分操作原地改图，无「结果图片」输出。

## 相关

screenCapture · basic-ocr · searchBmp · step-runner-get
