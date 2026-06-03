# 常用模块对照（StepRunner 选型）

**何时读**：**`overview`** P5 — 在 **`step-runner search`** 之前查本表找 `stepRunnerKey`，再 **`step-runner get`** 取 `inputParams` 键名。

表达式/计算/LINQ **优先 `expressions` / `sys:evalexpression`**；无表项 → **`step-runner-search`** → **`implementation-fallback`**（先表达式，再 csscript）。

## 流程控制
| stepRunnerKey | name | description |
|---------------|------|-------------|
| `sys:if` | 如果/否则 | 依据条件执行操作 |
| `sys:simpleIf` | 如果 | 依据条件执行操作 |
| `sys:each` | 每个 | 对列表的每项执行处理 |
| `sys:repeat` | 重复 | 循环指定的次数，或符合某个条件时中止 |
| `sys:break` | 跳出循环(break) | 跳出循环（"每个" 或 "重复" 模块） |
| `sys:continue` | 跳过后续步骤(continue) | 跳过后续步骤（循环内部），开始下一次循环。在循环内部使用。 |
| `sys:stop` | 停止(return) | 停止动作或从子程序中返回 |
| `sys:group` | 步骤组 | 一组有关的模块（方便整体禁用、删除等） |
| `sys:comment` | 注释 | 使用注释将步骤分组，描述后续步骤的目的。 |
| `sys:delay` | 等待时间 | 等待指定的毫秒数 |
| `sys:waitClipboardChange` | 等待剪贴板内容改变 | 等待剪贴板的内容发生改变。等待第三方工具（如截图工具）完成操作并更新剪贴板。 |
| `sys:waitKeyboard` | 等待按键 | 等待用户按下某个按键 |
| `sys:fileSystemWatch` | 文件系统监控 | 监控文件创建/变更/删除等事件。 |
## 状态与检查
| stepRunnerKey | name | description |
|---------------|------|-------------|
| `sys:stateStorage` | 状态存取 | 存取状态数据；更新动作的徽标文字；设置附加的动作右键菜单项 |
| `sys:dependencycheck` | 检查和下载依赖 | 检查和下载依赖的外部文件包。 |
## 提示与用户交互
| stepRunnerKey | name | description |
|---------------|------|-------------|
| `sys:MsgBox` | 弹窗提示或确认 | 弹窗显示提示或确认对话框 |
| `sys:notify` | 提示消息 | 显示可以自动消失的消息提示。 |
| `sys:showText` | 文本窗口 | 在独立的窗口中显示文本。 |
| `sys:outputText` | 发送文本到窗口 | 将文本输出到活动窗口中 |
| `sys:userInput` | 用户输入 | 请用户输入内容。 |
| `sys:select` | 用户选择 | 请用户选择一个选项。 |
| `sys:showmenu` | 显示菜单 | 显示一个菜单 |
| `sys:form` | 多字段表单 | 使用表单窗口编辑多个变量的值。 |
| `sys:showWaitWin` | 显示等待窗口 | 显示一个等待用户完成某个操作的提示窗口。 |
| `sys:reportProgress` | 显示进度条 | 显示/更新进度条 |
## 剪贴板与选区
| stepRunnerKey | name | description |
|---------------|------|-------------|
| `sys:getClipboardText` | 获取剪贴板文本 | 读取剪贴板中的文本内容 |
| `sys:writeClipboard` | 写入剪贴板 | 将文本或图片等内容写入剪贴板 |
| `sys:getClipboardImage` | 获取剪贴板图片 | 读取剪贴板中的图片内容输出到图片变量中。 |
| `sys:getClipboardFiles` | 获取剪贴板文件列表 | 获取剪贴板中复制的文件(或文件夹)的路径列表 |
| `sys:fileToClipboard` | 文件放入剪贴板 | 将文件或文件列表存入剪贴板 |
| `sys:getSelectedText` | 获取选中的文本 | 获取选中的文字 |
## 文件与路径
| stepRunnerKey | name | description |
|---------------|------|-------------|
| `sys:readFile` | 读取文件 | 将读取的文本或图片内容写入变量。 |
| `sys:WriteTextFile` | 写入文本文件 | 将内容写入文本文件 |
| `sys:fileOperation` | 文件和目录操作 | 文件和目录操作。请确保路径是合法的。 |
| `sys:selectFile` | 选择文件 | 用文件选择对话框选择要打开或保存的文件 |
| `sys:selectFolder` | 选择文件夹 | 文件夹选择对话框 |
| `sys:zip` | Zip压缩打包 | Zip压缩或解压缩 |
| `sys:GenTempFilePath` | 生成临时文件路径 | 根据指定的扩展名生成一个随机的临时文件名（完整路径），供后续步骤写入文件使用。 |
| `sys:getExplorerPath` | 获取资源管理器路径/跳转路径 | 获取资源管理器的当前文件夹路径。 |
| `sys:getFolderPath` | 获取系统路径 | 返回指定的特殊目录路径。 |
| `sys:SelectFileInExplorer` | 在资源管理器中定位文件 | 在资源管理器中选中文件 |
| `sys:everythingsearch` | 使用Everything搜索文件 | 调用Everything提供的接口搜索文件 |
## 文本（专用模块）
| stepRunnerKey | name | description |
|---------------|------|-------------|
| `sys:stringProcess` | 文本处理 | 各种文本处理功能 |
| `sys:htmlExtract` | 提取HTML内容 | 从HTML代码中提取内容 |
## 列表、词典、表格
| stepRunnerKey | name | description |
|---------------|------|-------------|
| `sys:listOperations` | 列表操作 | 对列表变量进行添加、删除等操作 |
| `sys:manageList` | 管理和排序列表 | 对列表内容进行手工排序、添加、删除等操作 |
| `sys:dictOperations` | 词典操作 | 对词典变量进行添加、删除等操作 |
| `sys:tableoperation` | 表格数据操作 | 表格变量的相关处理操作 |
| `sys:dboperation` | 数据库查询 | 对数据库执行SQL语句并返回结果 |
## 键盘、鼠标、窗口
| stepRunnerKey | name | description |
|---------------|------|-------------|
| `sys:sendKeys` | 模拟按键B（参数） | 发送按键和文本 |
| `sys:keyInput` | 模拟按键A（录入） | 模拟键盘输入 |
| `sys:mouse` | 鼠标输入 | 模拟鼠标输入 |
| `sys:inputScript` | 多步骤输入 | 多步骤键盘组合输入 |
| `sys:getWindowTitle` | 获取窗口信息/查找窗口 | 获取指定窗口的标题等信息。 |
| `sys:activateProcessMainWindow` | 激活进程主窗口 | 找到指定进程的主窗口并使其显示在前台。 |
| `sys:checkProcessExists` | 检查程序已启动/获取进程信息 | 检查指定的应用程序是否已经启动。 |
| `sys:getActiveProcessInfo` | 获取前台进程信息 | 获取当前活动窗口进程的信息。 |
| `sys:windowOperations` | 窗口操作 | Window窗口相关操作 |
| `sys:uiautomation` | 窗口界面控制 | 触发Windows窗口的菜单/按钮等控件。 |
| `sys:flauiautomation` | 窗口界面控制(FlaUI) | 触发Windows窗口的菜单/按钮等控件(通过FlaUI库实现)。 |
| `sys:searchBmp` | 屏幕找图/找色/找字 | 在屏幕上查找图片里的内容出现的位置 |
## 网络与 AI
| stepRunnerKey | name | description |
|---------------|------|-------------|
| `sys:http` | HTTP请求 | 发送HTTP请求，并获取返回结果 |
| `sys:download` | 下载文件 | 下载网络文件(请勿用于下载大文件) |
| `sys:websocket` | Websocket | Websocket相关操作 |
| `sys:basic-ocr` | 基础OCR | 获取图片中的文字 |
| `sys:ai` | AI 调用 | 调用第三方AI服务 |
| `sys:tempcloudstore` | 临时云存储 | 将文本、文件、图片临时保存到云端并得到网址。 |
## 运行程序与脚本
无专用模块时：**先 `expressions` / `sys:evalexpression`**（LINQ、字符串、多变量赋值），**再 `sys:csscript`**；勿默认 PowerShell。`sys:runScript` 仅用于极短系统命令或用户已有脚本（见 **`implementation-fallback`**）。
| stepRunnerKey | name | description |
|---------------|------|-------------|
| `sys:run` | 运行或打开 | 运行软件或命令，打开文件、文件夹或网址。效果类似于在Windows"运行"对话框中执行命令。 |
| `sys:openUrl` | 打开网址 | 打开指定的网址 |
| `sys:subprogram` | 运行子程序 | 运行**公共**或动作内子程序；公共子程序见 **`subprogram-workflow`**（`callIdentifier` + `inputParams.subProgram`） |
| `sys:runAction` | 运行或停止动作 | 执行指定的其他动作 |
| `sys:csscript` | 运行C#代码 | 执行C#代码片段。代码中应包含主函数Exec(stepContext)，请参考文档说明。 |
| `sys:pythonscript` | 运行Python代码 | 执行Python代码片段。 |
| `sys:jsscript` | 运行Javascript代码 | 执行Js代码片段。代码中应包含主函数exec()，请参考文档。 |
| `sys:runScript` | 运行脚本 | 运行脚本。 |
| `sys:shelloperation` | Shell文件操作 | 针对文件的Windows Shell相关操作 |
## 图像
| stepRunnerKey | name | description |
|---------------|------|-------------|
| `sys:screenCapture` | 屏幕截图 | 截取屏幕区域 |
| `sys:screenCapturePro` | 截图 Pro | 渐进式选区截图：全屏 overlay，光标处初始选区，支持控件跟踪，双击确认。Esc 取消。 |
| `sys:WriteImageFile` | 写入图片文件 | 将图片内容写入文件 |
| `sys:imgProcess` | 图片处理 | 图片处理和变换 |
| `sys:showImage` | 显示图片 | 在屏幕上显示图片。输入文件路径/url或图片变量。 |
## Quicker 自身
| stepRunnerKey | name | description |
|---------------|------|-------------|
| `sys:quickeroperations` | Quicker操作 | 调用Quicker的某个功能 |
| `sys:getActionInfo` | 获取动作信息 | 读取当前正在运行的动作，或按动作 ID 读取：输出 ID、标题、图标、说明；可选输出完整 JSON。 |
| `sys:getQuickerInfo` | 获取Quicker信息 | 返回 Quicker 与当前运行动作相关状态：版本、主题、专业版、触发方式、上下文参数等。 |
## 易混淆项
| 场景 | 选用 | 说明 |
|------|------|------|
| 赋值/计算/比较/LINQ/字符串变换 | **`expressions`** / **`sys:evalexpression`** | 勿用 `sys:csscript` 写简单 `Exec`；勿用已下架 `sys:assign` |
| 复杂 C#（需独立 .cs、长生命周期逻辑） | `sys:csscript` | 表达式模块无法表达时再用 |
| 向**前台活动窗口**输入文字 | `sys:outputText`（发送文本到窗口） | 非 `sys:showText`（独立文本窗口） |
| 需要 else 分支 | `sys:if` | `sys:simpleIf` 无 else 结构 |
| 多文件操作 | `sys:fileOperation` | 用 `type` 选子操作 |
| 多子操作模块 | 先定 key 再 `step-runner get` | 如 `stringProcess`、`uiautomation` |
## 相关主题
`implementation-fallback` · `expressions` · `overview` · `patch-workflow`

## 相关

`step-runner-search` · `implementation-fallback` · `expressions` · `authoring-workflow` · `overview`
