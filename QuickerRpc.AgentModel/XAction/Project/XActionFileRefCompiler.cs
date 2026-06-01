using System;
using System.IO;
using System.Linq;
using Newtonsoft.Json.Linq;

namespace QuickerRpc.AgentModel.XAction.Project;

/// <summary>Resolves <c>inputParams.*.file</c> into <c>value</c> before RPC apply.</summary>
public static class XActionFileRefCompiler
{
    public sealed class CompileResult
    {
        public bool Success { get; set; }

        public string? ErrorMessage { get; set; }

        public JObject? CompiledData { get; set; }
    }

    public static CompileResult Compile(JObject data, string projectDirectory)
    {
        if (data["steps"] is not JArray steps)
        {
            return Fail("data.json steps must be an array.");
        }

        var projectDir = QuickerProjectLayout.ResolveProjectDirectory(projectDirectory);
        var clone = (JObject)data.DeepClone();
        var stepsClone = (JArray)clone["steps"]!;
        try
        {
            CompileSteps(stepsClone, projectDir);
            return new CompileResult { Success = true, CompiledData = clone };
        }
        catch (Exception ex)
        {
            return Fail(ex.Message);
        }
    }

    private static void CompileSteps(JArray steps, string projectDir)
    {
        foreach (var token in steps)
        {
            if (token is not JObject step)
            {
                continue;
            }

            if (step["inputParams"] is JObject inputParams)
            {
                CompileInputParams(inputParams, projectDir, DescribeStep(step));
            }

            if (step["ifSteps"] is JArray ifSteps)
            {
                CompileSteps(ifSteps, projectDir);
            }

            if (step["elseSteps"] is JArray elseSteps)
            {
                CompileSteps(elseSteps, projectDir);
            }
        }
    }

    private static void CompileInputParams(JObject inputParams, string projectDir, string stepRef)
    {
        foreach (var prop in inputParams.Properties().ToList())
        {
            if (prop.Value is not JObject paramObj)
            {
                continue;
            }

            var paramRef = $"{stepRef} inputParams.{prop.Name}";
            var hasFile = TryReadNonEmptyString(paramObj["file"], out var filePath);
            var hasValue = paramObj["value"] is not null && paramObj["value"].Type != JTokenType.Null;
            var hasVarKey = TryReadNonEmptyString(paramObj["varKey"], out _);

            if (!hasFile)
            {
                continue;
            }

            if (hasValue)
            {
                throw new InvalidOperationException($"{paramRef}: 'file' and 'value' are mutually exclusive.");
            }

            if (hasVarKey)
            {
                throw new InvalidOperationException($"{paramRef}: 'file' and 'varKey' are mutually exclusive.");
            }

            var fullPath = XActionFileRefPath.ResolveFullPath(projectDir, filePath!);
            if (!File.Exists(fullPath))
            {
                throw new FileNotFoundException($"{paramRef}: file not found: {filePath}", fullPath);
            }

            var text = File.ReadAllText(fullPath, System.Text.Encoding.UTF8);
            paramObj.Remove("file");
            paramObj["value"] = text;
        }
    }

    private static string DescribeStep(JObject step)
    {
        var stepId = step.Value<string>("stepId");
        var runner = step.Value<string>("stepRunnerKey");
        if (!string.IsNullOrWhiteSpace(stepId))
        {
            return $"step {stepId}";
        }

        if (!string.IsNullOrWhiteSpace(runner))
        {
            return $"step ({runner})";
        }

        return "step";
    }

    private static bool TryReadNonEmptyString(JToken? token, out string? value)
    {
        value = token?.Type == JTokenType.String ? token.Value<string>()?.Trim() : null;
        return !string.IsNullOrEmpty(value);
    }

    private static CompileResult Fail(string message) =>
        new CompileResult { Success = false, ErrorMessage = message };
}
