using Microsoft.VisualStudio.TestTools.UnitTesting;
using Newtonsoft.Json.Linq;
using Quicker.ActionRuntime.Integration;
using QuickerRpc.AgentModel.Proto.V1;
using QuickerRpc.AgentModel.XAction.Project;
using QuickerRpc.Console.ActionRuntime;

namespace QuickerRpc.Console.Test;

[TestClass]
public sealed class ActionRuntimeStepCompileTests
{
    [TestMethod]
    public void FileRefCompiler_ResolvesExpressionFile_WireFormat()
    {
        var projectDir = FixturePath("standalone-file-ref");
        var data = QuickerProjectFiles.ReadData(projectDir);

        var compile = XActionFileRefCompiler.Compile(data, projectDir);

        Assert.IsTrue(compile.Success, compile.ErrorMessage);
        Assert.IsNotNull(compile.CompiledData);

        var diskExpr = data["steps"]![0]!["inputParams"]!["expression"] as JObject;
        Assert.AreEqual("files/sum.expr", diskExpr!["file"]!.Value<string>());
        Assert.IsNull(diskExpr["value"]);

        var compiledExpr = compile.CompiledData["steps"]![0]!["inputParams"]!["expression"] as JObject;
        Assert.IsNotNull(compiledExpr);
        Assert.AreEqual("$=10 + 32", compiledExpr!["value"]!.Value<string>()?.Trim());
        Assert.IsNull(compiledExpr["file"]);
    }

    [TestMethod]
    public void PackageBuilder_CompilesExpressionFile_StepReceivesLiteralValue()
    {
        var build = ActionRuntimePackageBuilder.Build(
            packageFile: null,
            projectDir: FixturePath("standalone-file-ref"),
            actionId: null,
            xactionInline: null,
            xactionFile: null,
            inputParam: null);

        Assert.IsTrue(build.Success, build.ErrorMessage);
        Assert.IsTrue(
            build.Package!.Program!.Steps[0].InputParams.TryGetValue("expression", out var expressionParam),
            "expected compiled expression param");
        Assert.AreEqual("$=10 + 32", expressionParam!.Value?.Trim());
    }

    [TestMethod]
    public void StandaloneRun_FileRefExpressionProject_ComputesSum()
    {
        var build = ActionRuntimePackageBuilder.Build(
            packageFile: null,
            projectDir: FixturePath("standalone-file-ref"),
            actionId: null,
            xactionInline: null,
            xactionFile: null,
            inputParam: null);
        Assert.IsTrue(build.Success, build.ErrorMessage);

        var result = new ActionRuntimeExecutor().Execute(build.Package!);

        Assert.IsTrue(result.IsSuccess, result.ErrorMessage);
        Assert.AreEqual("42", result.OutputVars?["sum"]?.ToString());
    }

    [TestMethod]
    public void FileRefCompiler_RejectsMissingExpressionFile()
    {
        var root = Path.Combine(Path.GetTempPath(), "qkrpc-missing-file-" + Guid.NewGuid().ToString("N"));
        try
        {
            Directory.CreateDirectory(root);
            QuickerProjectFiles.WriteActionInfo(root, new ActionProjectInfo
            {
                Id = Guid.NewGuid().ToString(),
                Title = "missing file",
                EditVersion = 1,
            });
            var data = new JObject
            {
                ["steps"] = new JArray
                {
                    new JObject
                    {
                        ["stepRunnerKey"] = "sys:evalexpression",
                        ["inputParams"] = new JObject
                        {
                            ["expression"] = new JObject { ["file"] = "files/missing.expr" },
                        },
                    },
                },
                ["variables"] = new JArray(),
            };
            QuickerProjectFiles.WriteData(root, data);

            var compile = XActionFileRefCompiler.Compile(QuickerProjectFiles.ReadData(root), root);

            Assert.IsFalse(compile.Success);
            Assert.IsFalse(string.IsNullOrWhiteSpace(compile.ErrorMessage));
        }
        finally
        {
            if (Directory.Exists(root))
            {
                Directory.Delete(root, recursive: true);
            }
        }
    }

    private static string FixturePath(string relativePath) =>
        Path.Combine(AppContext.BaseDirectory, "Fixtures", relativePath);
}
