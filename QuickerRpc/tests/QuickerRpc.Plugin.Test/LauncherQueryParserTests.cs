using System.Linq;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using QuickerRpc.Plugin.Services;

namespace QuickerRpc.Plugin.Test;

[TestClass]
public sealed class LauncherQueryParserTests
{
    [TestMethod]
    public void ParseAlternatives_splits_on_pipe()
    {
        var terms = LauncherQueryParser.ParseAlternatives("动作管理器|搜索动作|动作页");
        CollectionAssert.AreEqual(
            new[] { "动作管理器", "搜索动作", "动作页" },
            terms.ToArray());
    }

    [TestMethod]
    public void ToSearchKeyword_strips_wildcards()
    {
        Assert.AreEqual("动作页管理", LauncherQueryParser.ToSearchKeyword("动作*页管理"));
    }

    [TestMethod]
    public void Matches_supports_wildcard()
    {
        Assert.IsTrue(LauncherQueryParser.Matches("动作*管理", "动作页管理"));
        Assert.IsFalse(LauncherQueryParser.Matches("动作*回收", "动作页管理"));
    }

    [TestMethod]
    public void FindMatchedOn_returns_field_label()
    {
        var matched = LauncherQueryParser.FindMatchedOn(
            "搜索动作",
            ("title", "搜索动作窗口"),
            ("subtitle", "search"));
        Assert.AreEqual("title: 搜索动作窗口", matched);
    }
}
