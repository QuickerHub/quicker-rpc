using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using Newtonsoft.Json.Linq;
using QuickerRpc.AgentModel.XAction.Project;

namespace QuickerRpc.AgentModel.XAction.Lint;

/// <summary>Collects expression/C# snippets from a local .quicker program project (no compile).</summary>
public static class ProgramSyntaxCollector
{
    private static readonly HashSet<string> ExpressionRunnerKeys = new(StringComparer.OrdinalIgnoreCase)
    {
        "sys:evalexpression",
    };

    private static readonly HashSet<string> CSharpRunnerKeys = new(StringComparer.OrdinalIgnoreCase)
    {
        "sys:csscript",
    };

    private static readonly HashSet<string> ExpressionParamKeys = new(StringComparer.OrdinalIgnoreCase)
    {
        "expression",
    };

    private static readonly HashSet<string> CSharpParamKeys = new(StringComparer.OrdinalIgnoreCase)
    {
        "script",
        "code",
    };

    public static IList<ProgramSyntaxCheckItem> Collect(string projectDirectory, JObject data)
    {
        var projectDir = QuickerProjectLayout.ResolveProjectDirectory(projectDirectory);
        var variableTypes = BuildVariableTypeMap(data["variables"] as JArray);
        var items = new List<ProgramSyntaxCheckItem>();

        if (data["steps"] is JArray steps)
        {
            ProgramSyntaxStepPaths.Walk(
                steps,
                (step, stepPath, stepId, runnerKey) =>
                    CollectStepInputParams(step, stepPath, stepId, runnerKey, projectDir, variableTypes, items));
        }

        CollectVariableDefaults(data["variables"] as JArray, projectDir, variableTypes, items);
        return items;
    }

    private static void CollectStepInputParams(
        JObject step,
        string stepPath,
        string stepId,
        string runnerKey,
        string projectDir,
        IReadOnlyDictionary<string, string> variableTypes,
        IList<ProgramSyntaxCheckItem> items)
    {
        if (step["inputParams"] is not JObject inputParams)
        {
            return;
        }

        CollectInputParams(
            inputParams,
            projectDir,
            stepId,
            stepPath,
            runnerKey,
            variableTypes,
            items);
    }

    private static void CollectInputParams(
        JObject inputParams,
        string projectDir,
        string stepId,
        string stepPath,
        string runnerKey,
        IReadOnlyDictionary<string, string> variableTypes,
        IList<ProgramSyntaxCheckItem> items)
    {
        foreach (var prop in inputParams.Properties())
        {
            var paramName = prop.Name;
            if (!TryResolveParamCode(projectDir, prop.Value, out var code, out var file))
            {
                continue;
            }

            if (code.Length == 0)
            {
                continue;
            }

            if (IsExpressionTarget(runnerKey, paramName))
            {
                items.Add(new ProgramSyntaxCheckItem
                {
                    Kind = ProgramSyntaxCheckKind.Expression,
                    Code = code,
                    StepRef = stepId,
                    StepId = stepId,
                    StepPath = stepPath,
                    StepRunnerKey = runnerKey,
                    ParamName = paramName,
                    File = file,
                    VariableTypes = variableTypes,
                });
                continue;
            }

            if (IsCSharpTarget(runnerKey, paramName))
            {
                items.Add(new ProgramSyntaxCheckItem
                {
                    Kind = ProgramSyntaxCheckKind.CSharp,
                    Code = code,
                    StepRef = stepId,
                    StepId = stepId,
                    StepPath = stepPath,
                    StepRunnerKey = runnerKey,
                    ParamName = paramName,
                    File = file,
                });
            }
        }
    }

    private static void CollectVariableDefaults(
        JArray? variables,
        string projectDir,
        IReadOnlyDictionary<string, string> variableTypes,
        IList<ProgramSyntaxCheckItem> items)
    {
        if (variables is null)
        {
            return;
        }

        foreach (var token in variables)
        {
            if (token is not JObject varObj)
            {
                continue;
            }

            var varKey = ReadVariableKey(varObj);
            if (varKey.Length == 0)
            {
                continue;
            }

            if (!TryResolveVariableDefault(projectDir, varObj, out var code, out var file))
            {
                continue;
            }

            if (code.Length == 0)
            {
                continue;
            }

            var trimmed = code.TrimStart();
            if (!trimmed.StartsWith("$=", StringComparison.Ordinal)
                && !LooksLikeExpressionBody(trimmed))
            {
                continue;
            }

            items.Add(new ProgramSyntaxCheckItem
            {
                Kind = ProgramSyntaxCheckKind.Expression,
                Code = code,
                VariableKey = varKey,
                File = file,
                VariableTypes = variableTypes,
            });
        }
    }

