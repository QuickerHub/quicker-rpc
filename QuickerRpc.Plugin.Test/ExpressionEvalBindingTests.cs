using System.Collections.Generic;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using QuickerRpc.Plugin.Services;
using Z.Expressions;

namespace QuickerRpc.Plugin.Test;

[TestClass]
public sealed class ExpressionEvalBindingTests
{
    [TestMethod]
    public void Execute_allows_linq_on_typed_string_global()
    {
        var eval = EvalManager.DefaultContext.Clone();
        eval.UseLocalCache = true;

        const string expression =
            "var words = v_content.Split(new[] { ' ' }, StringSplitOptions.RemoveEmptyEntries)\n"
            + "    .Select(w => w.Trim())\n"
            + "    .Where(w => w.Length > 0)\n"
            + "    .ToList();\n"
            + "words.Count";

        var globals = new Dictionary<string, object?>
        {
            ["v_content"] = "alpha beta gamma",
        };

        var result = ExpressionEvalBinding.Execute(eval, expression, globals);

        Assert.AreEqual(3, result);
    }
}
