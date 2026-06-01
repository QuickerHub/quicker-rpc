using Microsoft.VisualStudio.TestTools.UnitTesting;
using QuickerRpc.Plugin.Services;

namespace QuickerRpc.Plugin.Test;

[TestClass]
public sealed class ActionSearchFuzzyMatchTests
{
    [TestMethod]
    public void Normalize_removes_spaces_between_cjk_and_alnum()
    {
        Assert.AreEqual("剪贴板n10", ActionSearchFuzzyMatch.Normalize("剪贴板 n10"));
        Assert.AreEqual("剪贴板n10", ActionSearchFuzzyMatch.Normalize("剪贴板  n10"));
    }

    [TestMethod]
    public void ComputeScore_matches_title_with_extra_space()
    {
        var score = ActionSearchFuzzyMatch.ComputeScore(
            "剪贴板n10",
            actionId: null,
            title: "剪贴板 n10",
            description: "测试版");
        Assert.IsTrue(score >= 95, $"expected fuzzy title match, score={score}");
    }

    [TestMethod]
    public void ComputeScore_still_matches_exact_substring()
    {
        var score = ActionSearchFuzzyMatch.ComputeScore(
            "QuickerRpc",
            actionId: null,
            title: "QuickerRpc 插件",
            description: null);
        Assert.IsTrue(score >= 100);
    }

    [TestMethod]
    public void ComputeScore_matches_description_with_separators_removed()
    {
        var score = ActionSearchFuzzyMatch.ComputeScore(
            "极致UI",
            actionId: null,
            title: "剪贴板",
            description: "极致 UI，丝滑体验");
        Assert.IsTrue(score >= 60);
    }
}
