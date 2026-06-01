using System.Reflection;
using Microsoft.VisualStudio.TestTools.UnitTesting;

namespace QuickerRpc.Plugin.Test;

/// <summary>
/// Documents StepInParamDef visibility properties on installed Quicker.exe (Release).
/// </summary>
[TestClass]
public sealed class StepInParamDefReflectionTests
{
    public TestContext TestContext { get; set; } = null!;

    [TestMethod]
    public void StepInParamDef_exposes_visibility_properties()
    {
        var path = QuickerExeProbePaths.ResolveReleaseQuickerExe();
        if (!QuickerExeReflectionProbe.TryLoadQuickerExe(path, TestContext.WriteLine, out var assembly))
        {
            Assert.Inconclusive("Release Quicker.exe not found. Path: " + path);
            return;
        }

        var type = assembly.GetType("Quicker.Domain.Actions.X.StepRunners.StepInParamDef");
        Assert.IsNotNull(type, "StepInParamDef type missing.");

        Assert.IsNotNull(type!.GetProperty("ValidForList"), "ValidForList");
        Assert.IsNotNull(type.GetProperty("InvalidForList"), "InvalidForList");
        Assert.IsNotNull(type.GetProperty("VisibleExpression"), "VisibleExpression");
        Assert.IsNotNull(type.GetProperty("IsControlField"), "IsControlField");
    }
}
