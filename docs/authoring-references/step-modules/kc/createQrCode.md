# sys:createQrCode

> **分类**：图片 · **来源**：KC 官方文档（`npm run docs:modules:gen`）· [createqrcode](https://getquicker.net/KC/Help/Doc/createqrcode)

**用途**：Encode text into a QR code image

根据指定的文本内容生成二维码图片。

[image: image.png]

# 参数

## 输入

【文本】要转换为二维码的文字。

【每模块像素数】二维码图片中每个模块点的像素数量，数量越大生成的图片越大。

【暗色】二维码暗点颜色，格式为#AARRGGBB。

【亮色】二维码背景颜色，格式为#AARRGGBB。

【图标】二维码中心位置显示的图标，可以为图片变量或图片文件路径（仅支持本地计算机路径，不支持网址）。

【图标占比】图标在二维码中所占尺寸。

【图标边框宽度】！！*此参数似乎无效。*

【绘制外框】是否在二维码外面生成边框。

## 输出

【二维码】生成的二维码图片。

