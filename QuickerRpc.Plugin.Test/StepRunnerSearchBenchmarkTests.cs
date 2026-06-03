using System;
using System.Collections.Generic;
using System.Linq;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using QuickerRpc.AgentModel.Catalog;

namespace QuickerRpc.Plugin.Test;

/// <summary>Intent/keyword gold cases for step-runner search recall (offline).</summary>
[TestClass]
public sealed class StepRunnerSearchBenchmarkTests
{
    /// <summary>P0 intents: CI must pass IntentHit@3 and query-level Hit@1 thresholds.</summary>
    private static readonly IReadOnlyList<GoldCase> GoldCases = new[]
    {
        // Clipboard & selection
        G("clipboard_write", new[] { "clipboard write", "写入剪贴板", "paste|clipboard" },
            "sys:writeClipboard", "sys:getClipboardText", "sys:comment"),
        G("clipboard_read", new[] { "clipboard read", "读取剪贴板", "get clipboard text" },
            "sys:getClipboardText", "sys:writeClipboard"),
        G("clipboard_image", new[] { "clipboard image", "剪贴板图片" },
            "sys:getClipboardImage", "sys:getClipboardText", "sys:writeClipboard"),
        G("clipboard_wait", new[] { "wait clipboard change", "等待剪贴板" },
            "sys:waitClipboardChange", "sys:getClipboardText"),

        // Network & web
        G("http_request", new[] { "http", "rest api", "web request" },
            "sys:http", "sys:download", "sys:MsgBox"),
        G("download_file", new[] { "download file", "http download", "下载文件" },
            "sys:download", "sys:http"),
        G("open_url", new[] { "open url", "browser", "打开网址" },
            "sys:openUrl", "sys:http", "sys:run"),
        G("websocket", new[] { "websocket", "ws client" },
            "sys:websocket", "sys:http"),

        // Logic, scripts, subprogram
        G("expression_logic", new[] { "linq", "expression", "csharp expression", "表达式" },
            "sys:evalexpression", "sys:http", "sys:csscript"),
        G("csscript_complex", new[] { "csharp script", "csscript", "C#代码" },
            "sys:csscript", "sys:evalexpression"),
        G("run_script_short", new[] { "powershell", "cmd script", "run script" },
            "sys:runScript", "sys:run", "sys:csscript"),
        G("subprogram_call", new[] { "subprogram", "call sub", "子程序" },
            "sys:subprogram"),
        G("run_action", new[] { "run action", "trigger action", "运行动作" },
            "sys:runAction", "sys:subprogram", "sys:run"),

        // UI & interaction
        G("message_box", new[] { "message box", "confirm dialog", "弹窗" },
            "sys:MsgBox", "sys:notify"),
        G("notify_toast", new[] { "toast", "notification", "提示消息" },
            "sys:notify", "sys:MsgBox"),
        G("foreground_text", new[] { "send text to active window", "foreground input", "发送文本到窗口" },
            "sys:outputText", "sys:showText", "sys:MsgBox"),
        G("text_window", new[] { "text window", "show text window", "文本窗口" },
            "sys:showText", "sys:outputText"),
        G("user_input", new[] { "user input", "prompt input", "用户输入" },
            "sys:userInput", "sys:select"),
        G("user_select", new[] { "user select", "pick option", "用户选择" },
            "sys:select", "sys:userInput"),

        // Flow control
        G("if_else", new[] { "if else", "条件分支", "condition branch" },
            "sys:if", "sys:simpleIf"),
        G("foreach_list", new[] { "foreach", "each item in list", "遍历列表", "每个" },
            "sys:each", "sys:repeat"),
        G("repeat_loop", new[] { "repeat loop", "loop times", "重复次数" },
            "sys:repeat", "sys:each"),
        G("delay_wait", new[] { "sleep", "delay", "等待时间" },
            "sys:delay", "sys:waitClipboardChange"),

        // Files
        G("read_file", new[] { "read file", "load file", "读取文件" },
            "sys:readFile", "sys:WriteTextFile"),
        G("write_text_file", new[] { "write file", "save text file", "写入文本文件" },
            "sys:WriteTextFile", "sys:readFile"),
        G("file_operation", new[] { "copy file", "delete file", "file operation", "文件操作" },
            "sys:fileOperation", "sys:readFile"),
        G("select_file_dialog", new[] { "file picker", "select file", "选择文件" },
            "sys:selectFile", "sys:selectFolder"),
        G("zip_archive", new[] { "zip", "unzip", "compress archive", "压缩" },
            "sys:zip"),

        // Data & text
        G("list_operations", new[] { "list operation", "add to list", "列表操作" },
            "sys:listOperations", "sys:each"),
        G("dict_operations", new[] { "dictionary", "dict operation", "词典" },
            "sys:dictOperations", "sys:listOperations"),
        G("database_sql", new[] { "sql", "database query", "数据库" },
            "sys:dboperation", "sys:http"),
        G("string_process", new[] { "string process", "replace string", "文本处理" },
            "sys:stringProcess", "sys:evalexpression"),

        // Input, window, automation
        G("send_keys", new[] { "send keys", "keystroke", "模拟按键" },
            "sys:sendKeys", "sys:keyInput"),
        G("mouse_input", new[] { "mouse click", "mouse move", "鼠标" },
            "sys:mouse", "sys:sendKeys"),
        G("window_move", new[] { "move window", "移动窗口", "window operation" },
            "sys:windowOperations"),
        G("activate_window", new[] { "activate window", "foreground window", "激活窗口" },
            "sys:activateProcessMainWindow", "sys:windowOperations"),
        G("process_exists", new[] { "process exists", "is running", "进程已启动" },
            "sys:checkProcessExists", "sys:run"),
        G("ui_automation", new[] { "ui automation", "click button", "界面自动化" },
            "sys:uiautomation", "sys:flauiautomation", "sys:sendKeys"),

        // Media & run
        G("screenshot", new[] { "screenshot", "screen capture", "截图" },
            "sys:screenCapture", "sys:searchBmp"),
        G("ocr_text", new[] { "ocr", "text from image", "OCR" },
            "sys:basic-ocr", "sys:screenCapture"),
        G("run_program", new[] { "run program", "launch exe", "运行程序" },
            "sys:run", "sys:runScript", "sys:openUrl"),
    };

