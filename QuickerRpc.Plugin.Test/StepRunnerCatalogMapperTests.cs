using System.Collections.Generic;
using System.Linq;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using QuickerRpc.AgentModel.Catalog;

namespace QuickerRpc.Plugin.Test;

[TestClass]
public sealed class StepRunnerCatalogMapperTests
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
                        new() { Key = "hWnd" },
                        new() { Key = "x", ValidForValues = new List<string> { "move" } },
                        new() { Key = "y", ValidForValues = new List<string> { "move" } },
                        new() { Key = "width", ValidForValues = new List<string> { "move" } },
                        new() { Key = "height", ValidForValues = new List<string> { "move" } },
                        new() { Key = "area", ValidForValues = new List<string> { "move_ex" } },
                        new() { Key = "showCmd", ValidForValues = new List<string> { "show" } },
                        new() { Key = "stopIfFail" },
                    },
                },
            },
        };

    [TestMethod]
    public void Search_includes_runner_icon()
    {
        var catalog = new StepRunnerCatalog
        {
            Items = new List<StepRunnerDefinition>
            {
                new()
                {
                    Key = "sys:form",
                    Name = "多字段表单",
                    Icon = "fa:Light_WindowMaximize",
                },
            },
        };

        var result = StepRunnerCatalogMapper.Search(catalog, "form", maxResults: 10);

        Assert.IsTrue(result.Success);
        Assert.AreEqual(1, result.MatchCount);
        Assert.AreEqual("fa:Light_WindowMaximize", result.Items[0].Icon);
    }

    [TestMethod]
    public void GetDetail_includes_runner_icon()
    {
        var catalog = new StepRunnerCatalog
        {
            Items = new List<StepRunnerDefinition>
            {
                new()
                {
                    Key = "sys:form",
                    Name = "多字段表单",
                    Icon = "fa:Light_WindowMaximize",
                },
            },
        };

        var result = StepRunnerCatalogMapper.GetDetail(catalog, "sys:form");

        Assert.IsTrue(result.Success);
        Assert.AreEqual("fa:Light_WindowMaximize", result.Schema!.Icon);
    }

    [TestMethod]
    public void Search_matched_control_selection_sets_control_field_fields()
    {
        var catalog = CreateWindowOperationsCatalog();
        var result = StepRunnerCatalogMapper.Search(catalog, "移动窗口增强", maxResults: 10);

        Assert.IsTrue(result.Success);
        Assert.AreEqual(1, result.MatchCount);
        var item = result.Items[0];
        Assert.AreEqual("sys:windowOperations", item.Key);
        Assert.AreEqual("type", item.ControlFieldKey);
        Assert.AreEqual("move_ex", item.ControlFieldValue);
        Assert.AreEqual("移动窗口(增强)", item.ControlFieldName);
    }

    [TestMethod]
    public void GetDetail_move_ex_omits_move_only_fields()
    {
        var catalog = CreateWindowOperationsCatalog();
        var result = StepRunnerCatalogMapper.GetDetail(catalog, "sys:windowOperations", "move_ex");

        Assert.IsTrue(result.Success);
        var keys = result.Schema!.Inputs.Select(i => i.Key).ToList();
        CollectionAssert.Contains(keys, "type");
        CollectionAssert.Contains(keys, "area");
        CollectionAssert.DoesNotContain(keys, "x");
        CollectionAssert.DoesNotContain(keys, "width");
        Assert.AreEqual("move_ex", result.Schema.AppliedControlFieldValue);
        Assert.IsTrue(result.Schema.VisibilityFilteringAvailable);
    }

    [TestMethod]
    public void GetDetail_move_omits_move_ex_only_fields()
    {
        var catalog = CreateWindowOperationsCatalog();
        var result = StepRunnerCatalogMapper.GetDetail(catalog, "sys:windowOperations", "move");

        Assert.IsTrue(result.Success);
        var keys = result.Schema!.Inputs.Select(i => i.Key).ToList();
        CollectionAssert.Contains(keys, "x");
        CollectionAssert.DoesNotContain(keys, "area");
    }

    [TestMethod]
    public void GetDetail_invalid_control_value_fails()
    {
        var catalog = CreateWindowOperationsCatalog();
        var result = StepRunnerCatalogMapper.GetDetail(catalog, "sys:windowOperations", "not_a_mode");

        Assert.IsFalse(result.Success);
        StringAssert.Contains(result.ErrorMessage!, "Invalid control field value");
        StringAssert.Contains(result.ErrorMessage!, "move_ex");
    }

    [TestMethod]
    public void GetDetail_without_control_field_includes_guidance()
    {
        var catalog = CreateWindowOperationsCatalog();
        var result = StepRunnerCatalogMapper.GetDetail(catalog, "sys:windowOperations");

        Assert.IsTrue(result.Success);
        Assert.IsTrue(result.Schema!.Inputs.Count > 5);
        StringAssert.Contains(result.Schema.AgentGuidance!, "--control-field");
    }
}
