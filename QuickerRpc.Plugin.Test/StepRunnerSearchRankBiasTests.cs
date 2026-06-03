using System.Collections.Generic;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using QuickerRpc.AgentModel.Catalog;

namespace QuickerRpc.Plugin.Test;

[TestClass]
public sealed class StepRunnerSearchRankBiasTests
{
    [TestMethod]
    public void Search_deprioritizes_csscript_below_evalexpression_for_expression_query()
    {
        var catalog = new StepRunnerCatalog
        {
            Items = new List<StepRunnerDefinition>
            {
                new() { Key = "sys:evalexpression", Name = "执行表达式", Description = "执行C#表达式" },
                new() { Key = "sys:csscript", Name = "运行C#代码", Description = "执行C#代码片段" },
                new() { Key = "sys:compute", Name = "计算", Description = "对表达式进行计算" },
            },
        };

        var result = StepRunnerCatalogMapper.Search(catalog, "expression linq", maxResults: 10);
        Assert.IsTrue(result.MatchCount >= 2);
        Assert.AreEqual("sys:evalexpression", result.Items[0].Key);
    }

    [TestMethod]
    public void ComputeRank_positive_bias_boosts_csscript()
    {
        var row = new StepRunnerDefinition { Key = "sys:csscript", Name = "运行C#代码", Description = "x" };
        var rank = StepRunnerKeywordSearch.ComputeRank(row, StepRunnerSearchQuery.Parse("csscript"));
        Assert.IsTrue(rank.ModuleRankBias > 0);
        Assert.IsTrue(rank.TotalScore > rank.ModuleScore + rank.ControlScore);
    }

    [TestMethod]
    public void Search_assign_query_ranks_evalexpression_above_assign_and_compute()
    {
        var catalog = new StepRunnerCatalog
        {
            Items = new List<StepRunnerDefinition>
            {
                new() { Key = "sys:evalexpression", Name = "执行表达式", Description = "执行C#表达式或脚本代码" },
                new() { Key = "sys:assign", Name = "赋值", Description = "为变量赋值。" },
                new() { Key = "sys:compute", Name = "计算", Description = "对表达式进行计算。" },
                new() { Key = "sys:formatString", Name = "组合成文本", Description = "将变量组合成一段文本。" },
            },
        };

        foreach (var query in new[] { "赋值", "assign", "计算" })
        {
            var result = StepRunnerCatalogMapper.Search(catalog, query, maxResults: 5);
            Assert.IsTrue(result.MatchCount >= 1, query);
            Assert.AreEqual("sys:evalexpression", result.Items[0].Key, query);
        }
    }

    [TestMethod]
    public void Search_powershell_query_ranks_runScript_first()
    {
        var catalog = new StepRunnerCatalog
        {
            Items = new List<StepRunnerDefinition>
            {
                new() { Key = "sys:runScript", Name = "运行脚本", Description = "运行脚本" },
                new() { Key = "sys:csscript", Name = "运行C#代码", Description = "C#代码" },
                new() { Key = "sys:run", Name = "运行或打开", Description = "运行软件" },
            },
        };

        var result = StepRunnerCatalogMapper.Search(catalog, "powershell", maxResults: 5);
        Assert.IsTrue(result.MatchCount >= 1);
        Assert.AreEqual("sys:runScript", result.Items[0].Key);
    }

    [TestMethod]
    public void Control_rank_bias_applied_to_total_score()
    {
        var row = new StepRunnerDefinition
        {
            Key = "sys:windowOperations",
            Name = "窗口操作",
            InputParamDefs = new List<StepRunnerInputParamDef>
            {
                new()
                {
                    Key = "type",
                    IsControlField = true,
                    VarType = 9,
                    SelectionItems = new List<StepRunnerParamSelectionItem>
                    {
                        new() { Value = "move_ex", Name = "移动窗口(增强)" },
                    },
                },
            },
        };

        var rank = StepRunnerKeywordSearch.ComputeRank(row, StepRunnerSearchQuery.Parse("移动窗口增强"));
        Assert.AreEqual(8, rank.ControlRankBias);
        Assert.IsTrue(rank.TotalScore >= rank.ModuleScore + rank.ControlScore + rank.ControlRankBias);
    }
}
