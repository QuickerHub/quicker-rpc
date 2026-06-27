using System;
using System.IO;
using System.Linq;
using System.Reflection;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using QuickerRpc.Plugin.Catalog.Designer;
using QuickerRpc.Plugin.Reflection;
using QuickerRpc.Plugin.Services;

namespace QuickerRpc.Plugin.Test;

[TestClass]
public sealed class StepQuickInsertSearchTests
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
    public void RowMatches_bds_matches_evalexpression_module()
    {
        var row = BuildEvalExpressionRow();
        var patterns = StepQuickInsertCatalog.SplitKeywordPatterns("bds");
        Assert.IsTrue(
            StepQuickInsertCatalog.RowMatches(row, patterns),
            "bds should match 执行表达式 module via full MatchSurface");
    }

    [TestMethod]
    public void ComputeSortKey_bds_ranks_parent_module_above_control_child()
    {
        var parent = BuildEvalExpressionRow();
        var child = new StepQuickInsertCatalog.CatalogRow
        {
            Kind = "runner",
            Id = "r:sys:evalexpression:expression",
            Label = "执行表达式 › 表达式",
            Description = parent.Description,
            MatchSurface = "expression 表达式 执行C#表达式或脚本代码 执行表达式",
            MatchSurfaceTitle = "expression 表达式",
            MatchSurfaceDesc = "要执行的C#表达式或脚本代码",
            MatchKeywords = "",
            Payload = new StepQuickInsertCatalog.RunnerPayloadDto
            {
                StepRunnerKey = "sys:evalexpression",
                Name = "表达式",
                ControlFieldValue = "expression",
            }
        };

        var patterns = StepQuickInsertCatalog.SplitKeywordPatterns("bds");
        Assert.IsTrue(StepQuickInsertCatalog.RowMatches(parent, patterns));
        Assert.IsTrue(StepQuickInsertCatalog.RowMatches(child, patterns));

        var parentKey = StepQuickInsertCatalog.ComputeSortKey(parent, patterns);
        var childKey = StepQuickInsertCatalog.ComputeSortKey(child, patterns);
        Assert.IsTrue(
            parentKey >= childKey,
            "parent module row should rank at or above control-field child for the same pinyin hit");
        Assert.AreEqual(0, StepQuickInsertCatalog.QuickInsertSortRankTier(parent));
        Assert.AreEqual(2, StepQuickInsertCatalog.QuickInsertSortRankTier(child));
    }

    [TestMethod]
    public void DesignerFastMatcher_prefers_fastmatcher_over_pinyin_helper_for_bds()
    {
        if (QuickerPinyinReflection.TryResolveFastMatcherType() is null)
        {
            Assert.Inconclusive("FastMatcher not available.");
        }

        var result = DesignerFastMatcher.GetMatchResult("执行表达式", new[] { "bds" });
        Assert.IsNotNull(result);
        Assert.IsTrue(result!.IsMatch);
        Assert.IsTrue(result.Score > 50, "FastMatcher should return a meaningful score for bds on 执行表达式");
    }

    [TestMethod]
    public void RowMatches_pinyin_xianshi_on_label()
    {
        if (QuickerPinyinReflection.TryResolvePinyinHelperType() is null
            && QuickerPinyinReflection.TryResolveFastMatcherType() is null)
        {
            Assert.Inconclusive("Pinyin search helpers not available.");
        }

        var row = new StepQuickInsertCatalog.CatalogRow
        {
            Label = "显示消息",
            MatchSurface = "sys:msgbox 显示消息",
            MatchSurfaceTitle = "sys:msgbox 显示消息",
        };

        Assert.IsTrue(
            StepQuickInsertCatalog.RowMatches(row, new[] { "xianshi" }),
            "RowMatches should match pinyin on the full MatchSurface haystack");
    }

    private static StepQuickInsertCatalog.CatalogRow BuildEvalExpressionRow()
    {
        return new StepQuickInsertCatalog.CatalogRow
        {
            Kind = "runner",
            Id = "r:sys:evalexpression",
            Label = "执行表达式",
            Description = "执行C#表达式或脚本代码，支持使用变量和上下文对象。",
            MatchSurface = "sys:evalexpression 执行表达式 执行C#表达式或脚本代码，支持使用变量和上下文对象。",
            MatchSurfaceTitle = "sys:evalexpression 执行表达式",
            MatchSurfaceDesc = "执行C#表达式或脚本代码，支持使用变量和上下文对象。",
            Payload = new StepQuickInsertCatalog.RunnerPayloadDto
            {
                StepRunnerKey = "sys:evalexpression",
                Name = "执行表达式",
            }
        };
    }
}
