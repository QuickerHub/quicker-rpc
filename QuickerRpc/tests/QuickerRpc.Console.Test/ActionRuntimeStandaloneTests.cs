using Microsoft.VisualStudio.TestTools.UnitTesting;
using Quicker.ActionRuntime.Integration;
using QuickerRpc.Console.ActionRuntime;

namespace QuickerRpc.Console.Test;

[TestClass]
public sealed class ActionRuntimeStandaloneTests
{
    [TestMethod]
    public void PackageBuilder_FromPackageFile_LoadsProgram()
    {
        var build = ActionRuntimePackageBuilder.Build(
            packageFile: FixturePath("assign-only.json"),
            projectDir: null,
            actionId: null,
            xactionInline: null,
            xactionFile: null,
            inputParam: null);

        Assert.IsTrue(build.Success, build.ErrorMessage);
        Assert.IsNotNull(build.Package?.Program);
        Assert.AreEqual("sys:assign", build.Package!.Program!.Steps[0].StepRunnerKey);
    }

    [TestMethod]
    public void PackageBuilder_FromProjectDir_LoadsCompiledProgram()
    {
        var build = ActionRuntimePackageBuilder.Build(
            packageFile: null,
            projectDir: FixturePath("standalone-evalexpression"),
            actionId: null,
            xactionInline: null,
            xactionFile: null,
            inputParam: null);

        Assert.IsTrue(build.Success, build.ErrorMessage);
        Assert.IsNotNull(build.Package?.Program);
        Assert.AreEqual(2, build.Package!.Program!.Steps.Count);
        Assert.AreEqual(
            "00000000-0000-4000-8000-000000000001",
            build.Package.ActionId);
        Assert.AreEqual(
            "Standalone runtime smoke (evalexpression)",
            build.Package.ActionTitle);
    }

    [TestMethod]
    public void PackageBuilder_FromInlineXAction_LoadsProgram()
    {
        const string xaction = """
            {
              "steps": [
                {
                  "stepRunnerKey": "sys:assign",
                  "inputParams": { "input": { "value": "x" } },
                  "outputParams": { "output": "out" }
                }
              ],
              "variables": [ { "key": "out" } ]
            }
            """;

        var build = ActionRuntimePackageBuilder.Build(
            packageFile: null,
            projectDir: null,
            actionId: null,
            xactionInline: xaction,
            xactionFile: null,
            inputParam: null);

        Assert.IsTrue(build.Success, build.ErrorMessage);
        Assert.AreEqual("sys:assign", build.Package!.Program!.Steps[0].StepRunnerKey);
    }

    [TestMethod]
    public void PackageBuilder_ConflictingSources_Fails()
    {
        var build = ActionRuntimePackageBuilder.Build(
            packageFile: FixturePath("assign-only.json"),
            projectDir: FixturePath("standalone-evalexpression"),
            actionId: null,
            xactionInline: null,
            xactionFile: null,
            inputParam: null);

        Assert.IsFalse(build.Success);
        Assert.AreEqual("CONFLICTING_RUNTIME_SOURCE", build.ErrorCode);
    }

    [TestMethod]
    public void PackageBuilder_MissingSource_Fails()
    {
        var build = ActionRuntimePackageBuilder.Build(
            packageFile: null,
            projectDir: null,
            actionId: null,
            xactionInline: null,
            xactionFile: null,
            inputParam: null);

        Assert.IsFalse(build.Success);
        Assert.AreEqual("MISSING_RUNTIME_SOURCE", build.ErrorCode);
    }

    [TestMethod]
    public void StandaloneRun_AssignPackage_Succeeds()
    {
        var build = ActionRuntimePackageBuilder.Build(
            packageFile: FixturePath("assign-only.json"),
            projectDir: null,
            actionId: null,
            xactionInline: null,
            xactionFile: null,
            inputParam: null);
        Assert.IsTrue(build.Success, build.ErrorMessage);

        var exitCode = ActionRuntimeCli.Run(
            build,
            json: false,
            debug: false,
            verboseHost: false,
            checkOnly: false);

        Assert.AreEqual(ExitCodes.Success, exitCode);
    }

