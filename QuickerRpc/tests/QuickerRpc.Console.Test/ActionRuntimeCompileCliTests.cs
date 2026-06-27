using Microsoft.VisualStudio.TestTools.UnitTesting;
using QuickerRpc.Console.ActionRuntime;

namespace QuickerRpc.Console.Test;

[TestClass]
public sealed class ActionRuntimeCompileCliTests
{
    [TestMethod]
    public void Compile_AssignPackage_EmitsCSharpScript()
    {
        var build = ActionRuntimePackageBuilder.Build(
            packageFile: FixturePath("assign-only.json"),
            projectDir: null,
            actionId: null,
            xactionInline: null,
            xactionFile: null,
            inputParam: null);
        Assert.IsTrue(build.Success, build.ErrorMessage);

        using var stdout = new StringWriter();
        var originalOut = global::System.Console.Out;
        try
        {
            global::System.Console.SetOut(stdout);
            var exitCode = ActionRuntimeCompileCli.Compile(build, json: false, csharpOut: null, scriptOut: null);
            Assert.AreEqual(ExitCodes.Success, exitCode);
            var output = stdout.ToString();
            StringAssert.Contains(output, "ctx.vars.result");
            StringAssert.Contains(output, "\"ok\"");
        }
        finally
        {
            global::System.Console.SetOut(originalOut);
        }
    }

    [TestMethod]
    public void Compile_AssignPackage_WritesOutFile()
    {
        var build = ActionRuntimePackageBuilder.Build(
            packageFile: FixturePath("assign-only.json"),
            projectDir: null,
            actionId: null,
            xactionInline: null,
            xactionFile: null,
            inputParam: null);
        Assert.IsTrue(build.Success, build.ErrorMessage);

        var outPath = Path.Combine(Path.GetTempPath(), "qkrpc-runtime-compile-" + Guid.NewGuid().ToString("N") + ".cs");
        try
        {
            var exitCode = ActionRuntimeCompileCli.Compile(build, json: false, csharpOut: outPath, scriptOut: null);
            Assert.AreEqual(ExitCodes.Success, exitCode);
            Assert.IsTrue(File.Exists(outPath));
            var text = File.ReadAllText(outPath);
            StringAssert.Contains(text, "ctx.vars.result");
        }
        finally
        {
            if (File.Exists(outPath))
            {
                File.Delete(outPath);
            }
        }
    }

    [TestMethod]
    public void Compile_MixedSupport_EmitsRunStepEscape()
    {
        var build = ActionRuntimePackageBuilder.Build(
            packageFile: FixturePath("mixed-support.json"),
            projectDir: null,
            actionId: null,
            xactionInline: null,
            xactionFile: null,
            inputParam: null);
        Assert.IsTrue(build.Success, build.ErrorMessage);

        using var stdout = new StringWriter();
        var originalOut = global::System.Console.Out;
        try
        {
            global::System.Console.SetOut(stdout);
            var exitCode = ActionRuntimeCompileCli.Compile(build, json: false, csharpOut: null, scriptOut: null);
            Assert.AreEqual(ExitCodes.Success, exitCode);
            StringAssert.Contains(stdout.ToString(), "RunStep");
        }
        finally
        {
            global::System.Console.SetOut(originalOut);
        }
    }

    private static string FixturePath(string relativePath) =>
        Path.Combine(AppContext.BaseDirectory, "Fixtures", relativePath);
}
