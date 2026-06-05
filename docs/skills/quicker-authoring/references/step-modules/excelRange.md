# sys:excelRange

> **分类**：第三方软件 · **官方**：[excelrange](https://getquicker.net/KC/Help/Doc/excelrange)

**用途**：Read/write Excel ranges and cells

## 要点（摘自官方文档）

操作Excel工作表中某个区域。

本模块通过Microsoft.Office.Interop接口调用Excel功能，需要本机安装Excel和相关组件。

“区域”对应于[Range接口](https://docs.microsoft.com/zh-cn/dotnet/api/microsoft.office.interop.excel.range?view=excel-pia)，可以阅读官方文档了解更多信息。

注意：

- 因权限原因，Quicker只能操作通过Quicker打开的excel工作簿。请使用此动作：https://getquicker.net/sharedaction?code=efa8a4af-4a87-4d52-d718-08d827485760
- 同VBA一样，使用编程方式更改Excel内容后，Excel将无法撤销更改。可以在进行编程修改之前保存文件，修改后如果不理想可以不保存。
- 因本人对VBA熟悉程度有限，相关封装的内容又特别多，所以可能会存在bug或不符合预期的情况，欢迎反馈指出，谢谢！

您可能需要对VBA有一定的了解才能比较好的使用本模块。

【区域】

指定要操作的区域。可以通过下面的方式之一指定：

- 通过变量或表达式传入Range对象。
- 不填写内容：表示当前Excel窗口中选定的区域。
- 填写“used”（不写引号）：表示当前Excel窗口工作表中使用的整个区域。内部实现：通过当前工作表的UsedRange属性得到。
- 填写指定区域范围的文本，如“A1:E9”“A1”等（不写引号）。内部实现：通过当前工作表的Range属性(VBA文档)得到。

【限定子范围】

有的情况下，可能需要将要操作的目标限定为“区域”参数的一个子区域，如“第一行”“第一列”，或里面的一个单元格。这时候可以通过“限定子范围”进一步限定操作目标。

可选的参数值如下：

- 整个区域：【区域】参数所指定的整个范围。
- 区域内的第一行
- 区域内的第一列
- 区域内的最后一行
- 区域内的最后一列
- 活动单元格：当前工作表的活动单元格（处于录入焦点的单元格）
- 整行：对应于Region.EntireRow属性。在需要调整行高的时候，需要对整行进行调整。
- 整列：对应于Region.EntireColumn属性。在需要调整列宽的时候，需要对整列进行调整。
- 所有行(区域范围内)：对应于Region.Rows 属性。
- 所有列(区域范围内)：对应于Region.Columns属性。
- 指定单元格：使用“cell:行序号数字,列序号数字”指定单元格位置。（相对于“区域”参数指定的位置左上角单元格的偏移，可以是“区域”参数外面的位置）。此时也可以使用插值或表达式拼接文本结果。下图所使的

【操作类型】

要执行的操作类型：

- 设置值：为区域的单元格赋值。内部实现为：为Region.Value属性赋值。
- 设置公式：为区域的单元格设置公式。内部实现为：为 Region.Formula 属性赋值。与在编辑栏（包括等号）中显示时的格式相同，如：“=RAND()*100000”
- 设置数值格式：设置单元格格式。内部实现为：为Range.NumberFormat 属性赋值。格式代码是在 设置单元格格式对话框中 格式代码选项相同的字符串。
- 行高,列宽：为区域设置行高列宽，格式为“行高,列宽”

- 行高可以指定的值：

- -（横线符号）：表示不更改行高；
- auto：表示自适应行高；
- std：表示默认行高；
- 整数数字：以磅为单位的行高值。

- 列宽可以指定的值：

- -（横线符号）：表示不更改列宽；
- auto：表示自适应列宽；
- std：表示默认列宽；
- 整数数字：指定具体的宽度数值。一个列宽单位等于"常规"样式中一个字符的宽度。对于比例字体，则使用字符 0（零）的宽度。

- 设置格式：为区域设置格式，每行一个格式。详细格式定义请参考本文后面部分。
- 调用方法：调用Range对象的方法，每行一个方法。详细说明请参考本文后面的部分。
- 获取区域信息：获取区域的值/公式/格式/信息/对象引用等数据。

在【格式】参数中设定格式内容，每行一个，形式为“格式名称=格式值”。

支持的格式如下：

| 格式名称 | 说明 | 示例 |
| --- | --- | --- |
| Style | 风格名 |  |
| Font.Name | 字体名称 | 楷体 |
| Font.Size | 字号 | 24 |
| Font.Bold | 是否粗体，1表示是，0表示否。下面的所有“是”“否”类型的参数，都是使用这两个数字表示是或否。 |  |
| Font.Italic | 是否斜体 |  |
| Font.Strikethrough | 是否显示删除线 |  |
| Font.Superscript | 是否为上标 |  |
| Font.Subscript | 是否为下标 |  |
| Font.FontStyle | 字体样式文本 |  |
| Font.Color | 字体颜色 | #FF0000 |
| Font.Underline | 下划线类型，可用值： xlUnderlineStyleNone  无 xlUnderlineStyleSingle  单下划线 xlUnderlineStyleDouble  粗双下划线 xlUnderlineStyleSingleAccounting 紧靠在一起的两条细下划线 [参考](https://docs.microsoft.com/zh-cn/dotnet/api/microsoft.office.interop.excel.xlunderlinestyle?view=excel-pia) |  |
| Interior.Color | 单元格底色 | #A0A0A0 |
| ShrinkToFit | 是否缩小文字适应单元格大小 |  |
| VerticalAlignment | 垂直居中，可用值： xlVAlignBottom 底端对齐 xlVAlignCenter 居中 xlVAlignDistributed 分散对齐 xlVAlignJustify 两端对齐 xlVAlignTop 向上 [参考](https://docs.microsoft.com/zh-cn/dotnet/api/microsoft.office.interop.excel.xlvalign?view=excel-pia) |  |
| HorizontalAlignment | 水平居中，可用值： xlHAlignCenter 居中 xlHAlignCenterAcrossSelection 跨列居中。 xlHAlignDistributed 分散对齐。 xlHAlignFill 填充。 xlHAlignGeneral 按数据类型对齐。 xlHAlignJustify 两端对齐。 xlHAlignLeft 靠左。 xlHAlignRight 靠右。 |  |
| Orientation | 文本角度，是-90到90之间的数字。或者下面的值： xlDownward	从上到下 xlHorizontal 从左到右 xlUpward	从下到上 xlVertical 从上到下并且在单元格中居中 | 30 |
| WrapText | 是否换行 |  |
| Borders.All | 所有边框的风格。格式为英文逗号分隔的3个参数值：LineStyle,Weight,Color **LineStyle可选值：** xlContinuous	实线。 xlDash	虚线。 xlDashDot	点划相间线。 xlDashDotDot	划线后跟两个点。 xlDot	点线。 xlDouble	双线。 xlLineStyleNone	无线。 xlSlantDashDot	倾斜的划线。 Weight（宽度）可选值： xlHairline	极细 xlThin 细 xlMedium	中等. xlThick	粗 Color为#RRGGBB格式的颜色。 |  |
| Borders.*BorderIndex * | 单独设置某一类边框的风格。 BorderIndex可能是下面的某一个： xlDiagonalDown xlDiagonalUp xlEdgeBottom xlEdgeLeft xlEdgeRight xlEdgeTop xlInsideHorizontal xlInsideVertical 值的格式与Borders.All相同，都是LineStyle,Weight,Color [https://docs.microsoft.com/zh-cn/office/vba/api/excel.xlbordersindex](https://docs.microsoft.com/zh-cn/office/vba/api/excel.xlbordersindex) |  |

调用Range对象的某一个方法。请参考VBA文档中Range对象的各个方法的说明获取详细信息。

每行一个方法，格式为：“方法名(不需要参数的方法):”或“方法名:参数1,参数2....”

简单方法：

| 方法 | 说明 |
| --- | --- |
| Activate: | 激活当前选中区域中的一个单元格。 被操作对象必须是一个单元格并且在选中范围内。如果要选中一个区域，使用Select:方法 [链接](https://docs.microsoft.com/zh-cn/office/vba/api/excel.range.activate) |
| AddComment:备注文字 | 给区域添加备注 |
| ApplyOutlineStyles: | 对指定区域应用分级显示样式 |
| AutoFill:目标区域,填充类型 | 目标区域：必须包含当前区域。可以使用类似A1:E9的格式。 填充类型：可选值请参考文档[https://docs.microsoft.com/en-us/office/vba/api/excel.xlautofilltype](https://docs.microsoft.com/en-us/office/vba/api/excel.xlautofilltype) |
| AutoFit: | 自适应尺寸。必须对“整列”或“整行”区域上执行。 |
| AutoOutline: | 自动为指定区域创建分级显示。如果区域为单个单元格，Microsoft Excel 将创建整个工作表的分级显示。新分级显示将取代所有的分级显示。 |
| Calculate: | 计算选择区域的公式 |
| CalculateRowMajorOrder: | 按单元格的左上角到右下角 (按行主要顺序) 计算指定范围的单元格 |
| Clear: | 清除整个区域 |
| ClearComments: | 清除指定区域的所有单元格批注 |
| ClearContents: | 清理区域中的公式和值 |
| ClearFormats: | 清除区域的格式设置 |
| ClearHyperlinks: | 删除指定区域中的所有超链接 |
| ClearNotes: | 清除指定区域中所有单元格的批注和语音批注 |
| ClearOutline: | 清除指定区域的分级显示 |
| Copy: Copy:目标区域 | 复制区域。如果未指定目标区域，则复制到剪贴板。 |
| Cut: Cut:目标区域 | 将对象剪切到剪贴板，或者将其粘贴到指定的目的地。 |
| CopyPicture:*Appearance,Format* | 将所选对象作为图片复制到剪贴板 Appearance的可选值：xlScreen（屏幕），xlPrinter（打印） *Format*的可选值：xlBitmap（位图），xlPicture（矢量图） |
| Delete: Delete:移动方向 | 删除区域。“移动方向”如何移动单元格来替换删除的单元格。可选值： xlShiftToLeft或xlShiftUp。 如果省略此参数，Excel 将根据区域的形状确定调整方式。 |
| Dirty: | 强制下次重新计算发生时计算这个区域 [https://docs.microsoft.com/en-us/office/vba/api/excel.range.dirty](https://docs.microsoft.com/en-us/office/vba/api/excel.range.dirty) |
| FillDown: | 从指定区域的顶部单元格开始向下填充，直至该区域的底部。 区域中首行单元格的内容和格式将复制到区域中其他行内。 |
| FillLeft: | 从右向左，从指定范围中的单元格的最右侧的单元格的填充。 内容和格式的单元格或单元格区域的右边的列会复制到区域中的列的其余部分。 |
| FillRight: | 从指定区域的最左边单元格开始向右填充。 区域中最左列单元格的内容和格式将复制到区域中其他列内。 |
| FillUp: | 填满从底部单元格或指定范围中的单元格区域的顶部。 内容和格式的单元格或单元格区域的底部行中会复制到区域中的行的其余部分。 |
| FunctionWizard: | 对指定区域左上角单元格启动“函数向导” |
| Insert:Shift,CopyOrigin | 插入单元格或区域。 Shift：可选。可以是下列的**XlInsertShiftDirection** 常量之一: xlShiftToRight或xlShiftDown。 如果省略此参数，Microsoft Excel 将根据区域的形状确定调整方式。 CopyOrigin：可选。副本源;也就是说, 从何处复制插入单元格的格式。 可以是下列的**XlInsertFormatOrigin** 常量之一: xlFormatFromLeftOrAbove (默认值) 或xlFormatFromRightOrBelow。 |
| InsertIndent:缩进量 | 向指定的区域添加缩进量。如果用本方法将缩进量设置为一个小于 0（零）或大于 15 的值，将出错。 |
| Pars…

## 相关

`step-modules` · `step-runner-get` · `implementation-fallback`
