# sys:flauiautomation

> **分类**：系统与窗口 · **官方**：[uiautomation](https://getquicker.net/KC/Help/Doc/uiautomation)

**用途**：UI automation via FlaUI

## 要点（摘自官方文档）

# 概述

使用Windows UIAutomation技术触发窗口界面元素。

Quicker目前提供了两个窗口界面控制模块。

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

## 相关

`step-modules` · `step-runner-get` · `implementation-fallback`
