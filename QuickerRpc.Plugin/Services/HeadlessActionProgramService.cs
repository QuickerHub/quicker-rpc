using System;
using System.Collections.Generic;
using System.Linq;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using QuickerRpc.AgentModel.Catalog;
using QuickerRpc.AgentModel.XAction;
using QuickerRpc.AgentModel.XAction.Compression;
using QuickerRpc.Contracts.Rpc;

namespace QuickerRpc.Plugin.Services;

/// <summary>
/// Headless read/write of local XAction programs via Quicker runtime stores (no Action Designer UI).
/// </summary>
public sealed class HeadlessActionProgramService
{
    private readonly LegacyActionProgramAccessor? _actions;
    private readonly ActionEditMgrAccessor? _actionEditMgr;

    public HeadlessActionProgramService()
    {
        _actions = LegacyActionProgramAccessor.TryCreate();
        _actionEditMgr = ActionEditMgrAccessor.TryCreate();
    }

    public QuickerRpcGetCompressedActionResult GetCompressedActionById(string? actionId, string? returnMode)
    {
        var id = (actionId ?? string.Empty).Trim();
        if (id.Length == 0)
        {
            return FailGet("actionId is required.");
        }

        if (!XActionGetReturnModeParser.TryParse(returnMode, out var mode, out var modeError))
        {
            return FailGet(modeError!);
        }

        if (_actions is null || !_actions.IsAvailable)
        {
            return FailGet("DataService unavailable (not running inside Quicker).");
        }

        if (!_actions.TryGetById(id, out var action, out var loadError))
        {
            return FailGet(loadError ?? $"Action not found: {id}");
        }

        if (!_actions.IsXAction(action!))
        {
            return FailGet($"Action {id} is not an XAction program.");
        }

        var payloadJson = _actions.GetPayloadJson(action!);
        if (string.IsNullOrWhiteSpace(payloadJson))
        {
            return FailGet($"Action {id} has no XAction payload.");
        }

        var body = JObject.Parse(payloadJson);
        var steps = body["steps"] as JArray ?? new JArray();
        var variables = body["variables"] as JArray ?? new JArray();
        var subPrograms = body["subPrograms"] as JArray ?? new JArray();
        XActionProgramService.EnsureEphemeralIds(steps, variables);

        var catalog = StepRunnerCatalogFromQuicker.Build();
        var wireMode = XActionGetReturnModeParser.ToWire(mode);
        var editVersion = _actions.GetEditVersion(action!);
        var (title, description, icon) = _actions.GetPresentation(action!);

        JObject compressedRoot;
        bool? omitApplied = null;
        switch (mode)
        {
            case XActionGetReturnMode.Structure:
                compressedRoot = XActionProgramService.Compress(mode, steps, variables, catalog);
                break;
            case XActionGetReturnMode.Metadata:
                compressedRoot = XActionProgramService.Compress(
                    mode,
                    steps,
                    variables,
                    catalog,
                    title: title,
                    description: description,
                    icon: icon,
                    subProgramCount: subPrograms.Count);
                break;
            default:
                compressedRoot = XActionProgramService.Compress(mode, steps, variables, catalog, omitDefaultLiteralInputs: true);
                omitApplied = true;
                break;
        }

        compressedRoot["actionId"] = id;
        compressedRoot["editVersion"] = editVersion;
        compressedRoot["returnMode"] = wireMode;
        compressedRoot["subProgramCount"] = subPrograms.Count;
        if (omitApplied.HasValue)
        {
            compressedRoot["omitDefaultLiteralInputsApplied"] = omitApplied.Value;
        }

        return new QuickerRpcGetCompressedActionResult
        {
            Success = true,
            ActionId = id,
            EditVersion = editVersion,
            CompressedJson = compressedRoot.ToString(Formatting.None),
            OmitDefaultLiteralInputsApplied = omitApplied,
            SubProgramCount = subPrograms.Count,
            ReturnMode = wireMode,
        };
    }

