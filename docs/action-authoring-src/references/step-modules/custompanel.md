# sys:custompanel

> **分类**：界面交互 · **官方**：[custompanel](https://getquicker.net/KC/Help/Doc/custompanel)

**用途**：Show custom floating action panel

## 要点（摘自官方文档）

本模块的目的是为了提供一个可以多次点击按钮触发某项操作（而不会自动关闭）的小窗口。

支持的操作类型：

- 显示操作窗：显示操作窗后继续执行后面的步骤。
- 显示操作窗并等待关闭：显示操作窗，并等待操作窗关闭后，再执行后面的步骤。
- 关闭操作窗：关闭通过窗口标识指定的操作窗。
- 切换展开状态：根据给定的操作窗标识，切换操作窗展开、折叠的状态。
- 获取操作窗状态：根据给定的操作窗标识，返回操作窗状态、窗口句柄。

显示操作窗后继续执行后面的步骤。

## 参数

### 操作项定义

**【操作项定义】**

定义操作窗上所显示的按钮和它们的行为。

数据格式基本与[显示菜单模块的菜单数据](https://getquicker.net/kc/help/doc/showmenu#HkDla)参数一致，请参考该文档，同时注意以下区别：

- 本模块不支持分隔符。
- 当操作类型为“显示操作窗并等待关闭”时，支持使用operation=close&data=返回值方式指定用于关闭操作窗的按钮以及该按钮所需要返回的“操作项数据”值。
- 支持使用operation=sp&spname=子程序名称的形式调用动作中所定义的子程序。更详细的说明请参考本文后面部分。
- 最多支持一级子项。数据通常有两种形式：（1）全部都不带子项，所有操作项按设定的方式平铺排列。（2）首层节点带子项。此时首层节点作为分组处理（可选多种分组方式）。

- 使用[]作为操作项的标题，可以创建按钮占位符，用于在创建按钮时跳过某些位置以便实现特定布局方式。（1.39.42+）

**缩进格式的子项定义**

如下面的定义：

生成的效果如图。 如果按钮本身不需要实现其它操作，可以在标题后面加`|`或`|operation=&data=`表示空操作，这时点主按钮，也可直接展开子项菜单。

示例动作：[CAD命令板 - 动作信息 - Quicker](https://getquicker.net/Sharedaction?code=6085f206-34f6-4ee7-97b7-08db3d4a9dcd)

注：

- 在多行/多列等分组模式下，可以使用__(两个下划线）表示空的分组标题，此时会隐藏标题，减少留白。
- 对于显示子项菜单的右侧按钮[>]，

- 可以通过.dropdown_text=xx方式设定自定义的文字内容。(v1.44.7)
- 可以通过.dropdown_width=30的参数设定右侧按钮的宽度。（v1.44.49)

**默认的按钮右键菜单 (v1.39.32)**

如果按钮所需要的右键菜单类似，可以在步骤中设置“默认的按钮右键菜单”参数。

当菜单调用子程序（operation=sp）时，按钮的相关信息将通过子程序输入变量传入子程序中。

**缩进格式的右击菜单定义**

使用缩进格式时，在按钮条目下，可在缩进后使用  `-`（短横线加空格）作为开始，为CommonOperationItem设置Menu数据。（菜单项的子菜单不再需要添加 `-`)。

注：按钮的右键菜单缩进比按钮本身的缩进多一级。

```plain
[fa:Light_Play]执行动作|operation=action&data=Hello&action=自定义操作窗示例
[fa:Light_Pen]子程序|operation=sp&data=Hello&spname=testsp&num=100
[icon:c:\windows\notepad.exe]记事本|operation=run&data=notepad
[url:https://helperservice.getquicker.cn/favicon/get/baidu.com]打开baidu|operation=open&data=http%3A%2F%2Fbaidu.com
  [url:https://helperservice.getquicker.cn/favicon/get/baidu.com]打开Google|operation=open&data=http%3A%2F%2Fgoogle.com
  - [url:https://helperservice.getquicker.cn/favicon/get/baidu.com]打开Google|operation=open&data=http%3A%2F%2Fgoogle.com
  - ----
  - 子菜单
    [url:https://helperservice.getquicker.cn/favicon/get/baidu.com]打开Google|operation=open&data=http%3A%2F%2Fgoogle.com
[fa:Light_Pen]模拟输入文本Hello|operation=sendkeys&data=Hello
```

对应的右键菜单：

**右键点击按钮直接触发操作**（1.39.33）

如果希望在按钮点击右键时直接执行某个操作，可以这样定义：有且仅有一个右键菜单项，且其标题为`=`。

例如：

```plain
父操作项
    - =|operation=xxxx......
```

也可在默认的按钮右键菜单中按此方式设置：`=|operation=xxx&data=xxxx`

**缩进格式的内容注释**

如果需要注释某一行，可以在缩进后添加`////`字符。此时该行以及它所有子节点会被注释。

```plain
aaaaa
	////bbbb
	cccc
	////dddd
	eeee
		////ffff
		ggggg
```

**设置单个按钮的额外属性**

- 通过额外的参数.background可设置单个按钮的背景颜色。如果要固定按钮颜色，不要鼠标悬浮效果，可以附加.fixed参数，如：...&.background=#ff0000&.fixed=true。
- .foreground可设置按钮文字颜色（在设置按钮背景色的情况下，.foreground可以设置为auto，以根据背景色亮度自动将文字显示为黑色或白色）（1.39.24+）。
- .bordercolor可设置按钮的边框颜色（1.39.24+）。
- .width可以设置按钮的固定宽度，.height可以设置按钮的固定高度。（1.40.16+）
- .iconSize可设置图标大小。
- .text-align可设置文字对齐方式，可选值left,center,right。
- .overflow可设置在按钮宽度有限制时，文字过长时的处理方式（对应于WPF中的TextWrapping属性）。可选值：wrap表示折行（如果单词太长放不下就整个单词放入下一行），wrapWithOverflow表示折行（如果单词太长就从中间拆开）。ellipsis或...表示在末尾显示省略号。
- .close=true可设置点击按钮后并触发相关操作后关闭操作窗。(1.44.49+)

**缩进格式：**

`[fa:Light_Play]执行动作|operation=action&data=Hello&action=_this_&.background=#66FF0000`

**JSON格式：**

```json
      {
        "Title": "执行动作",
        "Icon": "fa:Light_Play",
        "Description": null,
        "Data": "Hello",
        "DataType": null,
        "Operation": "action",
        "Action": "_this_",
        "Menu": null,
        "SecondaryIcon": null,
        "ExtraData": {
          ".background": "#66FF0000"
        }
      }
```

**表达式创建：**

```csharp
$=new CommonOperationItem(){
    Title = "执行动作",
    Icon = "fa:Light_Pen:#000000",
    Description = "描述",
    Operation = "action",
    Action = "_this",
    ExtraData = new Dictionary(){
        {".background", "#20FF0000"}
    }
}

…

## 相关

`step-modules` · `step-runner-get` · `implementation-fallback`

