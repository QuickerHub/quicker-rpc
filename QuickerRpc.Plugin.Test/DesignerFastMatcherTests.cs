using System.IO;
using System.Reflection;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using QuickerRpc.Plugin.Catalog.Designer;
using QuickerRpc.Plugin.Reflection;
using QuickerRpc.Plugin.Services;

namespace QuickerRpc.Plugin.Test;

[TestClass]
public sealed class DesignerFastMatcherTests
{
    [TestInitialize]
    public void LoadPinyinHelperAssembly()
    {
        var publicDll = Path.Combine(QuickerExeProbePaths.DefaultReleaseDirectory, "Quicker.Public.dll");
        if (File.Exists(publicDll))
        {
            Assembly.LoadFrom(publicDll);
        }
    }

    [TestMethod]
    public void IsMatch_pinyin_xianshi_matches_chinese_label_when_pinyin_helper_available()
    {
        if (QuickerPinyinReflection.TryResolvePinyinHelperType() is null)
        {
            Assert.Inconclusive("Quicker.Utilities.Pinyin.PinyinHelper not available.");
        }

        Assert.IsTrue(
            DesignerFastMatcher.IsMatch("显示消息", new[] { "xianshi" }),
            "expected pinyin query to match Chinese label");
        Assert.IsTrue(
            DesignerFastMatcher.IsMatch("sys:showText 文本窗口 显示窗口", new[] { "xianshi" }),
            "expected pinyin on match surface blob");
    }

    [TestMethod]
    public void ActionSearchPinyin_TryPinyinMatch_xs_matches_chinese_when_pinyin_helper_available()
    {
        if (QuickerPinyinReflection.TryResolvePinyinHelperType() is null)
        {
            Assert.Inconclusive("Quicker.Utilities.Pinyin.PinyinHelper not available.");
        }

        Assert.IsTrue(ActionSearchPinyin.TryPinyinMatch("显示", "xs"));
        Assert.IsTrue(ActionSearchPinyin.TryPinyinMatch("文本窗口", "wenben"));
    }

    [TestMethod]
    public void StepQuickInsertCatalog_RowMatches_pinyin_xianshi_on_label()
    {
        if (QuickerPinyinReflection.TryResolvePinyinHelperType() is null)
        {
            Assert.Inconclusive("Quicker.Utilities.Pinyin.PinyinHelper not available.");
        }

        var row = new StepQuickInsertCatalog.CatalogRow
        {
            Label = "显示消息",
            MatchSurface = "sys:msgbox 显示消息",
            MatchSurfaceTitle = "sys:msgbox 显示消息",
        };

        Assert.IsTrue(
            StepQuickInsertCatalog.RowMatches(row, new[] { "xianshi" }),
            "RowMatches should use ActionSearchPinyin for ascii pinyin queries");
    }

    [TestMethod]
    public void Release_Quicker_exe_FastMatcher_resolves_by_signature_when_available()
    {
        if (!QuickerAssemblyReflection.TryLoadQuickerExe(
                QuickerExeProbePaths.ResolveReleaseQuickerExe(),
                out var assembly))
        {
            Assert.Inconclusive("Release Quicker.exe not found.");
        }

        var fastMatcher = QuickerPinyinReflection.TryResolveFastMatcherType(assembly);
        Assert.IsNotNull(
            fastMatcher,
            "expected Release Quicker.exe to expose FastMatcher by signature");
        Assert.IsNotNull(QuickerPinyinReflection.TryGetFastMatcherIsMatch(fastMatcher));
        Assert.IsNotNull(QuickerPinyinReflection.TryGetFastMatcherGetMatchResult(fastMatcher));
    }
}
