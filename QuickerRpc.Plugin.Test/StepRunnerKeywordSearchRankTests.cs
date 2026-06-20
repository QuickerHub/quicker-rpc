using System.Collections.Generic;
using System.Linq;
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

    [TestMethod]
    public void Rank_short_move_token_prefers_move_over_move_ex()
    {
        var row = CreateWindowOperationsCatalog().Items[0];
        var rank = StepRunnerKeywordSearch.ComputeRank(row, StepRunnerSearchQuery.Parse("移动"));

        Assert.IsNotNull(rank.Control);
        Assert.AreEqual("move", rank.Control.Value);
    }

    [TestMethod]
    public void Rank_list_ops_add_query_selects_append()
    {
        var row = CreateListOperationsCatalog().Items[0];
        var rank = StepRunnerKeywordSearch.ComputeRank(row, StepRunnerSearchQuery.Parse("添加"));

        Assert.IsNotNull(rank.Control);
        Assert.AreEqual("append", rank.Control.Value);
    }

    [TestMethod]
    public void Rank_list_ops_tie_break_prefers_append_over_removeByMatch()
    {
        var row = CreateListOperationsCatalog().Items[0];
        var rank = StepRunnerKeywordSearch.ComputeRank(row, StepRunnerSearchQuery.Parse("zzz_no_match"));

        Assert.IsNotNull(rank.Control);
        Assert.AreEqual("append", rank.Control.Value);
    }

    [TestMethod]
    public void Search_move_file_finds_file_operation_with_move_into()
    {
        var result = StepRunnerCatalogMapper.Search(CreateFileOperationCatalog(), "移动文件", 5);

        Assert.IsTrue(result.MatchCount >= 1);
        Assert.AreEqual("sys:fileOperation", result.Items[0].Key);
        Assert.AreEqual("moveInto", result.Items[0].ControlField!.Value);
    }

    [TestMethod]
    public void Search_mouse_click_finds_mouse_with_click_control()
    {
        var result = StepRunnerCatalogMapper.Search(CreateMouseCatalog(), "鼠标点击", 5);

        Assert.IsTrue(result.MatchCount >= 1);
        Assert.AreEqual("sys:mouse", result.Items[0].Key);
        Assert.AreEqual("click", result.Items[0].ControlField!.Value);
    }

    private static StepRunnerCatalog CreateFileOperationCatalog() =>
        new()
        {
            Items = new List<StepRunnerDefinition>
            {
                new()
                {
                    Key = "sys:fileOperation",
                    Name = "文件和目录操作",
                    Description = "文件和目录操作。请确保路径是合法的。",
                    InputParamDefs = new List<StepRunnerInputParamDef>
                    {
                        new()
                        {
                            Key = "type",
                            IsControlField = true,
                            VarType = 9,
                            SelectionItems = new List<StepRunnerParamSelectionItem>
                            {
                                new() { Value = "moveInto", Name = "移动到指定目录下" },
                                new() { Value = "moveFile", Name = "移动/重命名文件或文件夹（自动）【不建议使用】" },
                                new() { Value = "copyFile", Name = "复制文件/文件夹（自动）【不建议使用】" },
                            },
                        },
                    },
                },
            },
        };

    private static StepRunnerCatalog CreateMouseCatalog() =>
        new()
        {
            Items = new List<StepRunnerDefinition>
            {
                new()
                {
                    Key = "sys:mouse",
                    Name = "鼠标输入",
                    Description = "模拟鼠标输入",
                    InputParamDefs = new List<StepRunnerInputParamDef>
                    {
                        new()
                        {
                            Key = "type",
                            IsControlField = true,
                            VarType = 9,
                            SelectionItems = new List<StepRunnerParamSelectionItem>
                            {
                                new() { Value = "click", Name = "单击" },
                                new() { Value = "move", Name = "移动距离" },
                                new() { Value = "restore", Name = "还原鼠标位置" },
                            },
                        },
                    },
                },
            },
        };

    private static StepRunnerCatalog CreateListOperationsCatalog() =>
        new()
        {
            Items = new List<StepRunnerDefinition>
            {
                new()
                {
                    Key = "sys:listOperations",
                    Name = "列表操作",
                    InputParamDefs = new List<StepRunnerInputParamDef>
                    {
                        new()
                        {
                            Key = "type",
                            IsControlField = true,
                            VarType = 9,
                            SelectionItems = new List<StepRunnerParamSelectionItem>
                            {
                                new() { Value = "append", Name = "添加元素到末尾" },
                                new() { Value = "removeByMatch", Name = "去除元素(匹配正则表达式的项)" },
                            },
                        },
                    },
                },
            },
        };

    [TestMethod]
    public void Search_expression_query_does_not_match_modules_only_via_notFor_label()
    {
        var catalog = new StepRunnerCatalog
        {
            Items = new List<StepRunnerDefinition>
            {
                new() { Key = "sys:evalexpression", Name = "执行表达式", Description = "执行C#表达式" },
                new() { Key = "sys:joinList", Name = "列表合并成文本", Description = "将列表拼接为一段文本" },
                new() { Key = "sys:splitString", Name = "拆分文本为列表", Description = "将文本拆分为列表" },
            },
        };

        var result = StepRunnerCatalogMapper.Search(catalog, "表达式", maxResults: 10);
        var keys = result.Items.Select(i => i.Key).ToList();

        Assert.AreEqual("sys:evalexpression", result.Items[0].Key);
        CollectionAssert.DoesNotContain(keys, "sys:joinList");
        CollectionAssert.DoesNotContain(keys, "sys:splitString");
    }

    [TestMethod]
    public void Search_expression_query_excludes_modules_with_notFor_expression()
    {
        var catalog = new StepRunnerCatalog
        {
            Items = new List<StepRunnerDefinition>
            {
                new() { Key = "sys:evalexpression", Name = "执行表达式", Description = "执行C#表达式" },
                new() { Key = "sys:compute", Name = "计算", Description = "对表达式进行计算。" },
                new() { Key = "sys:formatString", Name = "组合成文本", Description = "将变量组合成一段文本。" },
                new() { Key = "sys:numCompare", Name = "比较数字", Description = "比较数字大小。" },
            },
        };

        var result = StepRunnerCatalogMapper.Search(catalog, "表达式", maxResults: 20);
        var keys = result.Items.Select(i => i.Key).ToList();

        Assert.IsTrue(result.MatchCount >= 1);
        Assert.AreEqual("sys:evalexpression", result.Items[0].Key);
        CollectionAssert.DoesNotContain(keys, "sys:compute");
        CollectionAssert.DoesNotContain(keys, "sys:formatString");
        CollectionAssert.DoesNotContain(keys, "sys:numCompare");
    }

    [TestMethod]
    public void Search_compare_numbers_still_includes_numCompare()
    {
        var catalog = new StepRunnerCatalog
        {
            Items = new List<StepRunnerDefinition>
            {
                new() { Key = "sys:numCompare", Name = "比较数字", Description = "比较数字大小。" },
                new() { Key = "sys:evalexpression", Name = "执行表达式", Description = "执行C#表达式" },
            },
        };

        var result = StepRunnerCatalogMapper.Search(catalog, "比较数字", maxResults: 10);
        Assert.IsTrue(result.Items.Any(i => i.Key == "sys:numCompare"));
    }

    [TestMethod]
    public void Search_includes_assign_and_get_still_works()
    {
        var catalog = new StepRunnerCatalog
        {
            Items = new List<StepRunnerDefinition>
            {
                new() { Key = "sys:assign", Name = "赋值", Description = "Assign variable" },
                new() { Key = "sys:evalexpression", Name = "执行表达式", Description = "Eval" },
            },
        };

        var search = StepRunnerCatalogMapper.Search(catalog, "赋值", maxResults: 10);
        Assert.IsTrue(search.Items.Any(i => i.Key == "sys:assign"));

        var detail = StepRunnerCatalogMapper.GetDetail(catalog, "sys:assign");
        Assert.IsTrue(detail.Success);
        Assert.IsNotNull(detail.Schema);
        StringAssert.Contains(detail.Schema!.AgentGuidance!, "single-var");
    }

    [TestMethod]
    public void Search_or_query_returns_multiple_control_fields_on_one_module()
    {
        var catalog = new StepRunnerCatalog
        {
            Items = new List<StepRunnerDefinition>
            {
                new()
                {
                    Key = "sys:fileOperation",
                    Name = "文件和目录",
                    InputParamDefs = new List<StepRunnerInputParamDef>
                    {
                        new()
                        {
                            Key = "type",
                            IsControlField = true,
                            VarType = 9,
                            SelectionItems = new List<StepRunnerParamSelectionItem>
                            {
                                new() { Value = "copyInto", Name = "复制到指定目录下" },
                                new() { Value = "deleteFile", Name = "删除文件" },
                            },
                        },
                    },
                },
            },
        };

        var result = StepRunnerCatalogMapper.Search(catalog, "复制文件|删除文件", maxResults: 5);
        Assert.AreEqual(1, result.MatchCount);
        var item = result.Items[0];
        Assert.AreEqual("sys:fileOperation", item.Key);
        Assert.IsNotNull(item.ControlFields);
        Assert.IsTrue(item.ControlFields!.Count >= 2);
        CollectionAssert.AreEquivalent(
            new[] { "copyInto", "deleteFile" },
            item.ControlFields.Select(c => c.Value).ToArray());
        Assert.AreEqual(item.ControlFields[0].Value, item.ControlField!.Value);
    }

    [TestMethod]
    public void Search_obsolete_control_value_not_selected_for_file_move_query()
    {
        var catalog = new StepRunnerCatalog
        {
            Items = new List<StepRunnerDefinition>
            {
                new()
                {
                    Key = "sys:fileOperation",
                    Name = "文件和目录",
                    InputParamDefs = new List<StepRunnerInputParamDef>
                    {
                        new()
                        {
                            Key = "type",
                            IsControlField = true,
                            VarType = 9,
                            SelectionItems = new List<StepRunnerParamSelectionItem>
                            {
                                new() { Value = "moveInto", Name = "移动文件(夹)到指定目录下" },
                                new() { Value = "moveFile", Name = "移动/重命名文件(夹)（自动）【不建议使用】" },
                            },
                        },
                    },
                },
            },
        };

        var result = StepRunnerCatalogMapper.Search(catalog, "移动文件", maxResults: 5);
        Assert.AreEqual(1, result.MatchCount);
        Assert.AreEqual("sys:fileOperation", result.Items[0].Key);
        Assert.AreEqual("moveInto", result.Items[0].ControlField!.Value);
    }
}
