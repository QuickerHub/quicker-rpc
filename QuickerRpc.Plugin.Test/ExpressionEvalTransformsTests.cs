using Microsoft.VisualStudio.TestTools.UnitTesting;
using QuickerRpc.Plugin.Services;

namespace QuickerRpc.Plugin.Test;

[TestClass]
public sealed class ExpressionEvalTransformsTests
{
    [TestMethod]
    public void EnsureTypedSplitAssignment_always_rewrites_v_split()
    {
        const string input = "var lines = v_clipText.Split(new[] { \"\\n\" }, StringSplitOptions.None);";
        var output = ExpressionEvalTransforms.EnsureTypedSplitAssignment(input);

        Assert.AreEqual(
            "var lines = ((string)v_clipText).Split(new[] { \"\\n\" }, StringSplitOptions.None);",
            output);
    }

    [TestMethod]
    public void EnsureTypedSplitAssignment_rewrites_multiline_v_split()
    {
        const string input =
            "var words = v_content\n    .Split(new[] { ' ' }, StringSplitOptions.RemoveEmptyEntries);";
        var output = ExpressionEvalTransforms.EnsureTypedSplitAssignment(input);

        Assert.AreEqual(
            "var words = ((string)v_content)\n    .Split(new[] { ' ' }, StringSplitOptions.RemoveEmptyEntries);",
            output);
    }

    [TestMethod]
    public void EnsureTypedSplitAssignment_keeps_var_for_linq_to_list_chain()
    {
        const string input =
            "var words = v_content.Split(' ').Select(w => w).ToList();";
        var output = ExpressionEvalTransforms.EnsureTypedSplitAssignment(input);

        Assert.AreEqual(
            "var words = ((string)v_content).Split(' ').Select(w => w).ToList();",
            output);
    }
}