    private static GoldCase G(
        string id,
        string[] queries,
        string expected,
        params string[] negative) =>
        new(id, queries, new[] { expected }, negative);

    private static StepRunnerCatalog BenchmarkCatalog => StepRunnerSearchBenchmarkCatalog.Build();

    [TestMethod]
    public void Benchmark_intent_hit_at_3_meets_threshold()
    {
        var metrics = Evaluate(maxRank: 3);
        Assert.IsTrue(
            metrics.IntentHitAt3 >= 0.85,
            $"IntentHit@3 {metrics.IntentHitAt3:P1} ({metrics.IntentHitAt3Passed}/{metrics.CaseCount}) below 85%.");
    }

    [TestMethod]
    public void Benchmark_hit_at_1_meets_threshold()
    {
        var metrics = Evaluate(maxRank: 1);
        Assert.IsTrue(
            metrics.QueryHitAt1 >= 0.70,
            $"Query Hit@1 {metrics.QueryHitAt1:P1} ({metrics.QueryHitAt1Passed}/{metrics.QueryCount}) below 70%.");
    }

    [TestMethod]
    public void Benchmark_wrong_in_top5_stays_low()
    {
        var metrics = Evaluate(maxRank: 5);
        Assert.IsTrue(
            metrics.WrongInTop5Rate <= 0.14,
            $"WrongInTop5 {metrics.WrongInTop5Rate:P1} above 14% ({metrics.WrongInTop5Count}/{metrics.QueryCount}).");
    }

    private BenchmarkMetrics Evaluate(int maxRank)
    {
        var caseCount = 0;
        var queryHitAt1 = 0;
        var intentHitAtK = 0;
        var recallAt5 = 0;
        var wrongTop5 = 0;
        var queryCount = 0;

        foreach (var gold in GoldCases)
        {
            caseCount++;
            var caseHitK = false;
            var caseRecall5 = false;
            foreach (var query in gold.Queries)
            {
                queryCount++;
                var result = StepRunnerCatalogMapper.Search(BenchmarkCatalog, query, maxResults: 40);
                var keys = result.Items.Select(i => i.Key).ToList();
                var rank = IndexOfFirstExpected(keys, gold.ExpectedKeys);
                if (rank == 1)
                {
                    queryHitAt1++;
                }

                if (rank > 0 && rank <= maxRank)
                {
                    caseHitK = true;
                }

                var top5 = keys.Take(5).ToList();
                if (top5.Any(k => gold.ExpectedKeys.Contains(k, StringComparer.Ordinal)))
                {
                    caseRecall5 = true;
                }

                if (gold.NegativeKeys.Length > 0
                    && top5.Any(k => gold.NegativeKeys.Contains(k, StringComparer.Ordinal)))
                {
                    wrongTop5++;
                }
            }

            if (caseHitK)
            {
                intentHitAtK++;
            }

            if (caseRecall5)
            {
                recallAt5++;
            }
        }

        return new BenchmarkMetrics
        {
            CaseCount = caseCount,
            QueryCount = queryCount,
            IntentHitAt3Passed = intentHitAtK,
            QueryHitAt1Passed = queryHitAt1,
            IntentHitAt3 = caseCount == 0 ? 0 : (double)intentHitAtK / caseCount,
            QueryHitAt1 = queryCount == 0 ? 0 : (double)queryHitAt1 / queryCount,
            RecallAt5 = caseCount == 0 ? 0 : (double)recallAt5 / caseCount,
            WrongInTop5Rate = queryCount == 0 ? 0 : (double)wrongTop5 / queryCount,
            WrongInTop5Count = wrongTop5,
        };
    }

    private static int IndexOfFirstExpected(IReadOnlyList<string> keys, IReadOnlyList<string> expected)
    {
        for (var i = 0; i < keys.Count; i++)
        {
            if (expected.Contains(keys[i], StringComparer.Ordinal))
            {
                return i + 1;
            }
        }

        return -1;
    }

    private sealed class GoldCase
    {
        public GoldCase(string id, string[] queries, string[] expectedKeys, string[] negativeKeys)
        {
            Id = id;
            Queries = queries;
            ExpectedKeys = expectedKeys;
            NegativeKeys = negativeKeys;
        }

        public string Id { get; }

        public string[] Queries { get; }

        public string[] ExpectedKeys { get; }

        public string[] NegativeKeys { get; }
    }

    private sealed class BenchmarkMetrics
    {
        public int CaseCount { get; set; }

        public int QueryCount { get; set; }

        public int IntentHitAt3Passed { get; set; }

        public int QueryHitAt1Passed { get; set; }

        public double IntentHitAt3 { get; set; }

        public double QueryHitAt1 { get; set; }

        public double RecallAt5 { get; set; }

        public double WrongInTop5Rate { get; set; }

        public int WrongInTop5Count { get; set; }
    }
}
