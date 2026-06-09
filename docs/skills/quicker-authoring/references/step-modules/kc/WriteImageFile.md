# sys:WriteImageFile

> **分类**：图片 · **来源**：KC 官方文档（`npm run docs:modules:gen`）· [writeimagefile](https://getquicker.net/KC/Help/Doc/writeimagefile)

**用途**：Write image variable to file

将图片写入文件。

支持的图片格式类型：.jpg, .png, .bmp, .tiff

[image: image.png]

# 参数

## 输入

【内容】要写入文件的图片。

【文件路径】完整的图片文件路径。必须使用包含完整文件名的路径。Quicker将根据后缀名判断保存文件的格式。

【图片质量】当保存格式为jpg格式时，指定图片质量，可选范围 10-100。数字越小，图片压缩程度越高，文件越小，图片质量越差。(1.5.7之后加入)

# 更改历史

- 1.5.7 增加图片质量参数。
