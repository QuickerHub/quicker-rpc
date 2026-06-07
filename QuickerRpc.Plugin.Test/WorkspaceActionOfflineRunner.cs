using System;
using System.Collections.Generic;
using System.Linq;
using Newtonsoft.Json.Linq;
using QuickerRpc.AgentModel.XAction.Testing;
using QuickerRpc.Plugin.Services;

namespace QuickerRpc.Plugin.Test;

/// <summary>
/// Runs supported workspace action steps in-process (no Quicker RPC).
/// Supports <c>sys:evalexpression</c> and 依赖下载_混合模式 (<c>sys:subprogram</c>).
/// </summary>
public sealed class WorkspaceActionOfflineRunner
{
    static WorkspaceActionOfflineRunner()
    {
        QuickerAssemblyResolve.EnsureRegistered();
    }

    public sealed class Options
    {
        /// <summary>Override <c>Documents/Quicker/_packages</c> for dependency download simulation.</summary>
        public string? PackagesRoot { get; set; }
    }

    public sealed class StepRunResult
    {
        public string StepId { get; set; } = string.Empty;

        public string StepRunnerKey { get; set; } = string.Empty;

        public bool Success { get; set; }

        public string? ErrorMessage { get; set; }

        public bool Skipped { get; set; }

        public string? SkipReason { get; set; }
    }

    public sealed class RunResult
    {
        public bool Success { get; set; }

        public string? ErrorMessage { get; set; }

        public IReadOnlyDictionary<string, object?> Variables { get; set; }
            = new Dictionary<string, object?>(StringComparer.Ordinal);

        public IReadOnlyList<StepRunResult> Steps { get; set; } = Array.Empty<StepRunResult>();
    }

    private readonly ExpressionExecuteService _expressionExecute = new();
    private readonly WorkspaceDependencyDownloadSimulator _dependencyDownload = new();

    public RunResult Run(WorkspaceActionTestEnvironment.LoadedProject project, Options? options = null)
    {
        options ??= new Options();
        _dependencyDownload.PackagesRoot = options.PackagesRoot;

        if (project.CompiledData["steps"] is not JArray steps)
        {
            return Fail("Compiled data has no steps array.");
        }

        var variables = ReadVariableDefaults(project.CompiledData["variables"] as JArray);
        var stepResults = new List<StepRunResult>();

        foreach (var token in steps)
        {
            if (token is not JObject step)
            {
                continue;
            }

            if (step.Value<bool?>("disabled") == true)
            {
                stepResults.Add(Skipped(step, "disabled"));
                continue;
            }

            var runnerKey = step.Value<string>("stepRunnerKey") ?? string.Empty;
            var stepId = ReadStepId(step);

            if (string.Equals(runnerKey, "sys:subprogram", StringComparison.OrdinalIgnoreCase))
            {
                var subResult = RunSubprogramStep(step, stepId, variables);
                stepResults.Add(subResult.Step);
                if (!subResult.Step.Success)
                {
                    return Fail(subResult.Step.ErrorMessage ?? "subprogram failed.", variables, stepResults);
                }

                continue;
            }

            if (!string.Equals(runnerKey, "sys:evalexpression", StringComparison.OrdinalIgnoreCase))
            {
                stepResults.Add(Skipped(step, "offline runner supports sys:evalexpression and 依赖下载 subprogram"));
                continue;
            }

            var expression = WorkspaceActionStepParams.ResolveText(step["inputParams"]?["expression"], variables);
            if (string.IsNullOrWhiteSpace(expression))
            {
                return Fail($"Step {stepId}: evalexpression missing expression.", variables, stepResults);
            }

            var exec = _expressionExecute.Execute(expression, SerializeVariables(variables), onUiThread: false);
            if (!exec.Success)
            {
                stepResults.Add(new StepRunResult
                {
                    StepId = stepId,
                    StepRunnerKey = runnerKey,
                    Success = false,
                    ErrorMessage = exec.Message,
                });
                return Fail(exec.Message ?? "expression execute failed.", variables, stepResults);
            }

            MergeVariablesFromJson(variables, exec.VariablesJson);
            ApplyExpressionOutputParams(step["outputParams"] as JObject, exec, variables);
            stepResults.Add(new StepRunResult { StepId = stepId, StepRunnerKey = runnerKey, Success = true });
        }

        return new RunResult
        {
            Success = true,
            Variables = new Dictionary<string, object?>(variables, StringComparer.Ordinal),
            Steps = stepResults,
        };
    }

