using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using QuickerRpc.AgentModel.Core;
using QuickerRpc.AgentModel.XAction.Project;
using QuickerRpc.AgentModel.XAction.Proto;

namespace QuickerRpc.Console.ActionRuntime;

internal sealed class ActionRuntimeCompiledFile
{
    public string StepRunnerKey { get; init; } = string.Empty;

    public string ParamKey { get; init; } = string.Empty;

    public string SourceFile { get; init; } = string.Empty;

    public string Language { get; init; } = "text";

    public string Content { get; init; } = string.Empty;
}

internal static class ActionRuntimeCompileArtifacts
{
    internal static IReadOnlyList<ActionRuntimeCompiledFile> CollectInlinedFiles(
        JObject? sourceData,
        JObject? compiledData)
    {
        var list = new List<ActionRuntimeCompiledFile>();
        if (sourceData is null || compiledData is null)
        {
            return list;
        }

        WalkSteps(
            sourceData["steps"] as JArray,
            compiledData["steps"] as JArray,
            list);
        return list;
    }

    private static void WalkSteps(JArray? sourceSteps, JArray? compiledSteps, List<ActionRuntimeCompiledFile> list)
    {
        if (sourceSteps is null || compiledSteps is null)
        {
            return;
        }

        var count = Math.Min(sourceSteps.Count, compiledSteps.Count);
        for (var i = 0; i < count; i++)
        {
            if (sourceSteps[i] is not JObject sourceStep || compiledSteps[i] is not JObject compiledStep)
            {
                continue;
            }

            var runner = sourceStep.Value<string>("stepRunnerKey") ?? string.Empty;
            CompareInputParams(
                sourceStep["inputParams"] as JObject,
                compiledStep["inputParams"] as JObject,
                runner,
                list);
            WalkSteps(sourceStep["ifSteps"] as JArray, compiledStep["ifSteps"] as JArray, list);
            WalkSteps(sourceStep["elseSteps"] as JArray, compiledStep["elseSteps"] as JArray, list);
        }
    }

    private static void CompareInputParams(
        JObject? sourceParams,
        JObject? compiledParams,
        string stepRunnerKey,
        List<ActionRuntimeCompiledFile> list)
    {
        if (sourceParams is null || compiledParams is null)
        {
            return;
        }

        foreach (var prop in sourceParams.Properties())
        {
            if (sourceParams[prop.Name] is not JObject sourceParam
                || compiledParams[prop.Name] is not JObject compiledParam)
            {
                continue;
            }

            var file = sourceParam.Value<string>("file")?.Trim();
            if (string.IsNullOrWhiteSpace(file))
            {
                continue;
            }

            var content = compiledParam.Value<string>("value");
            if (string.IsNullOrWhiteSpace(content))
            {
                continue;
            }

            list.Add(new ActionRuntimeCompiledFile
            {
                StepRunnerKey = stepRunnerKey,
                ParamKey = prop.Name,
                SourceFile = file.Replace('\\', '/'),
                Language = GuessLanguage(file),
                Content = content,
            });
        }
    }

    private static string GuessLanguage(string filePath)
    {
        var file = filePath.Replace('\\', '/');
        if (file.EndsWith(".eval.cs", StringComparison.OrdinalIgnoreCase)
            || file.EndsWith(".cs", StringComparison.OrdinalIgnoreCase))
        {
            return "csharp";
        }

        if (file.EndsWith(".expr", StringComparison.OrdinalIgnoreCase))
        {
            return "expression";
        }

        if (file.EndsWith(".json", StringComparison.OrdinalIgnoreCase))
        {
            return "json";
        }

        return "text";
    }

    internal static string FormatJson(JToken? token) =>
        token is null ? string.Empty : JTokenCompat.Format(token, Formatting.Indented);

    /// <summary>Workspace-style minimal wire JSON (data.json shape).</summary>
    /// <param name="omitSubProgramBodies">
    /// When true, drop <c>subPrograms[]</c> bodies — subprogram calls stay on <c>sys:subprogram</c> steps only.
    /// </param>
    internal static string FormatMinimalWireProgramJson(JToken? token, bool omitSubProgramBodies = false)
    {
        if (token is null)
        {
            return string.Empty;
        }

        if (token is not JObject root)
        {
            return FormatJson(token);
        }

        var body = root["program"] is JObject wrapped ? (JObject)wrapped.DeepClone() : (JObject)root.DeepClone();
        CompactWireProgramBody(body, omitSubProgramBodies);
        return FormatJson(body);
    }

    internal static void CompactWireProgramBody(JObject body, bool omitSubProgramBodies = false)
    {
        NormalizeBodyPropertyNames(body);
        var steps = body["steps"] as JArray;
        var variables = body["variables"] as JArray;
        InputParamWireCoercer.CompactStepsRecursive(steps);
        VariableDefaultValueWireCoercer.CompactVariablesRecursive(variables);
        StripStepMetadataRecursive(steps);
        StripVariableMetadata(variables);
        if (omitSubProgramBodies)
        {
            body.Remove("subPrograms");
            body.Remove("SubPrograms");
        }
        else
        {
            CompactSubPrograms(body["subPrograms"] as JArray);
        }

        body.Remove("limitSingleInstance");
        body.Remove("LimitSingleInstance");
        body.Remove("summaryExpression");
        body.Remove("SummaryExpression");
    }

