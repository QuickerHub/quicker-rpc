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
            "string[] lines = ((string)v_clipText).Split(new[] { \"\\n\" }, StringSplitOptions.None);",
            output);
    }
}
