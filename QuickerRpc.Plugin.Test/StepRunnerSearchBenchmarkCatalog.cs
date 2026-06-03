using System.Collections.Generic;
using QuickerRpc.AgentModel.Catalog;

namespace QuickerRpc.Plugin.Test;

/// <summary>Benchmark catalog: modules-table names/descriptions + common confusers for search gold cases.</summary>
internal static class StepRunnerSearchBenchmarkCatalog
{
    public static StepRunnerCatalog Build()
    {
        var items = new List<StepRunnerDefinition>
        {
            // Clipboard & selection
            Row("sys:getClipboardText", "获取剪贴板文本", "读取剪贴板中的文本内容"),
            Row("sys:writeClipboard", "写入剪贴板", "将文本或图片等内容写入剪贴板"),
            Row("sys:getClipboardImage", "获取剪贴板图片", "读取剪贴板中的图片内容"),
            Row("sys:getClipboardFiles", "获取剪贴板文件列表", "获取剪贴板中复制的文件路径列表"),
            Row("sys:fileToClipboard", "文件放入剪贴板", "将文件或文件列表存入剪贴板"),
            Row("sys:getSelectedText", "获取选中的文本", "获取选中的文字"),
            Row("sys:waitClipboardChange", "等待剪贴板内容改变", "等待剪贴板的内容发生改变"),

            // Network
            Row("sys:http", "HTTP请求", "发送HTTP请求，并获取返回结果"),
            Row("sys:download", "下载文件", "下载网络文件"),
            Row("sys:websocket", "Websocket", "Websocket相关操作"),
            Row("sys:openUrl", "打开网址", "打开指定的网址"),

            // Logic & scripts
            Row("sys:evalexpression", "表达式", "执行C#表达式"),
            Row("sys:csscript", "运行C#代码", "执行C#代码片段"),
            Row("sys:runScript", "运行脚本", "运行脚本"),
            Row("sys:pythonscript", "运行Python代码", "执行Python代码片段"),
            Row("sys:jsscript", "运行Javascript代码", "执行Js代码片段"),
            Row("sys:subprogram", "运行子程序", "运行公共或动作内子程序"),
            Row("sys:runAction", "运行或停止动作", "执行指定的其他动作"),

            // UI & interaction
            Row("sys:MsgBox", "弹窗提示或确认", "弹窗显示提示或确认对话框"),
            Row("sys:notify", "提示消息", "显示可以自动消失的消息提示"),
            Row("sys:showText", "文本窗口", "在独立的窗口中显示文本"),
            Row("sys:outputText", "发送文本到窗口", "将文本输出到活动窗口中"),
            Row("sys:userInput", "用户输入", "请用户输入内容"),
            Row("sys:select", "用户选择", "请用户选择一个选项"),
            Row("sys:form", "多字段表单", "使用表单窗口编辑多个变量的值"),

            // Flow
            Row("sys:if", "如果/否则", "依据条件执行操作"),
            Row("sys:simpleIf", "如果", "依据条件执行操作"),
            Row("sys:each", "每个", "对列表的每项执行处理"),
            Row("sys:repeat", "重复", "循环指定的次数，或符合某个条件时中止"),
            Row("sys:delay", "等待时间", "等待指定的毫秒数"),
            Row("sys:comment", "注释", "使用注释将步骤分组"),

            // Files
            Row("sys:readFile", "读取文件", "将读取的文本或图片内容写入变量"),
            Row("sys:WriteTextFile", "写入文本文件", "将内容写入文本文件"),
            Row("sys:fileOperation", "文件和目录操作", "文件和目录操作"),
            Row("sys:selectFile", "选择文件", "用文件选择对话框选择文件"),
            Row("sys:zip", "Zip压缩打包", "Zip压缩或解压缩"),

            // Data structures
            Row("sys:listOperations", "列表操作", "对列表变量进行添加、删除等操作"),
            Row("sys:dictOperations", "词典操作", "对词典变量进行添加、删除等操作"),
            Row("sys:dboperation", "数据库查询", "对数据库执行SQL语句并返回结果"),
            Row("sys:stringProcess", "文本处理", "各种文本处理功能"),

            // Input & window
            Row("sys:sendKeys", "模拟按键B（参数）", "发送按键和文本"),
            Row("sys:keyInput", "模拟按键A（录入）", "模拟键盘输入"),
            Row("sys:mouse", "鼠标输入", "模拟鼠标输入"),
            Row("sys:getWindowTitle", "获取窗口信息/查找窗口", "获取指定窗口的标题等信息"),
            Row("sys:activateProcessMainWindow", "激活进程主窗口", "找到指定进程的主窗口并使其显示在前台"),
            Row("sys:checkProcessExists", "检查程序已启动/获取进程信息", "检查指定的应用程序是否已经启动"),
            WindowOperationsRow(),
            Row("sys:uiautomation", "窗口界面控制", "触发Windows窗口的菜单/按钮等控件"),
            Row("sys:flauiautomation", "窗口界面控制(FlaUI)", "通过FlaUI触发窗口控件"),

            // Media & run
            Row("sys:screenCapture", "屏幕截图", "截取屏幕区域"),
            Row("sys:basic-ocr", "基础OCR", "获取图片中的文字"),
            Row("sys:run", "运行或打开", "运行软件或命令，打开文件、文件夹或网址"),
        };

        return new StepRunnerCatalog { Items = items };
    }

    private static StepRunnerDefinition Row(string key, string name, string description) =>
        new()
        {
            Key = key,
            Name = name,
            Description = description,
        };

    private static StepRunnerDefinition WindowOperationsRow() =>
        new()
        {
            Key = "sys:windowOperations",
            Name = "窗口操作",
            Description = "Window窗口相关操作",
            InputParamDefs = new List<StepRunnerInputParamDef>
            {
                new()
                {
                    Key = "type",
                    IsControlField = true,
                    VarType = 9,
                    SelectionItems = new List<StepRunnerParamSelectionItem>
                    {
                        new() { Value = "move", Name = "移动窗口" },
                        new() { Value = "move_ex", Name = "移动窗口(增强)" },
                    },
                },
            },
        };
}
