# sys:flauiautomation

> **分类**：系统与窗口 · **来源**：KC 官方文档（`npm run docs:modules:gen`）· [uiautomation](https://getquicker.net/KC/Help/Doc/uiautomation)

**用途**：UI automation via FlaUI

# 概述

使用Windows UIAutomation技术触发窗口界面元素。

Quicker目前提供了两个窗口界面控制模块。

[image]

**窗口界面控制：**

- 基于.Net自带接口实现。
- 通过控件名称和类型定位控件。有的界面需要较长定位时间，这期间会造成界面卡顿。
- 不支持有多个控件同名的情况。

**窗口界面控制（FlaUI）：**

- 基于FlaUI库实现。
- 提供了通过XPath来定位控件的能力。

本文档包含这两个模块的内容说明。

**注意：**

- 由于每个软件实现方式不同，对UIAutomation支持程度不同，此功能只能在一部分软件中、或者软件的一部分界面中使用。具体是否可用，需要您测试判断。
- 即便在可用的软件中，根据窗口状态的不同，也可能无法正常触发。
- 如果有多个步骤，需要在步骤中间增加必要的等待时间，等待界面准备好接受下一步的操作。
- 对于比较复杂的界面，查找控件的时间可能会比较长。

### 辅助工具

- 可以使用Windows SDK中提供的inspect.exe程序查看界面元素的信息（特别是控件的“名称”）。详见本页面底部的下载链接。
-

# A. 窗口界面控制

[image]

## 主要参数

【操作类型】选择要执行的操作。可选的操作类型有：

- 触发窗口菜单
- 触发窗口控件
- 获取窗口控件信息
- 获取鼠标指针位置控件信息
- 获取焦点控件信息
- 更新“另存为”或“打开”对话框的路径。

【窗口】要操作哪个窗口的控件。不填写表示使用前台窗口；也可以输入窗口句柄数字。

## 触发窗口菜单

用于触发软件的菜单项。

[image]

上图的设置用于触发下面的菜单。

[image]

**参数**

【菜单路径】需要展开或点击的所有菜单项的名称，每行指定一个。菜单名称需要完全匹配。菜单名称不能存在重复。

【展开延时】上级菜单展开后到下级菜单可用中间需要等待的时间。每个软件可能需要等待的时间不同。

## 触发窗口控件

[image]

上面的截图用于定位资源管理器里的“选项”按钮。

[image]

**参数**

【控件名】

使用inspect.exe 查看到的控件名。如果有重复，会返回查找到的第一个控件。

控件名通常是控件上显示的文字，可能会随按钮状态改变而改变。

可能有多个控件具有相同的名字，但是他们类型不同。这时候可以使用“控件类型”参数进一步筛选。

【控件类型】

要查找控件的类型，用于在有名称相同类型不同的控件时加以区分。

[image]

如果希望通过变量动态传递控件类型，需要传入这样的值（类型后面的数字）：

internal enum ControlTypes
    {
      Button = 50000, // 0x0000C350
      Calendar = 50001, // 0x0000C351
      CheckBox = 50002, // 0x0000C352
      ComboBox = 50003, // 0x0000C353
      Edit = 50004, // 0x0000C354
      Hyperlink = 50005, // 0x0000C355
      Image = 50006, // 0x0000C356
      ListItem = 50007, // 0x0000C357
      List = 50008, // 0x0000C358
      Menu = 50009, // 0x0000C359
      MenuBar = 50010, // 0x0000C35A
      MenuItem = 50011, // 0x0000C35B
      ProgressBar = 50012, // 0x0000C35C
      RadioButton = 50013, // 0x0000C35D
      ScrollBar = 50014, // 0x0000C35E
      Slider = 50015, // 0x0000C35F
      Spinner = 50016, // 0x0000C360
      StatusBar = 50017, // 0x0000C361
      Tab = 50018, // 0x0000C362
      TabItem = 50019, // 0x0000C363
      Text = 50020, // 0x0000C364
      ToolBar = 50021, // 0x0000C365
      ToolTip = 50022, // 0x0000C366
      Tree = 50023, // 0x0000C367
      TreeItem = 50024, // 0x0000C368
      Custom = 50025, // 0x0000C369
      Group = 50026, // 0x0000C36A
      Thumb = 50027, // 0x0000C36B
      DataGrid = 50028, // 0x0000C36C
      DataItem = 50029, // 0x0000C36D
      Document = 50030, // 0x0000C36E
      SplitButton = 50031, // 0x0000C36F
      Window = 50032, // 0x0000C370
      Pane = 50033, // 0x0000C371
      Header = 50034, // 0x0000C372
      HeaderItem = 50035, // 0x0000C373
      Table = 50036, // 0x0000C374
      TitleBar = 50037, // 0x0000C375
      Separator = 50038, // 0x0000C376
      SemanticZoom = 50039, // 0x0000C377
      AppBar = 50040, // 0x0000C378
    }

【动作】

找到控件后需要执行的操作。每个控件所支持的操作类型有所不同，您需要进行测试以判断使用哪个操作可以达到目标结果。

[image]

选择“自动”类型，将会依次尝试这些操作，直到其中的一个执行成功：调用、切换选中状态、选择、展开、点击。

## 获取窗口控件信息

获取指定控件的信息。

[image]

【位置】输出控件的范围，格式为：Left,Top,Right,Bottom

【值】控件的值或文字等信息。

【控件类型】输出控件类型的名称。此名称不一定和inspect.exe程序中得到的一样😂。

【控件类型ID】表示控件类型的ID数字。

## 获取鼠标位置的控件信息

获取当前鼠标位置界面元素的信息。

[image]

## 获得焦点控件信息

获得当前拥有输入焦点的控件信息。

## 更新“另存为”或“打开”对话框的路径

[image]

用于快速更改保存或打开路径、文件名。

有这些用法：

- 路径参数为一个文件夹的完整路径：自动切换到这个文件夹下。
- 路径参数为一个带文件名的完整路径：自动保存或打开对应的文件。
- 路径参数为一个文件名：自动另存或打开这个文件名。
- 在支持打开多个文件的对话框中，可以用 "文件名1" "文件名2" 的格式，选择多个文件。

注：有的软件使用非Windows标准文件对话框可能无法控制。如果您遇到请报告给我们以便于寻找兼容方案。

## 示例：

- 将资源管理器切换为大图标模式：https://getquicker.net/sharedaction?code=891b5c11-8f82-4dfd-2e10-08d809d218a4
- 切换Win10的蓝牙开关：https://getquicker.net/sharedaction?code=03585a9b-3378-4f4a-2e14-08d809d218a4
-

# B. 窗口界面控制FlaUI版

[image]

基本原理与基础版“窗口界面控制”相同。

## 参数

【控件XPath或Name】控件相对于窗口的XPath或空间名。使用空间名时将遍历查找控件，会有和基础版“窗口界面控制”相同的限制。

点击右侧的定位按钮，可以从窗口选择控件，获取其XPath。

点击查看视频演示：

https://player.bilibili.com/player.html?bvid=BV1S54y1J79d

## 一些示例场景

更新另存窗口的文件类型：

[image]

# 相关资源

- inspect.exe 程序下载：

- x64版本：https://files.getquicker.net/_sitefiles/_tools/inspect_x64.exe
- x86版本：https://files.getquicker.net/_sitefiles/_tools/inspect_x86.exe

- FlaUInspect 程序：

- 官网：https://github.com/FlaUI/FlaUInspect
- 下载：https://files.getquicker.net/_sitefiles/_tools/FlaUInspect_1.3.0.zip

### 如何通过FlaUInspect获得控件的XPath

启动FlaUInspect时，选择UIA3

[image]

在Mode菜单中开启HoverMode和ShowXPath

[image]

然后鼠标移动到某个窗口上时，按ctrl，FlaUInspect会更新当前位置的窗口、控件信息。

[image]

窗口底部会显示该位置的XPath。

此XPath会包含窗口本身的路径（第一段，如上图的/Window）。Quicker模块中查找XPath时是从窗口本身开始查找，因此需要将此XPath的第一段去除后使用。