    public QuickerRpcApplyXActionResult ApplyXActionToAction(
        string? actionId,
        string? xActionJson,
        long? expectedEditVersion,
        bool force)
    {
        var id = (actionId ?? string.Empty).Trim();
        if (id.Length == 0)
        {
            return FailApply("actionId is required.");
        }

        if (string.IsNullOrWhiteSpace(xActionJson))
        {
            return FailApply("xActionJson is required.");
        }

        JObject xAction;
        try
        {
            xAction = JObject.Parse(xActionJson);
        }
        catch (Exception ex)
        {
            return FailApply("xActionJson parse failed: " + ex.Message);
        }

        var stepsToken = xAction["steps"];
        var variablesToken = xAction["variables"];
        if (stepsToken is not JArray steps || variablesToken is not JArray variables)
        {
            return FailApply("xAction must contain steps and variables JSON arrays.");
        }

        if (_actions is null || !_actions.IsAvailable || _actionEditMgr?.SaveEditingAction is null)
        {
            return FailApply("Headless action save unavailable.");
        }

        if (!_actions.TryGetById(id, out var action, out var loadError))
        {
            return FailApply(loadError ?? $"Action not found: {id}");
        }

        if (!_actions.IsXAction(action!))
        {
            return FailApply($"Action {id} is not an XAction program.");
        }

        var versionBefore = _actions.GetEditVersion(action!);
        if (!force && expectedEditVersion.HasValue && expectedEditVersion.Value != versionBefore)
        {
            return new QuickerRpcApplyXActionResult
            {
                Success = false,
                ActionId = id,
                ErrorMessage = "Version conflict: action was modified in Quicker. Re-read with action_get or use force.",
                VersionConflict = true,
                EditVersion = versionBefore,
            };
        }

        var catalog = StepRunnerCatalogFromQuicker.Build();
        var normalizedVariables = XActionProgramService.NormalizeVariablesForSave(variables);
        XActionProgramService.NormalizeStepsInputParamKeys(steps, catalog);
        var subProgramsJson = SerializeSubProgramsJson(_actions.GetPayloadJson(action!), xAction["subPrograms"]);

        if (!_actions.TryApplyPayloadAndSave(action!, steps, normalizedVariables, subProgramsJson, _actionEditMgr, out var saveError))
        {
            return FailApply(saveError ?? "save_failed");
        }

        if (!_actions.TryGetById(id, out var saved, out _))
        {
            return FailApply("save finished but action could not be reloaded.");
        }

        return new QuickerRpcApplyXActionResult
        {
            Success = true,
            ActionId = id,
            EditVersion = _actions.GetEditVersion(saved!),
            UpdatedUtc = DateTimeOffset.UtcNow.ToString("o"),
        };
    }

