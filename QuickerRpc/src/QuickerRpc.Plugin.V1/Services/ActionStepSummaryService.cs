using System;
using System.Collections.Generic;
using Newtonsoft.Json;
using Newtonsoft.Json.Serialization;
using Quicker.Domain.Actions.X;
using Quicker.Domain.Actions.X.BuiltinRunners;
using Quicker.Domain.Actions.X.StepRunners;
using QuickerRpc.Contracts.Rpc;
using QuickerRpc.Plugin.Reflection;
using StorageActionStep = Quicker.Domain.Actions.X.Storage.ActionStep;

namespace QuickerRpc.Plugin.Services;

/// <summary>
/// One-line step summaries via Quicker <see cref="IStepRunner.GetSummary"/> (action-editor parity).
/// </summary>
internal static class ActionStepSummaryService
{
    private static readonly JsonSerializerSettings StepJson = new()
    {
        ContractResolver = new CamelCasePropertyNamesContractResolver(),
        NullValueHandling = NullValueHandling.Ignore,
        MissingMemberHandling = MissingMemberHandling.Ignore,
    };

    public static QuickerRpcActionStepSummariesResult GetSummaries(
        IList<QuickerRpcActionStepSummaryInput>? steps,
        string? embeddedSubProgramsJson)
    {
        if (!QuickerInternalAccess.IsInQuicker)
        {
            return Fail("QuickerRpc plugin is not running inside Quicker.");
        }

        if (steps is null || steps.Count == 0)
        {
            return new QuickerRpcActionStepSummariesResult
            {
                Success = true,
                Items = new List<QuickerRpcActionStepSummaryItem>(),
            };
        }

        try
        {
            StepRunnerRegistration.RegisterPluginStepRunners();
            var embedded = ParseEmbeddedSubPrograms(embeddedSubProgramsJson);
            var items = new List<QuickerRpcActionStepSummaryItem>(steps.Count);

            foreach (var input in steps)
            {
                var stepId = (input.StepId ?? string.Empty).Trim();
                if (stepId.Length == 0)
                {
                    continue;
                }

                items.Add(new QuickerRpcActionStepSummaryItem
                {
                    StepId = stepId,
                    Summary = ComputeSummary(
                        (input.StepRunnerKey ?? string.Empty).Trim(),
                        input.StepJson ?? string.Empty,
                        embedded),
                });
            }

            return new QuickerRpcActionStepSummariesResult
            {
                Success = true,
                Items = items,
            };
        }
        catch (Exception ex)
        {
            return Fail(ex.Message);
        }
    }

    private static string ComputeSummary(
        string stepRunnerKey,
        string stepJson,
        IList<SubProgram>? embeddedSubPrograms)
    {
        var step = ParseActionStep(stepRunnerKey, stepJson);
        if (string.IsNullOrWhiteSpace(step.StepRunnerKey))
        {
            return string.Empty;
        }

        var runner = TryGetStepRunner(step.StepRunnerKey);
        if (runner is null)
        {
            return string.Empty;
        }

        var summary = runner.GetSummary(step) ?? string.Empty;
        if (string.IsNullOrEmpty(summary)
            && string.Equals(step.StepRunnerKey, SubProgramStep.StepKey, StringComparison.Ordinal))
        {
            var fromSub = EmbeddedSubProgramStepSummaryEvaluator.TryEvaluate(step, embeddedSubPrograms);
            if (!string.IsNullOrEmpty(fromSub))
            {
                summary = fromSub;
            }
        }

        return summary;
    }

    private static StorageActionStep ParseActionStep(string stepRunnerKey, string stepJson)
    {
        StorageActionStep step;
        if (string.IsNullOrWhiteSpace(stepJson))
        {
            step = new StorageActionStep();
        }
        else
        {
            var trimmed = stepJson.Trim();
            step = trimmed is "{}" or ""
                ? new StorageActionStep()
                : JsonConvert.DeserializeObject<StorageActionStep>(trimmed, StepJson)
                  ?? new StorageActionStep();
        }

        var key = string.IsNullOrWhiteSpace(stepRunnerKey) ? step.StepRunnerKey : stepRunnerKey.Trim();
        step.StepRunnerKey = key ?? string.Empty;
        return step;
    }

    private static IList<SubProgram>? ParseEmbeddedSubPrograms(string? json)
    {
        if (string.IsNullOrWhiteSpace(json))
        {
            return null;
        }

        return JsonConvert.DeserializeObject<IList<SubProgram>>(json.Trim(), StepJson);
    }

    private static IStepRunner? TryGetStepRunner(string key) =>
        StepRunnerRegistration.TryGetRunner(key);

    private static QuickerRpcActionStepSummariesResult Fail(string message) =>
        new()
        {
            Success = false,
            ErrorMessage = message,
            Items = new List<QuickerRpcActionStepSummaryItem>(),
        };
}
