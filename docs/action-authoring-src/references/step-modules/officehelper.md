# sys:officehelper

> **分类**：第三方软件 · **官方**：[officehelper](https://getquicker.net/KC/Help/Doc/officehelper)

**用途**：Helper ops for Office apps (e.g. run VBA)

## 要点（摘自官方文档）

本模块为测试状态，欢迎反馈问题。

对当前Office软件窗口执行VBA宏代码、对文档或选定对象设置格式等。

特别感谢网友**@Zetalpha**，执行VBA脚本功能主要参考Zetalpha的子程序实现。

如果您在使用中遇到什么问题，欢迎通过官网讨论区反馈。

提示：

- 本步骤使用低权限方式运行，不能用于使用“管理员身份”启动的Office或wps程序。
- 如果禁用系统UAC（用户账户控制设置），可能会影响本模块的运行。

**前置条件：**

- Office 系列软件需要开启【信任对 VBA 工程对象模型的访问】选项。
- WPS 软件需要安装VBA模块，并开启【信任对于“Visual Basic项目”的访问】选项。
- 以上选项开启方法请参考本文。

**注意事项：**

- WPS产品因为其版本众多，每个版本所包含的组件不同，兼容性差异较大，不一定能正常运行。
- 因为底层COM接口的限制，如果同时开启了多个同名进程，可能会获取到错误的活动文档。
- Excel 软件执行VBA代码后，将会丢失撤销(undo)历史，无法进行撤销操作。因此，请先备份好重要数据，再使用VBA代码。
- 通过Quicker启动运行的Excel程序会被提权，导致无法控制。请从Windows启动Excel，或通过打开Excel文档的方式开启Excel。

参考演示：[录制宏并转换为动作](https://getquicker.net/Sharedaction?code=4d774256-f3fa-4c61-72c6-08dac59559d0)

## 参数

**【应用程序】**选择要执行VBA代码的程序。

支持如下选项：

**【VBA宏名称或代码】**

- 如需执行文档中已有的宏，填写宏的名称。
- 否则填写完整的宏代码。通常是这样的格式：

```vbnet
Sub 宏名称()
    '宏代码
End Sub
```

您可以在Excel、Word中录制宏，然后将代码修剪后（录制的代码经常会有一些没有什么用的部分）复制到动作中使用。

如需返回内容，请声明Function。如下示例返回Word文档路径：

```plain
Function GetDocumentFullName() As String
   GetDocumentFullName = ActiveDocument.FullName
End Function
```

自1.39.32版本起，VBA脚本支持不在第一行的sub、function，会自动查找到第一个。支持在第一行使用`'main:主程序sub或function名`的方式指定要执行的主要sub或function。(建议不要修改已有动作，避免旧版本Quicker无法支持）

**【等待执行结束】**

是否等待执行结束后再继续后面的步骤。

如果不等待，在VBA代码执行中遇到的问题将不会有提示和报错。

**【失败后停止动作】**

执行出错后是否停止动作的运行。

【返回内容】

从`Function`方法中返回的内容。1.39.31+版本支持。

概述：

- 本功能有点复杂，需要手写对象名称。需要您对VBA对象模型有一定的了解，并且善于查阅微软官方文档以了解各个对象类型的属性和方法。
- 用于对Word/WPS文字、PowerPoint/WPS演示的特定对象设置属性（如对选中文字设置字体、段落格式）。本功能暂不支持Excel/WPS表格。
- 本功能不需要在Office软件中开启【信任对 VBA 工程对象模型的访问】选项。
-
- 可参考通过录制宏得到的代码。

## 参数

**【应用程序】**

选择程序类型。目前不支持Excel和WPS表格。

**【格式设置/对象属性赋值】**

用于设置对象属性值的代码。其语法如下：

- 顶格写对象名称。（支持的对象请参考本文后续章节说明）
- 通过缩进方式指定要设置的属性（以及下一级属性）。也可以将多个层级的属性名合并在一行，如.Font.Fill.ForeColor.RGB = #FF0000（设置字体的颜色）。缩进字符的数量没有限制，只要同一级别的内容缩进位置相同即可。
- 通过.属性名 = 属性值的方式赋值。
- 对象名、属性名大小写不敏感。
- 每个对象类型所支持的属性，可以参考VBA文档，或通过查看录制宏所生成的代码了解。
- 也可以通过.方法名: 参数1,参数2,....的形式调用参数类型明确的简单方法。
- 对可枚举类型(IEnumerable)类型的对象，可以使用.*表示其每个元素。用于对该枚举对象的每个元素调用相同的处理。
- 可以在行的开始使用//注释一行
- 布尔类型属性，可以使用!表示对当前值取反。示例动作

注：本功能通过c#的反射机制查找属性和方法名称，并根据其类型定义转换属性值。有的参数类型可能无法正常转换。

**【等待执行结束】**

是否等待执行结束后再继续后面的步骤。如果不等待，将会忽略所遇到的任何错误。

## Word 支持说明

### 所支持的对象列表

| **对象名称** | **说明** | **文档链接** |
| --- | --- | --- |
| Application | Word应用程序对象。 | [VBA](https://learn.microsoft.com/en-us/office/vba/api/word.application) |
| Doc | 当前活动文档。 为Application.ActiveDocument的别名。 | [VBA](https://learn.microsoft.com/en-us/office/vba/api/word.application.activedocument) |
| PageSetup | 当前文档的页面设置。 为Application.ActiveDocument.PageSetup 的别名。 | [VBA](https://learn.microsoft.com/en-us/dotnet/api/microsoft.office.interop.word.pagesetup?view=word-pia) |
| Selection | 当前选择的内容。 为Application.Selection的别名。 | [VBA](https://learn.microsoft.com/en-us/office/vba/api/word.application.selection) |
| Selection.Font | 当前选择内容的字体格式设置。 为Application.Selection.Font的别名。 | [VBA](https://learn.microsoft.com/en-us/office/vba/api/word.selection.font) |
| Selection.P | 当前选择内容的段落格式设置。 为Application.Selection.ParagraphFormat的别名。 | [VBA](https://learn.microsoft.com/en-us/office/vba/api/word.selection.paragraphformat) |
| Styles.样式名 如：styles.标题 1 | 某个样式。 用于更新文档中某个样式的字体、段落等设置。 | [VBA](https://learn.microsoft.com/en-us/office/vba/api/word.style) |
| StyleByText | 根据段落文本内容设置段落的样式。用于自动排版功能中，识别标题段落并自动设置成对应的标题样式。 | 见本文后面部分。 |

### Styles.样式名 ：设置样式的文字和段落格式

样式名可以使用Word的[内置样式名](https://learn.microsoft.com/en-us/dotnet/api/microsoft.office.interop.word.wdbuiltinstyle?view=word-pia)（如`wdStyleHeading1`对应于“标题 1”）或中文样式名（如“标题 1”）。注意，样式名中间的空格需要保留，不然无法匹配。

示例：

```plain
Styles.正文
	.Font
		.Name = "仿宋"
		.Size = 16
		.Color = wdColorAutomatic
	.ParagraphFormat
		.Alignment = wdAlignParagraphLeft
		.LineSpacingRule = wdLineSpaceExactly
		.LineSpacing = 29
		// 首行缩进
		.CharacterUnitFirstLineIndent = 0
		.MirrorIndents = 0
		.SpaceBefore = 0
		.SpaceAfter = 0

Styles.标题 1
	.Font
		.Name = "黑体"
		.Size = 16

Styles.标题 2
	.Font
		.Name = "楷体"
		.Size = 16

Styles.标题 3
	.Font
		.Name = "仿宋"
		.Size = 16
```

### StyleByText ：根据文字内容设置段落样式

公文排版标准对各级别标题的样式做了规定。 因此，可以根据段落的文字内容倒推判断其所对应的标题级别，。设置方法：

```plain
StyleByText
	.样式名1 = "正则表达式(C#语法)"
	.样式名2 = "正则表达式(C#语法)"
	...更多规则
```

示例：

```plain
StyleByText
	.标题 1 = "^\s*[一二三四五六七八九十]{1,3}、[^\r]*"
	.标题 2 = "^\s*（[一二三四五六七八九十]{1,3}）[^\r]*"
	.标题 3 = "^\s*\d+[\.]([^。\\r：])*[。]{0,1}"
	.标题 4 = "^\s*（\d+）([^。\\r：])*"
```

### Selection 选中区域

设置选中内容的样式：

```plain
selection
	.style = "标题 1"
```

清除选中内容的格式 (结尾的冒号表示调用方法）：

```plain
Selection
	.ClearFormatting:
```

设置高亮显示颜色（[可选值](https://learn.microsoft.com/en-us/office/vba/api/word.wdcolorindex)）：

```plain
selection
	.Range.HighlightColorIndex = wdYellow
```

### PageSetup 页面设置

```plain
PageSetup
        .LineNumbering.Active = False
        .Orientation = wdOrientPortrait
        .TopMargin =  CentimetersToPoints(2)
        .BottomMargin = CentimetersToPoints(3)
        .LeftMargin = CentimetersToPoints(4)
        .RightMargin = CentimetersToPoints(5)
        .Gutter = CentimetersToPoints(0)
        .HeaderDistance = CentimetersToPoints(1.5)
        .FooterDistance = CentimetersToPoints(1.75)
        .PageWidth = CentimetersToPoints(21)
        .PageHeight = CentimetersToPoints(29.7)
        .FirstPageTray = wdPrinterDefaultBin
        .OtherPagesTray = wdPrinterDefaultBin
        .SectionStart = wdSectionNewPage
        .OddAndEvenPagesHeaderFooter = False
        .DifferentFirstPageHeaderFooter = False
        .VerticalAlignment = wdAlignVerticalTop
        .SuppressEndnotes = False
        .MirrorMargins = False
        .TwoPagesOnOne = False
        .BookFoldPrinting = False
        .BookFoldRevPrinting = False
        .BookFoldPrintingSheets = 1
        .GutterPos = wdGutterPosLeft
        .LayoutMode = wdLayoutModeLineGrid
```

注：上面的代码主体是通过录制宏得到的。

长度/尺寸数值可以直接使用VBA代码中的`CentimetersToPoints(厘米数)`，也可以使用`5.2cm`这样的格式。如使用下面的代码设置一个常规公文文档的页边距：

```plain
PageSetup
        .TopMargin = 3.7cm
        .BottomMargin = 3.5cm
        .LeftMargin = 2.8cm
        .RightMargin = 2.6cm

…

## 相关

`step-modules` · `step-runner-get` · `implementation-fallback`

