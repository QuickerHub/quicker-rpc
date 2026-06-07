using System.Collections.Generic;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using QuickerRpc.Plugin.Services;

namespace QuickerRpc.Plugin.Test;

[TestClass]
public sealed class CodeSyntaxCheckServiceTests
{
    [TestMethod]
    public void NormalizeBareVariableReference_wraps_known_variable_names()
    {
        var variableTypes = new Dictionary<string, string>
        {
            ["selectedFiles"] = "list",
            ["currentFile"] = "string",
        };

        var normalized = CodeSyntaxCheckService.NormalizeBareVariableReference(
            "selectedFiles",
            variableTypes);

        Assert.AreEqual("{selectedFiles}", normalized);
    }

    [TestMethod]
    public void NormalizeIntegerParseCalls_simplifies_parse_on_integer_variables()
    {
        var normalized = CodeSyntaxCheckService.NormalizeIntegerParseCalls(
            "int.Parse({fileCount}) > 0",
            new Dictionary<string, string> { ["fileCount"] = "integer" });

        Assert.AreEqual("{fileCount} > 0", normalized);
    }
}