    private (StepRunResult Step, bool Continue) RunSubprogramStep(
        JObject step,
        string stepId,
        Dictionary<string, object?> variables)
    {
        var runnerKey = step.Value<string>("stepRunnerKey") ?? "sys:subprogram";
        var subProgram = WorkspaceActionStepParams.ResolveText(step["inputParams"]?["subProgram"], variables);
        if (!WorkspaceDependencyDownloadIds.IsDependencyDownloadSubprogram(subProgram))
        {
            return (Skipped(step, $"unsupported subprogram: {subProgram ?? "(null)"}"), false);
        }

        var inputParams = step["inputParams"] as JObject;
        var packageName = WorkspaceActionStepParams.ResolveText(inputParams?["var:package_name"], variables) ?? string.Empty;
        var zipFilename = WorkspaceActionStepParams.ResolveText(inputParams?["var:zip_filename"], variables) ?? string.Empty;
        var version = WorkspaceActionStepParams.ResolveText(inputParams?["var:version"], variables) ?? "0.0.0.0";

        var resolved = _dependencyDownload.TrySimulate(packageName, zipFilename, version);
        if (!resolved.Success)
        {
            return (new StepRunResult
            {
                StepId = stepId,
                StepRunnerKey = runnerKey,
                Success = false,
                ErrorMessage = resolved.ErrorMessage,
            }, false);
        }

        WorkspaceActionStepParams.ApplySubprogramOutputs(
            step["outputParams"] as JObject,
            _dependencyDownload.ToSubprogramOutputs(resolved),
            variables);

        return (new StepRunResult { StepId = stepId, StepRunnerKey = runnerKey, Success = true }, true);
    }

    private static StepRunResult Skipped(JObject step, string reason) =>
        new()
        {
            StepId = ReadStepId(step),
            StepRunnerKey = step.Value<string>("stepRunnerKey") ?? string.Empty,
            Success = true,
            Skipped = true,
            SkipReason = reason,
        };

    private static RunResult Fail(
        string message,
        Dictionary<string, object?>? variables = null,
        List<StepRunResult>? steps = null) =>
        new()
        {
            Success = false,
            ErrorMessage = message,
            Variables = variables ?? new Dictionary<string, object?>(StringComparer.Ordinal),
            Steps = steps is null ? Array.Empty<StepRunResult>() : steps,
        };

    private static string ReadStepId(JObject step) =>
        step.Value<string>("stepId")
        ?? step.Value<string>("id")
        ?? string.Empty;

    private static Dictionary<string, object?> ReadVariableDefaults(JArray? variables)
    {
        var map = new Dictionary<string, object?>(StringComparer.Ordinal);
        if (variables is null)
        {
            return map;
        }

        foreach (var token in variables)
        {
            if (token is not JObject obj)
            {
                continue;
            }

            var key = obj.Value<string>("key");
            if (string.IsNullOrWhiteSpace(key))
            {
                continue;
            }

            map[key] = ReadDefaultValue(obj["defaultValue"]);
        }

        return map;
    }

    private static object? ReadDefaultValue(JToken? token)
    {
        if (token is null || token.Type == JTokenType.Null)
        {
            return null;
        }

        if (token is JValue value)
        {
            return value.Value;
        }

        if (token is JObject obj && obj["value"] is JValue inline)
        {
            return inline.Value;
        }

        return token.ToString();
    }

    private static string SerializeVariables(IReadOnlyDictionary<string, object?> variables)
    {
        var json = variables.ToDictionary(pair => pair.Key, pair => pair.Value, StringComparer.Ordinal);
        return Newtonsoft.Json.JsonConvert.SerializeObject(json);
    }

    private static void MergeVariablesFromJson(Dictionary<string, object?> variables, string? variablesJson)
    {
        if (string.IsNullOrWhiteSpace(variablesJson))
        {
            return;
        }

        var parsed = JObject.Parse(variablesJson);
        foreach (var prop in parsed.Properties())
        {
            variables[prop.Name] = ReadDefaultValue(prop.Value);
        }
    }

    private static void ApplyExpressionOutputParams(
        JObject? outputParams,
        QuickerRpc.Contracts.Rpc.QuickerRpcExpressionExecuteResult exec,
        Dictionary<string, object?> variables)
    {
        if (outputParams is null || outputParams.Count == 0)
        {
            return;
        }

        foreach (var prop in outputParams.Properties())
        {
            var targetKey = prop.Value?.Type == JTokenType.String
                ? prop.Value.Value<string>()
                : prop.Value?["varKey"]?.Value<string>();
            if (string.IsNullOrWhiteSpace(targetKey))
            {
                continue;
            }

            if (string.Equals(prop.Name, "result", StringComparison.OrdinalIgnoreCase))
            {
                variables[targetKey] = exec.ResultJson is null
                    ? null
                    : TryParseJsonScalar(exec.ResultJson);
            }
        }
    }

    private static object? TryParseJsonScalar(string json)
    {
        try
        {
            return JToken.Parse(json).ToObject<object>();
        }
        catch
        {
            return json.Trim('"');
        }
    }
}
