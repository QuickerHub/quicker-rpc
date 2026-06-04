using System.Collections.Generic;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using QuickerRpc.AgentModel.Catalog;

namespace QuickerRpc.Plugin.Test;

[TestClass]
public sealed class StepRunnerKeywordSearchRankTests
{
    private static StepRunnerCatalog CreateWindowOperationsCatalog() =>
        new()
        {
            Items = new List<StepRunnerDefinition>
            {
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
                                new() { Value = "show", Name = "设置显示状态" },
                            },
                        },
                    },
                },
                new()
                {
                    Key = "sys:MsgBox",
                    Name = "弹窗提示",
                    Description = "弹窗显示提示",
                },
            },
        };

    [TestMethod]
    public void Rank_move_ex_scores_higher_than_move_for_enhanced_query()
    {
        var row = CreateWindowOperationsCatalog().Items[0];
        var query = StepRunnerSearchQuery.Parse("移动窗口增强");

        var move = StepRunnerKeywordSearch.ComputeRank(row, query);
        Assert.IsNotNull(move.Control);
        Assert.AreEqual("move_ex", move.Control.Value);
        Assert.IsTrue(move.ControlScore > 0);
    }

    [TestMethod]
    public void Search_orders_window_operations_above_msgbox_for_move_query()
    {
        var result = StepRunnerCatalogMapper.Search(CreateWindowOperationsCatalog(), "移动窗口增强", 10);
        Assert.AreEqual("sys:windowOperations", result.Items[0].Key);
        Assert.AreEqual("move_ex", result.Items[0].ControlField!.Value);
    }

    [TestMethod]
    public void Rank_plain_move_selects_move_not_move_ex()
    {
        var row = CreateWindowOperationsCatalog().Items[0];
        var query = StepRunnerSearchQuery.Parse("移动窗口");

        var rank = StepRunnerKeywordSearch.ComputeRank(row, query);
        Assert.IsNotNull(rank.Control);
        Assert.AreEqual("move", rank.Control.Value);
    }
}
