using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using Newtonsoft.Json.Linq;
using QuickerRpc.AgentModel.Form;

namespace QuickerRpc.AgentModel.XAction.Project;

/// <summary>
/// Compiles agent <c>qkrpc.form.v1</c> on <c>sys:form</c> steps into native
/// <c>formDef</c> / <c>dynamicFormForDictDef</c> <c>value</c> before patch apply or project compile.
/// Workspace <c>data.json</c> keeps <c>formDef.file</c>; only in-memory clones sent to Quicker are expanded.
/// </summary>
public static class XActionFormSpecCompiler
{
    public const string FormSpecParamKey = "formSpec";

    private const string FormStepRunnerKey = "sys:form";

    private static readonly string[] FormDefParamKeys = ["formDef", "dynamicFormForDictDef"];

    public sealed class CompileResult
    {
        public bool Success { get; set; }

        public string? ErrorMessage { get; set; }

        public int CompiledStepCount { get; set; }
    }

    public static CompileResult Compile(JObject data, string? projectDirectory) =>
        CompileStepsArray(data["steps"] as JArray, projectDirectory);

    public static CompileResult CompilePatch(JObject patch, string? projectDirectory) =>
        CompileStepsArray(patch["steps"] as JArray, projectDirectory);

    private static CompileResult CompileStepsArray(JArray? steps, string? projectDirectory)
    {
        if (steps is null)
        {
            return new CompileResult { Success = true };
        }

        try
        {
            var compiled = CompileSteps(steps, projectDirectory);
            return new CompileResult { Success = true, CompiledStepCount = compiled };
        }
        catch (Exception ex)
        {
            return new CompileResult { Success = false, ErrorMessage = ex.Message };
        }
    }

    private static int CompileSteps(JArray steps, string? projectDirectory)
    {
        var compiled = 0;
        foreach (var token in steps)
        {
            if (token is not JObject step)
            {
                continue;
            }

            compiled += CompileStep(step, projectDirectory);

            if (step["ifSteps"] is JArray ifSteps)
            {
                compiled += CompileSteps(ifSteps, projectDirectory);
            }

            if (step["elseSteps"] is JArray elseSteps)
            {
                compiled += CompileSteps(elseSteps, projectDirectory);
            }
        }

        return compiled;
    }

    private static int CompileStep(JObject step, string? projectDirectory)
    {
        if (!string.Equals(step.Value<string>("stepRunnerKey"), FormStepRunnerKey, StringComparison.Ordinal))
        {
            return 0;
        }

        if (step["inputParams"] is not JObject inputParams)
        {
            return 0;
        }

        var stepRef = DescribeStep(step);
        var compiled = 0;

        if (inputParams[FormSpecParamKey] is JObject formSpecParam)
        {
            if (inputParams["formDef"] is not null || inputParams["dynamicFormForDictDef"] is not null)
            {
                throw new InvalidOperationException(
                    $"{stepRef}: inputParams.formSpec cannot be used together with formDef or dynamicFormForDictDef.");
            }

            CompileLegacyFormSpec(inputParams, formSpecParam, $"{stepRef} inputParams.{FormSpecParamKey}", projectDirectory);
            return 1;
        }

        foreach (var paramKey in FormDefParamKeys)
        {
            if (inputParams[paramKey] is JObject paramObj
                && TryCompileFormDefParam(
                    inputParams,
                    paramObj,
                    paramKey,
                    $"{stepRef} inputParams.{paramKey}",
                    projectDirectory,
                    stepRef))
            {
                compiled++;
            }
        }

        return compiled;
    }