    public QuickerRpcApplyActionPatchResult ApplyActionPatchToAction(
        string? actionId,
        string? patchJson,
        long? expectedEditVersion,
        bool force)
    {
        var id = (actionId ?? string.Empty).Trim();
        if (id.Length == 0)
        {
            return FailPatch("actionId is required.");
        }

        if (string.IsNullOrWhiteSpace(patchJson))
        {
            return FailPatch("patchJson is required.");
        }

        JObject patch;
        try
        {
            patch = JObject.Parse(patchJson);
        }
        catch (Exception ex)
        {
            return FailPatch("patchJson parse failed: " + ex.Message);
        }

        if (_actions is null || !_actions.IsAvailable || _actionEditMgr?.SaveEditingAction is null)
        {
            return FailPatch("Headless action save unavailable.");
        }

        if (!_actions.TryGetById(id, out var action, out var loadError))
        {
            return FailPatch(loadError ?? $"Action not found: {id}");
        }

        if (!_actions.IsXAction(action!))
        {
            return FailPatch($"Action {id} is not an XAction program.");
        }

        var versionBefore = _actions.GetEditVersion(action!);
        if (!force && expectedEditVersion.HasValue && expectedEditVersion.Value != versionBefore)
        {
            return new QuickerRpcApplyActionPatchResult
            {
                Success = false,
                ActionId = id,
                ErrorMessage = "Version conflict: action was modified in Quicker. Re-read with action_get or use force.",
                VersionConflict = true,
                EditVersion = versionBefore,
            };
        }

        var payloadJson = _actions.GetPayloadJson(action!);
        if (string.IsNullOrWhiteSpace(payloadJson))
        {
            return FailPatch($"Action {id} has no XAction payload.");
        }

        var body = JObject.Parse(payloadJson);
        var steps = body["steps"] as JArray ?? new JArray();
        var variables = body["variables"] as JArray ?? new JArray();
        var stepsClone = (JArray)steps.DeepClone();
        var variablesClone = (JArray)variables.DeepClone();

        var applyResult = XActionProgramService.ApplyPatch(stepsClone, variablesClone, patch);
        if (!applyResult.Success)
        {
            return FailPatch(applyResult.ErrorMessage ?? "patch apply failed.");
        }

        var catalog = StepRunnerCatalogFromQuicker.Build();
        var normalizedVariables = XActionProgramService.NormalizeVariablesForSave(variablesClone);
        XActionProgramService.NormalizeStepsInputParamKeys(stepsClone, catalog);
        var subProgramsJson = SerializeSubProgramsJson(payloadJson, subProgramsOverride: null);

        if (!_actions.TryApplyPayloadAndSave(action!, stepsClone, normalizedVariables, subProgramsJson, _actionEditMgr, out var saveError))
        {
            return FailPatch(saveError ?? "save_failed");
        }

        if (!_actions.TryGetById(id, out var saved, out _))
        {
            return FailPatch("save finished but action could not be reloaded.");
        }

        var compressedUpdatedSteps = CompressSteps(applyResult.UpdatedSteps, catalog, omitDefaultLiteralInputs: false);
        var compressedAddedSteps = CompressSteps(applyResult.AddedSteps, catalog, omitDefaultLiteralInputs: false);
        var compressedUpdatedVariables = CompressVariables(applyResult.UpdatedVariables);
        var compressedAddedVariables = CompressVariables(applyResult.AddedVariables);

        return new QuickerRpcApplyActionPatchResult
        {
            Success = true,
            ActionId = id,
            EditVersion = _actions.GetEditVersion(saved!),
            UpdatedStepsJson = compressedUpdatedSteps.ToString(Formatting.None),
            AddedStepsJson = compressedAddedSteps.Count > 0 ? compressedAddedSteps.ToString(Formatting.None) : null,
            UpdatedVariablesJson = compressedUpdatedVariables.ToString(Formatting.None),
            AddedVariablesJson = compressedAddedVariables.Count > 0 ? compressedAddedVariables.ToString(Formatting.None) : null,
            UpdatedUtc = DateTimeOffset.UtcNow.ToString("o"),
        };
    }

    public QuickerRpcSearchActionSummariesResult SearchActionSummaries(string? query, int maxResults)
    {
        if (_actions is null || !_actions.IsAvailable)
        {
            return new QuickerRpcSearchActionSummariesResult
            {
                Success = false,
                ErrorMessage = "DataService unavailable.",
            };
        }

        var max = Math.Max(1, Math.Min(maxResults <= 0 ? 30 : maxResults, 200));
        var q = (query ?? string.Empty).Trim();
        var items = new List<QuickerRpcActionSummaryItem>();

        foreach (var item in _actions.EnumerateAll())
        {
            if (!_actions.IsXAction(item))
            {
                continue;
            }

            var actionId = _actions.GetActionId(item);
            if (string.IsNullOrWhiteSpace(actionId))
            {
                continue;
            }

            var (title, description, icon) = _actions.GetPresentation(item);
            if (q.Length > 0
                && title.IndexOf(q, StringComparison.OrdinalIgnoreCase) < 0
                && description.IndexOf(q, StringComparison.OrdinalIgnoreCase) < 0
                && !string.Equals(actionId, q, StringComparison.OrdinalIgnoreCase))
            {
                continue;
            }

            items.Add(
                new QuickerRpcActionSummaryItem
                {
                    ActionId = actionId,
                    Title = title,
                    Description = description,
                    Icon = icon,
                    LastEditTimeUtc = FormatUtcFromVersion(_actions.GetEditVersion(item)),
                });
        }

        var ordered = items
            .OrderByDescending(x => x.LastEditTimeUtc, StringComparer.Ordinal)
            .Take(max)
            .ToList();

        return new QuickerRpcSearchActionSummariesResult
        {
            Success = true,
            Query = q,
            MatchCount = ordered.Count,
            Items = ordered,
        };
    }

