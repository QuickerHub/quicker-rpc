# sys:sendKeys

> **分类**：常用基础 · **来源**：KC 官方文档（`npm run docs:modules:gen`）· [sendkeys](https://getquicker.net/KC/Help/Doc/sendkeys)

**用途**：Send keys/text with parameters

# 概述

发送指定的按键序列到目标窗口。

- 本功能在内部使用了C#的 System.Windows.Forms.SendKeys.SendWait() 函数。因此，参数格式可以直接参考该文档。
- 此操作可能会受到输入法的影响，请在使用前将输入法切换到英文状态。不受输入法影响的方式，请参考本文。

此模块和“[模拟按键A（录入）](https://getquicker.net/kc/help/doc/keyinput)”模块的区别为：

- “模拟按键（录入）”模块使用直接录入的方式指定要发送的内容，只能发送固定的内容。
- 本模块使用文本参数的形式传入要发送的内容，可以接受参数或使用插值，可以和其他模块协作动态变更发送的按键序列内容。

****

[image]

## 按键序列参数格式

### 要点

- ^代表Ctrl键
- +代表Shift键
- %代表Alt键
- 其它普通字母和数字键使用小写形式。 如^c表示Ctrl+C（复制）。特殊键使用{键名}的格式，参见下表。
- 不支持Win键和一些特殊按键，如F17-F24、媒体键等。

### 详解

（1）普通字符使用字符本身表示，如“a”表示发送字符“a”，“abc”表示发送“abc”三个字符。

（2）加号 (+)、插入符 (^)、百分比符号 (%)、上划线 (~) 及圆括号 ( ) 都具有特殊意义。为了指定上述任何一个字符，要将它放在大括号 ({}) 当中。例如，要指定正号，可用 {+} 表示。方括号 ([ ]) 并不具有特殊意义，但必须将它们放在大括号中。为了指定大括号字符，请使用 "{{}" 和"{}}"。

（3）为了在按下按键时指定那些不显示的字符，例如 ENTER 或 TAB 以及那些表示动作而非字符的按键，请使用下列代码：

| **按键** | **代码** |
| --- | --- |
| WIN | 底层API**不支持** |
| BACKSPACE | {BACKSPACE}, {BS}, or {BKSP} |
| BREAK | {BREAK} |
| CAPS LOCK | {CAPSLOCK} |
| DEL or DELETE | {DELETE} or {DEL} |
| DOWN ARROW | {DOWN} |
| END | {END} |
| **ENTER 回车** | {ENTER} or ~ |
| ESC | {ESC} |
| HELP | {HELP} |
| HOME | {HOME} |
| INS or INSERT | {INSERT} or {INS} |
| LEFT ARROW | {LEFT} |
| NUM LOCK | {NUMLOCK} |
| PAGE DOWN | {PGDN} |
| PAGE UP | {PGUP} |
| PRINT SCREEN | {PRTSC} (reserved for future use) |
| RIGHT ARROW | {RIGHT} |
| SCROLL LOCK | {SCROLLLOCK} |
| TAB | {TAB} |
| UP ARROW | {UP} |
| F1 | {F1} |
| F2 | {F2} |
| F3 | {F3} |
| F4 | {F4} |
| F5 | {F5} |
| F6 | {F6} |
| F7 | {F7} |
| F8 | {F8} |
| F9 | {F9} |
| F10 | {F10} |
| F11 | {F11} |
| F12 | {F12} |
| F13 | {F13} |
| F14 | {F14} |
| F15 | {F15} |
| F16 | {F16} |
| Keypad add | {ADD} |
| Keypad subtract | {SUBTRACT} |
| Keypad multiply | {MULTIPLY} |
| Keypad divide | {DIVIDE} |

（4）为了表示在按下某个按键时同时要按下的SHIFT、CTRL和ALT控制键，可以在按键字符前插入下面的代码：

| **按键** | **代码** |
| --- | --- |
| SHIFT | + |
| CTRL | ^ |
| ALT | % |

如Ctrl+C可以表示为“^c”。

如果在按下SHIFT、CTRL、ALT组合的同时需要按下多个其他按键，则需要将他们包含在括号中。如：要表示按下SHIFT的同时依次按下e和c，可以用“+(ec)”表示。

（5）如果要设定按键的重复次数，使用{按键 次数}的格式。按键和次数之间放置一个空格。如：{LEFT 42}表示按下方向键←42次，{h 10}表示按下H键10次。

请注意，字符的大小写可能会影响执行的结果。如^s和^S可能会产生不同的结果。请多测试以确保目标软件按预期执行操作。

### 按键组合示例

| **代码** | **按键序列** |
| --- | --- |
| ^p | Ctrl+p 组合键 |
| +p | Shift+p 组合键 |
| %p | Alt+p 组合键 |
| ^+s | Ctrl+Shift+s 组合键 |
| ^(kc) | 按Ctrl同时按K和C |
| ^kc | 先按Ctrl+k组合键，全部松开后再按c键 |
| Hello~New Line | Hello(回车); New Line |
| 中文字符 | 中文字符 |
| {LEFT 10} | 按←键 10次 |
| {h 10} | 按h键 10次 |

# 示例

- 选择一个快捷键组合发送：https://getquicker.net/Sharedaction?code=67129c30-9d18-40c7-0ab8-08d714376b4c
-