    [TestMethod]
    public void StandaloneRun_EvalexpressionProject_ComputesVariables()
    {
        var build = ActionRuntimePackageBuilder.Build(
            packageFile: null,
            projectDir: FixturePath("standalone-evalexpression"),
            actionId: null,
            xactionInline: null,
            xactionFile: null,
            inputParam: null);
        Assert.IsTrue(build.Success, build.ErrorMessage);
        Assert.IsTrue(
            build.Package!.Program!.Steps[0].InputParams.TryGetValue("expression", out var expressionParam),
            "expected expression input param");
        Assert.IsFalse(
            string.IsNullOrWhiteSpace(expressionParam!.Value),
            $"expression value missing: '{expressionParam.Value}'");

        var executor = new ActionRuntimeExecutor();
        var result = executor.Execute(build.Package!);

        Assert.IsTrue(result.IsSuccess, result.ErrorMessage);
        Assert.IsNotNull(result.OutputVars);
        Assert.AreEqual("42", result.OutputVars!["sum"]?.ToString());
        Assert.AreEqual("ok:42", result.OutputVars["status"]?.ToString());
    }

    [TestMethod]
    public void StandaloneCheck_FullySupported_ReturnsSuccess()
    {
        var build = ActionRuntimePackageBuilder.Build(
            packageFile: FixturePath("assign-only.json"),
            projectDir: null,
            actionId: null,
            xactionInline: null,
            xactionFile: null,
            inputParam: null);
        Assert.IsTrue(build.Success, build.ErrorMessage);

        var exitCode = ActionRuntimeCli.Run(
            build,
            json: false,
            debug: false,
            verboseHost: false,
            checkOnly: true);

        Assert.AreEqual(ExitCodes.Success, exitCode);
    }

    [TestMethod]
    public void StandaloneCheck_MixedSupport_ReturnsError()
    {
        var build = ActionRuntimePackageBuilder.Build(
            packageFile: FixturePath("mixed-support.json"),
            projectDir: null,
            actionId: null,
            xactionInline: null,
            xactionFile: null,
            inputParam: null);
        Assert.IsTrue(build.Success, build.ErrorMessage);

        var exitCode = ActionRuntimeCli.Run(
            build,
            json: false,
            debug: false,
            verboseHost: false,
            checkOnly: true);

        Assert.AreEqual(ExitCodes.Error, exitCode);

        var report = new ActionRuntimeExecutor().AnalyzeSupport(build.Package!);
        Assert.IsFalse(report.IsFullySupported);
        CollectionAssert.Contains(report.UnsupportedStepKeys.ToList(), "sys:flaUi");
    }

    [TestMethod]
    public void StandaloneKeys_ReturnsSuccess()
    {
        var exitCode = ActionRuntimeCli.Keys(json: false);
        Assert.AreEqual(ExitCodes.Success, exitCode);
    }

    [TestMethod]
    public void PackageBuilder_FromQuickerCompressed_LoadsProgram()
    {
        var dataPath = Path.Combine(
            AppContext.BaseDirectory,
            "Fixtures",
            "standalone-evalexpression",
            "data.json");
        var compressedJson = File.ReadAllText(dataPath);

        var build = ActionRuntimePackageBuilder.BuildFromQuickerCompressed(
            "00000000-0000-4000-8000-000000000001",
            "Standalone runtime smoke (evalexpression)",
            compressedJson,
            inputParam: null);

        Assert.IsTrue(build.Success, build.ErrorMessage);
        Assert.AreEqual("00000000-0000-4000-8000-000000000001", build.Package!.ActionId);
        Assert.AreEqual(
            "Standalone runtime smoke (evalexpression)",
            build.Package.ActionTitle);
        Assert.AreEqual(2, build.Package.Program!.Steps.Count);
    }

    [TestMethod]
    public void PackageBuilder_AppliesInputParam()
    {
        var build = ActionRuntimePackageBuilder.Build(
            packageFile: FixturePath("assign-only.json"),
            projectDir: null,
            actionId: null,
            xactionInline: null,
            xactionFile: null,
            inputParam: "hello");
        Assert.IsTrue(build.Success, build.ErrorMessage);
        Assert.AreEqual("hello", build.Package!.InputParam);
    }

    private static string FixturePath(string relativePath) =>
        Path.Combine(AppContext.BaseDirectory, "Fixtures", relativePath);
}