    private static bool IsExpressionTarget(string runnerKey, string paramName) =>
        ExpressionRunnerKeys.Contains(runnerKey)
        || ExpressionParamKeys.Contains(paramName);

    private static bool IsCSharpTarget(string runnerKey, string paramName) =>
        CSharpRunnerKeys.Contains(runnerKey)
        || (CSharpParamKeys.Contains(paramName) && runnerKey.Contains("csscript", StringComparison.OrdinalIgnoreCase));

    private static bool LooksLikeExpressionBody(string text) =>
        text.Contains("{") && !text.Contains("public static void Exec", StringComparison.OrdinalIgnoreCase);

    private static IReadOnlyDictionary<string, string> BuildVariableTypeMap(JArray? variables)
    {
        var map = new Dictionary<string, string>(StringComparer.Ordinal);
        if (variables is null)
        {
            return map;
        }

        foreach (var token in variables)
        {
            if (token is not JObject varObj)
            {
                continue;
            }

            var key = ReadVariableKey(varObj);
            if (key.Length == 0)
            {
                continue;
            }

            var type = (varObj.Value<string>("type")
                ?? varObj.Value<string>("Type")
                ?? "any").Trim();
            map[key] = MapVariableType(type);
        }

        return map;
    }

    private static string MapVariableType(string raw)
    {
        var normalized = raw.Trim().ToLowerInvariant();
        return normalized switch
        {
            "text" or "string" => "string",
            "number" or "double" or "float" or "decimal" => "double",
            "integer" or "int" => "int",
            "boolean" or "bool" => "bool",
            _ => "string",
        };
    }

    private static string ReadVariableKey(JObject varObj) =>
        (varObj.Value<string>("key") ?? varObj.Value<string>("Key") ?? string.Empty).Trim();

    private static bool TryResolveParamCode(
        string projectDir,
        JToken? paramToken,
        out string code,
        out string? file)
    {
        code = string.Empty;
        file = null;

        if (paramToken is null || paramToken.Type == JTokenType.Null)
        {
            return false;
        }

        if (paramToken.Type == JTokenType.String)
        {
            code = paramToken.Value<string>() ?? string.Empty;
            return code.Length > 0;
        }

        if (paramToken is not JObject paramObj)
        {
            return false;
        }

        if (TryReadNonEmptyString(paramObj["file"], out var filePath))
        {
            file = filePath;
            var fullPath = XActionFileRefPath.ResolveFullPath(projectDir, filePath!);
            if (!File.Exists(fullPath))
            {
                code = string.Empty;
                return true;
            }

            code = File.ReadAllText(fullPath);
            return true;
        }

        if (paramObj["value"] is JToken valueToken && valueToken.Type != JTokenType.Null)
        {
            code = valueToken.Type == JTokenType.String
                ? valueToken.Value<string>() ?? string.Empty
                : valueToken.ToString();
            return code.Length > 0;
        }

        return false;
    }

    private static bool TryResolveVariableDefault(
        string projectDir,
        JObject varObj,
        out string code,
        out string? file)
    {
        code = string.Empty;
        file = null;

        if (VariableDefaultValueRef.TryGetFilePath(varObj, out var filePath))
        {
            file = filePath;
            var fullPath = XActionFileRefPath.ResolveFullPath(projectDir, filePath!);
            code = File.Exists(fullPath) ? File.ReadAllText(fullPath) : string.Empty;
            return true;
        }

        if (VariableDefaultValueRef.TryGetInlineString(varObj, out var inline))
        {
            code = inline ?? string.Empty;
            return code.Length > 0;
        }

        return false;
    }

    private static bool TryReadNonEmptyString(JToken? token, out string? value)
    {
        value = token?.Type == JTokenType.String ? token.Value<string>()?.Trim() : null;
        return !string.IsNullOrEmpty(value);
    }
}