    public QuickerRpcSearchStepRunnersResult SearchStepRunners(string? keyword, int? maxResults)
    {
        if (!QuickerHost.IsRunningInQuicker())
        {
            return new QuickerRpcSearchStepRunnersResult
            {
                Success = false,
                ErrorMessage = "Not running inside Quicker.",
            };
        }

        var catalog = StepRunnerCatalogFromQuicker.Build();
        var mapped = StepRunnerCatalogMapper.Search(catalog, keyword ?? string.Empty, maxResults);
        return new QuickerRpcSearchStepRunnersResult
        {
            Success = mapped.Success,
            ErrorMessage = mapped.ErrorMessage,
            Keyword = mapped.Keyword,
            MatchCount = mapped.MatchCount,
            Items = mapped.Items
                .Select(x => new QuickerRpcStepRunnerSearchItem
                {
                    Key = x.Key,
                    Name = x.Name,
                    Description = x.Description,
                })
                .ToList(),
        };
    }

    public QuickerRpcStepRunnerDetailResult GetStepRunnerDetail(string? stepRunnerKey)
    {
        if (!QuickerHost.IsRunningInQuicker())
        {
            return new QuickerRpcStepRunnerDetailResult
            {
                Success = false,
                ErrorMessage = "Not running inside Quicker.",
            };
        }

        var catalog = StepRunnerCatalogFromQuicker.Build();
        var mapped = StepRunnerCatalogMapper.GetDetail(catalog, stepRunnerKey ?? string.Empty);
        return new QuickerRpcStepRunnerDetailResult
        {
            Success = mapped.Success,
            ErrorMessage = mapped.ErrorMessage,
            SchemaJson = mapped.Schema is null
                ? null
                : JsonConvert.SerializeObject(mapped.Schema, Formatting.None),
        };
    }

    private static string SerializeSubProgramsJson(string? existingPayloadJson, JToken? subProgramsOverride)
    {
        if (subProgramsOverride is JArray subProgramsArray)
        {
            return subProgramsArray.ToString(Formatting.None);
        }

        if (string.IsNullOrWhiteSpace(existingPayloadJson))
        {
            return "[]";
        }

        var token = JObject.Parse(existingPayloadJson)["subPrograms"] as JArray;
        return token is null || token.Count == 0 ? "[]" : token.ToString(Formatting.None);
    }

    private static JArray CompressSteps(
        IEnumerable<JObject> steps,
        StepRunnerCatalog catalog,
        bool omitDefaultLiteralInputs)
    {
        var compressed = new JArray();
        foreach (var step in steps)
        {
            compressed.Add(XActionCompressor.CompressStep(step, catalog, omitDefaultLiteralInputs));
        }

        return compressed;
    }

    private static JArray CompressVariables(IEnumerable<JObject> variables)
    {
        var compressed = new JArray();
        foreach (var variable in variables)
        {
            compressed.Add(XActionCompressor.CompressVariable(variable));
        }

        return compressed;
    }

    private static string FormatUtcFromVersion(long editVersionMs) =>
        editVersionMs > 0
            ? DateTimeOffset.FromUnixTimeMilliseconds(editVersionMs).UtcDateTime.ToString("o")
            : string.Empty;

    private static QuickerRpcGetCompressedActionResult FailGet(string message) =>
        new() { Success = false, ErrorMessage = message };

    private static QuickerRpcApplyXActionResult FailApply(string message) =>
        new() { Success = false, ErrorMessage = message };

    private static QuickerRpcApplyActionPatchResult FailPatch(string message) =>
        new() { Success = false, ErrorMessage = message };
}
