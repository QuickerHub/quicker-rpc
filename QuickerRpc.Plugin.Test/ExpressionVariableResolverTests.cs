using Microsoft.VisualStudio.TestTools.UnitTesting;
using QuickerRpc.Plugin.Services;

namespace QuickerRpc.Plugin.Test;

[TestClass]
public sealed class ExpressionVariableResolverTests
{
    [TestMethod]
    public void ShouldUseClipboardFallback_when_value_is_param_display()
    {
        const string expr = "var lines = {clipText}.Split(";
        const string polluted = "[in]表达式【值/表达式】var lines = {clipText}.Split(";

        Assert.IsTrue(ExpressionVariableResolver.ShouldUseClipboardFallback("clipText", polluted, expr));
    }

    [TestMethod]
    public void ShouldUseClipboardFallback_when_value_echoes_expression()
    {
        const string expr = "var lines = {clipText}.Split(new[] { \"\\n\" }";
        Assert.IsTrue(ExpressionVariableResolver.ShouldUseClipboardFallback("clipText", expr, expr));
    }

    [TestMethod]
    public void ShouldUseClipboardFallback_false_for_other_keys()
    {
        Assert.IsFalse(ExpressionVariableResolver.ShouldUseClipboardFallback("beforeCount", 0, "var lines"));
    }

    [TestMethod]
    public void CoerceToExpressionValue_converts_non_string()
    {
        Assert.AreEqual("42", ExpressionVariableResolver.CoerceToExpressionValue(42));
    }
}