    private static void CompileLegacyFormSpec(
        JObject inputParams,
        JObject formSpecParam,
        string paramRef,
        string? projectDirectory)
    {
        var specParse = FormSpecParamReader.TryParseParam(formSpecParam, paramRef, projectDirectory);
        if (!specParse.Success)
        {
            throw new InvalidOperationException($"{paramRef}: {specParse.ErrorMessage}");
        }

        var build = FormSpecCompiler.Build(specParse.Spec!);
        if (!build.Success)
        {
            throw new InvalidOperationException($"{paramRef}: {FormatIssues(build.Issues)}");
        }

        MergeBuiltStepOptions(inputParams, build, paramRef);
        inputParams[build.FormParamKey!] = new JObject { ["value"] = build.NativeFormJson };
        inputParams.Remove(FormSpecParamKey);
    }

    private static bool TryCompileFormDefParam(
        JObject inputParams,
        JObject paramObj,
        string paramKey,
        string paramRef,
        string? projectDirectory,
        string stepRef)
    {
        if (FormSpecParamReader.TryParseFormSpecParam(
                paramObj,
                paramRef,
                projectDirectory,
                out var spec,
                out var errorMessage))
        {
            if (errorMessage is not null)
            {
                throw new InvalidOperationException(errorMessage);
            }

            var build = FormSpecCompiler.Build(spec!);
            if (!build.Success)
            {
                throw new InvalidOperationException($"{paramRef}: {FormatIssues(build.Issues)}");
            }

            MergeBuiltStepOptions(inputParams, build, stepRef);
            paramObj.Remove("file");
            paramObj["value"] = build.NativeFormJson;
            return true;
        }

        if (errorMessage is not null)
        {
            throw new InvalidOperationException(errorMessage);
        }

        return TryInlineNativeFormDefFile(paramObj, paramRef, projectDirectory);
    }

    /// <summary>Non-.form.json files: inline raw JSON/text into <c>value</c> on the compile clone only.</summary>
    private static bool TryInlineNativeFormDefFile(
        JObject paramObj,
        string paramRef,
        string? projectDirectory)
    {
        if (!TryReadNonEmptyString(paramObj["file"], out var filePath)
            || FormSpecDocumentShape.LooksLikeFormSpecFile(filePath))
        {
            return false;
        }

        if (string.IsNullOrWhiteSpace(projectDirectory))
        {
            throw new InvalidOperationException(
                $"{paramRef}: formDef.file requires a project directory (use action apply/export project).");
        }

        var projectDir = QuickerProjectLayout.ResolveProjectDirectory(projectDirectory);
        var fullPath = XActionFileRefPath.ResolveFullPath(projectDir, filePath!);
        if (!File.Exists(fullPath))
        {
            throw new FileNotFoundException($"{paramRef}: file not found: {filePath}", fullPath);
        }

        var text = File.ReadAllText(fullPath, Encoding.UTF8);
        paramObj.Remove("file");
        paramObj["value"] = text;
        return true;
    }

    private static void MergeBuiltStepOptions(JObject inputParams, FormSpecBuildResult build, string stepRef)
    {
        if (string.IsNullOrWhiteSpace(build.StepJson) || string.IsNullOrWhiteSpace(build.FormParamKey))
        {
            throw new InvalidOperationException($"{stepRef}: form build returned empty step payload.");
        }

        var builtStep = JObject.Parse(build.StepJson);
        if (builtStep["inputParams"] is not JObject builtParams)
        {
            throw new InvalidOperationException($"{stepRef}: form build returned invalid step payload.");
        }

        foreach (var prop in builtParams.Properties())
        {
            if (string.Equals(prop.Name, build.FormParamKey, StringComparison.Ordinal))
            {
                continue;
            }

            if (inputParams[prop.Name] is null)
            {
                inputParams[prop.Name] = prop.Value.DeepClone();
            }
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

    private static string FormatIssues(IList<FormSpecIssue> issues)
    {
        if (issues.Count == 0)
        {
            return "form spec validation failed.";
        }

        return string.Join(
            "; ",
            issues.Select(i => (string.IsNullOrWhiteSpace(i.Path) ? "" : i.Path + ": ") + i.Message));
    }
}
