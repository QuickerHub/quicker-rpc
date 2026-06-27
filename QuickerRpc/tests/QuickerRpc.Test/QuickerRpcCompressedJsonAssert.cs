using Microsoft.VisualStudio.TestTools.UnitTesting;
using Newtonsoft.Json.Linq;

namespace QuickerRpc.Test;

internal static class QuickerRpcCompressedJsonAssert
{
    public static JObject ParseRequired(string? compressedJson)
    {
        Assert.IsFalse(string.IsNullOrWhiteSpace(compressedJson), "CompressedJson is empty.");
        return JObject.Parse(compressedJson!);
    }

    public static int StepCount(JObject root) =>
        ((root["steps"] ?? root["Steps"]) as JArray)?.Count ?? 0;

    public static int VariableCount(JObject root) =>
        ((root["variables"] ?? root["Variables"]) as JArray)?.Count ?? 0;

    public static int MetadataStepCount(JObject root) =>
        root["stepCount"]?.ToObject<int>() ?? StepCount(root);

    public static void AssertHasProgramContent(JObject root, string context)
    {
        var steps = StepCount(root);
        var variables = VariableCount(root);
        var metaSteps = root["stepCount"]?.ToObject<int>();
        var hasContent = steps > 0 || variables > 0 || (metaSteps is > 0);
        Assert.IsTrue(
            hasContent,
            $"{context}: expected steps or variables in compressed JSON (steps={steps}, variables={variables}, stepCount={metaSteps}).");
    }

    public static void AssertStepsAndVariablesPositive(JObject root, string context)
    {
        var steps = StepCount(root);
        var variables = VariableCount(root);
        Assert.IsTrue(steps > 0, $"{context}: expected steps > 0 (steps={steps}).");
        Assert.IsTrue(variables > 0, $"{context}: expected variables > 0 (variables={variables}).");
    }
}
