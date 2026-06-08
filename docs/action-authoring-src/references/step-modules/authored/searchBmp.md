# sys:searchBmp

> **分类**：图片 · **来源**：仓库手写 · **官方**：[searchbmp](https://getquicker.net/KC/Help/Doc/searchbmp)

**用途**：屏幕/窗口找图、找色、找字（返回坐标，不自动点击）。

**何时读**：`get` 定类型（文件图/变量图/颜色/OCR）与查找范围前读。

## wire 要点

| 类型 | 要点 |
|------|------|
| 查找图片 | 多路径每行一个，先匹配先停；用 **png/bmp** 勿 jpg |
| 查找颜色 | 目标色值 |
| 查找范围 | 主屏 / 当前窗口 / `left,top,right,bottom` |
| 定位位置 + XY偏移 | 返回点在位图锚点 |

截图时勿悬停变色。自动点击用 `mouse`「移动到位图」类操作（不返坐标）。

## 相关

basic-ocr · screenCapture · mouse · step-runner-get
