# sys:readFile

> **分类**：文件与目录 · **来源**：KC 官方文档（`npm run docs:modules:gen`）· [readfile](https://getquicker.net/KC/Help/Doc/readfile)

**用途**：Read text or image from file

读取指定文件的内容。目前支持文本文件和图片文件的读取。

[image: image.png]

# 参数

## 输入

【文件路径】要读取文件的完整路径。

【格式】文件内容格式，可选“文本”“图片”。 格式为“图片”时，支持的文件类型：.jpg, .png, .bmp, .tiff。

【文件编码】如果是读取的文本文件，可选文本编码格式。

## 输出

【文本内容】读取的文本文件内容。

【图片内容】读取的图片。

