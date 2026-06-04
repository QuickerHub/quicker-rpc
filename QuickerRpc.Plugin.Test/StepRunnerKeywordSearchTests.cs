using System.Collections.Generic;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using QuickerRpc.AgentModel.Catalog;

namespace QuickerRpc.Plugin.Test;

[TestClass]
public sealed class StepRunnerKeywordSearchTests
{
    private static StepRunnerCatalog CreateClipboardCatalog() =>
        new()
        {
            Items = new List<StepRunnerDefinition>
            {
                new()
                {
                    Key = "sys:getClipboardText",
                    Name = "获取剪贴板文本",
                    Description = "读取剪贴板中的文本内容",
                },
                new()
                {
                    Key = "sys:writeClipboard",
                    Name = "写入剪贴板",
                    Description = "将文本或图片等内容写入剪贴板",
                },
                new()
                {
                    Key = "sys:comment",
                    Name = "注释",
                    Description = "使用注释将步骤分组",
                },
            },
        };

    [TestMethod]
    public void Search_clipboard_write_ranks_writeClipboard_first()
    {
        var result = StepRunnerCatalogMapper.Search(CreateClipboardCatalog(), "clipboard write", maxResults: 10);

        Assert.IsTrue(result.Success);
        Assert.IsTrue(result.MatchCount >= 1);
        Assert.AreEqual("sys:writeClipboard", result.Items[0].Key);
        StringAssert.Contains(result.Items[0].Snippet!, "Write");
    }

    [TestMethod]
    public void Search_clipboard_read_ranks_getClipboardText_first()
    {
        var result = StepRunnerCatalogMapper.Search(CreateClipboardCatalog(), "clipboard read", maxResults: 10);

        Assert.IsTrue(result.Success);
        Assert.AreEqual("sys:getClipboardText", result.Items[0].Key);
    }

    [TestMethod]
    public void Search_http_request_finds_http_module()
    {
        var catalog = new StepRunnerCatalog
        {
            Items = new List<StepRunnerDefinition>
            {
                new() { Key = "sys:http", Name = "HTTP请求", Description = "发送HTTP请求" },
                new() { Key = "sys:download", Name = "下载文件", Description = "下载网络文件" },
                new() { Key = "sys:MsgBox", Name = "弹窗提示", Description = "弹窗显示提示" },
            },
        };

        var result = StepRunnerCatalogMapper.Search(catalog, "http rest api", maxResults: 5);
        Assert.AreEqual("sys:http", result.Items[0].Key);
    }

    [TestMethod]
    public void AgentKeywordCatalog_loads_embedded_entries()
    {
        Assert.IsTrue(StepRunnerAgentKeywordCatalog.TryGet("sys:writeClipboard", out var entry));
        Assert.IsTrue(entry.Keywords.Count > 0);
        StringAssert.Contains(entry.Snippet!, "clipboard");
    }

    [TestMethod]
    public void AgentKeywordCatalog_loads_control_keywords_for_file_operation()
    {
        Assert.IsTrue(StepRunnerAgentKeywordCatalog.TryGet("sys:fileOperation", out var entry));
        Assert.IsTrue(entry.ControlKeywords.TryGetValue("moveInto", out var moveInto));
        CollectionAssert.Contains(moveInto, "移动文件");
    }
}