    private static void NormalizeBodyPropertyNames(JObject body)
    {
        if (body["steps"] is null && body["Steps"] is JArray steps)
        {
            body["steps"] = steps;
            body.Remove("Steps");
        }

        if (body["variables"] is null && body["Variables"] is JArray variables)
        {
            body["variables"] = variables;
            body.Remove("Variables");
        }

        if (body["subPrograms"] is null && body["SubPrograms"] is JArray subPrograms)
        {
            body["subPrograms"] = subPrograms;
            body.Remove("SubPrograms");
        }
    }

    private static void CompactSubPrograms(JArray? subPrograms)
    {
        if (subPrograms is null)
        {
            return;
        }

        foreach (var token in subPrograms.OfType<JObject>())
        {
            CompactWireProgramBody(token);
        }
    }

    private static void StripStepMetadataRecursive(JArray? steps)
    {
        if (steps is null)
        {
            return;
        }

        foreach (var step in steps.OfType<JObject>())
        {
            if (step.Value<bool?>("disabled") != true)
            {
                step.Remove("disabled");
                step.Remove("Disabled");
            }

            if ((step.Value<int?>("delayMs") ?? step.Value<int?>("DelayMs") ?? 0) == 0)
            {
                step.Remove("delayMs");
                step.Remove("DelayMs");
            }

            step.Remove("collapsed");
            step.Remove("Collapsed");
            step.Remove("stepId");
            step.Remove("StepId");
            step.Remove("note");
            step.Remove("Note");

            if (step["inputParams"] is JObject inputParams && inputParams.Count == 0)
            {
                step.Remove("inputParams");
                step.Remove("InputParams");
            }

            if (step["outputParams"] is JObject outputParams && outputParams.Count == 0)
            {
                step.Remove("outputParams");
                step.Remove("OutputParams");
            }

            StripStepMetadataRecursive(step["ifSteps"] as JArray ?? step["IfSteps"] as JArray);
            StripStepMetadataRecursive(step["elseSteps"] as JArray ?? step["ElseSteps"] as JArray);
        }
    }

    private static void StripVariableMetadata(JArray? variables)
    {
        if (variables is null)
        {
            return;
        }

        foreach (var variable in variables.OfType<JObject>())
        {
            var keep = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
            {
                "key",
                VariableDefaultValueWireCoercer.DefaultWireField,
                VariableDefaultValueWireCoercer.DefaultFileWireKey,
            };

            if (variable.Value<bool?>("isOutput") == true || variable.Value<bool?>("IsOutput") == true)
            {
                keep.Add("isOutput");
            }

            foreach (var prop in variable.Properties().ToList())
            {
                if (!keep.Contains(prop.Name))
                {
                    prop.Remove();
                }
            }
        }
    }

    internal static JObject ProgramToJObject(Quicker.ActionRuntime.Abstractions.Models.XAction program)
    {
        var root = new JObject();
        if (!string.IsNullOrWhiteSpace(program.SummaryExpression))
        {
            root["summaryExpression"] = program.SummaryExpression;
        }

        root["limitSingleInstance"] = program.LimitSingleInstance;

        var variables = new JArray();
        foreach (var variable in program.Variables)
        {
            var item = new JObject { ["key"] = variable.Key };
            if (variable.DefaultValue is not null)
            {
                item["defaultValue"] = variable.DefaultValue;
            }

            if (variable.IsOutput)
            {
                item["isOutput"] = true;
            }

            variables.Add(item);
        }

        root["variables"] = variables;
        root["steps"] = StepsToJArray(program.Steps);
        if (program.SubPrograms is { Count: > 0 })
        {
            var subs = new JArray();
            foreach (var sub in program.SubPrograms)
            {
                subs.Add(new JObject
                {
                    ["name"] = sub.Name,
                    ["summaryExpression"] = sub.SummaryExpression,
                    ["variables"] = new JArray(),
                    ["steps"] = StepsToJArray(sub.Steps),
                });
            }

            root["subPrograms"] = subs;
        }

        return root;
    }

    private static JArray StepsToJArray(IList<Quicker.ActionRuntime.Abstractions.Models.ActionStep> steps)
    {
        var array = new JArray();
        foreach (var step in steps)
        {
            var obj = new JObject
            {
                ["stepRunnerKey"] = step.StepRunnerKey,
                ["disabled"] = step.Disabled,
            };
            if (step.DelayMs > 0)
            {
                obj["delayMs"] = step.DelayMs;
            }

            if (!string.IsNullOrWhiteSpace(step.Note))
            {
                obj["note"] = step.Note;
            }

            var inputParams = new JObject();
            foreach (var pair in step.InputParams)
            {
                var param = new JObject();
                if (pair.Value.Value is not null)
                {
                    param["value"] = pair.Value.Value;
                }

                if (!string.IsNullOrWhiteSpace(pair.Value.VarKey))
                {
                    param["varKey"] = pair.Value.VarKey;
                }

                inputParams[pair.Key] = param;
            }

            if (inputParams.Count > 0)
            {
                obj["inputParams"] = inputParams;
            }

            var outputParams = new JObject();
            foreach (var pair in step.OutputParams)
            {
                outputParams[pair.Key] = pair.Value;
            }

            if (outputParams.Count > 0)
            {
                obj["outputParams"] = outputParams;
            }

            if (step.IfSteps is { Count: > 0 })
            {
                obj["ifSteps"] = StepsToJArray(step.IfSteps);
            }

            if (step.ElseSteps is { Count: > 0 })
            {
                obj["elseSteps"] = StepsToJArray(step.ElseSteps);
            }

            array.Add(obj);
        }

        return array;
    }
}
