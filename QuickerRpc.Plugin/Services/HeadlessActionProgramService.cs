using System;
using System.Collections.Generic;
using System.Linq;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using Quicker.Common;
using QuickerRpc.AgentModel.Catalog;
using QuickerRpc.AgentModel.LocalTime;
using QuickerRpc.AgentModel.XAction;
using QuickerRpc.AgentModel.XAction.Compression;
using QuickerRpc.AgentModel.XAction.Patch;
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

        var payloadJson = _actions.GetPayloadJson(action!, out var hydrateError);
        if (string.IsNullOrWhiteSpace(payloadJson))
        {
            return FailGet(hydrateError ?? $"Action {id} has no XAction payload.");
        }

        var body = JObject.Parse(payloadJson);
        var (steps, variables, subPrograms) = ActionProgramContent.ReadBodyArrays(body);
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

        if (_actions is null || !_actions.IsAvailable)
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
        var inputParamWarnings = XActionProgramService.CollectStepsInputParamsWarnings(steps, catalog);

        var subProgramsJson = SerializeSubProgramsJson(_actions.GetPayloadJson(action!, out _), xAction["subPrograms"]);

        if (!_actions.TryApplyPayloadAndSave(action!, steps, normalizedVariables, subProgramsJson, _actionEditMgr, out var saveError))
        {
            return FailApply(saveError ?? "save_failed");
        }

        if (!_actions.TryGetById(id, out var saved, out _))
        {
            return FailApply("save finished but action could not be reloaded.");
        }

        ActionMonitorNotifier.Notify();
        return new QuickerRpcApplyXActionResult
        {
            Success = true,
            ActionId = id,
            EditVersion = _actions.GetEditVersion(saved!),
            UpdatedUtc = DateTimeOffset.UtcNow.ToString("o"),
            Warnings = ToWarningList(inputParamWarnings),
        };
    }

    public QuickerRpcUpdateActionMetadataResult UpdateActionMetadata(
        string? actionId,
        string? title,
        string? description,
        string? icon,
        long? expectedEditVersion,
        bool force)
    {
        var id = (actionId ?? string.Empty).Trim();
        if (id.Length == 0)
        {
            return FailMetadata("actionId is required.");
        }

        if (_actions is null || !_actions.IsAvailable)
        {
            return FailMetadata("Headless action save unavailable.");
        }

        if (!_actions.TryGetById(id, out var action, out var loadError))
        {
            return FailMetadata(loadError ?? $"Action not found: {id}");
        }

        var versionBefore = _actions.GetEditVersion(action!);
        if (!force && expectedEditVersion.HasValue && expectedEditVersion.Value != versionBefore)
        {
            return new QuickerRpcUpdateActionMetadataResult
            {
                Success = false,
                ActionId = id,
                ErrorMessage = "Version conflict: action was modified in Quicker. Re-read with action_get or use force.",
                VersionConflict = true,
                EditVersion = versionBefore,
            };
        }

        if (!ActionProgramPersistence.TryUpdatePresentation(id, title, description, icon, out var saveError))
        {
            return FailMetadata(saveError ?? "save_failed");
        }

        if (!_actions.TryGetById(id, out var saved, out _))
        {
            return FailMetadata("save finished but action could not be reloaded.");
        }

        var (savedTitle, savedDescription, savedIcon) = _actions.GetPresentation(saved!);
        ActionMonitorNotifier.Notify();
        return new QuickerRpcUpdateActionMetadataResult
        {
            Success = true,
            ActionId = id,
            EditVersion = _actions.GetEditVersion(saved!),
            Title = savedTitle,
            Description = savedDescription,
            Icon = savedIcon,
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

        var metaTitle = ActionPresentationUpdate.ReadOptionalPatchString(patch["title"]);
        var metaDescription = ActionPresentationUpdate.ReadOptionalPatchString(patch["description"]);
        var metaIcon = ActionPresentationUpdate.ReadOptionalPatchString(patch["icon"]);
        var programPatch = (JObject)patch.DeepClone();
        programPatch.Remove("title");
        programPatch.Remove("description");
        programPatch.Remove("icon");

        var isProgramReplace = XActionPatchApplier.IsProgramReplaceMode(patch);
        if (isProgramReplace
            && (programPatch["steps"] is not JArray || programPatch["variables"] is not JArray))
        {
            return FailPatch("replace patch requires steps and variables JSON arrays (same as action replace).");
        }

        var hasMeta = metaTitle is not null || metaDescription is not null || metaIcon is not null;
        var hasProgramPatch = programPatch["steps"] is JArray || programPatch["variables"] is JArray;
        if (!hasMeta && !hasProgramPatch)
        {
            return FailPatch("patch must contain steps/variables arrays and/or title, description, icon.");
        }

        if (_actions is null || !_actions.IsAvailable)
        {
            return FailPatch("Headless action save unavailable.");
        }

        if (!_actions.TryGetById(id, out var action, out var loadError))
        {
            return FailPatch(loadError ?? $"Action not found: {id}");
        }

        if (hasProgramPatch && !_actions.IsXAction(action!))
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

        XActionPatchApplier.ApplyResult applyResult = new() { Success = true };
        IList<string> inputParamWarnings = Array.Empty<string>();
        if (hasProgramPatch)
        {
            var payloadJson = _actions.GetPayloadJson(action!, out var hydrateError);
            if (string.IsNullOrWhiteSpace(payloadJson))
            {
                return FailPatch(hydrateError ?? $"Action {id} has no XAction payload.");
            }

            var body = JObject.Parse(payloadJson);
            var (steps, variables, _) = ActionProgramContent.ReadBodyArrays(body);
            var stepsClone = (JArray)steps.DeepClone();
            var variablesClone = (JArray)variables.DeepClone();
            XActionProgramService.EnsureEphemeralIds(stepsClone, variablesClone);

            applyResult = XActionProgramService.ApplyPatch(stepsClone, variablesClone, programPatch);
            if (!applyResult.Success)
            {
                return FailPatch(applyResult.ErrorMessage ?? "patch apply failed.");
            }

            var catalog = StepRunnerCatalogFromQuicker.Build();
            var normalizedVariables = XActionProgramService.NormalizeVariablesForSave(variablesClone);
            XActionProgramService.NormalizeStepsInputParamKeys(stepsClone, catalog);
            inputParamWarnings = XActionProgramService.CollectStepsInputParamsWarnings(stepsClone, catalog);

            var subProgramsJson = SerializeSubProgramsJson(payloadJson, programPatch["subPrograms"]);

            if (!_actions.TryApplyPayloadAndSave(
                    action!,
                    stepsClone,
                    normalizedVariables,
                    subProgramsJson,
                    metaTitle,
                    metaDescription,
                    metaIcon,
                    _actionEditMgr,
                    out var saveError))
            {
                return FailPatch(saveError ?? "save_failed");
            }
        }
        else if (!ActionProgramPersistence.TryUpdatePresentation(id, metaTitle, metaDescription, metaIcon, out var metaSaveError))
        {
            return FailPatch(metaSaveError ?? "save_failed");
        }

        if (!_actions.TryGetById(id, out var saved, out _))
        {
            return FailPatch("save finished but action could not be reloaded.");
        }

        var catalogForCompress = StepRunnerCatalogFromQuicker.Build();
        var compressedUpdatedSteps = CompressSteps(applyResult.UpdatedSteps, catalogForCompress, omitDefaultLiteralInputs: false);
        var compressedAddedSteps = CompressSteps(applyResult.AddedSteps, catalogForCompress, omitDefaultLiteralInputs: false);
        var compressedUpdatedVariables = CompressVariables(applyResult.UpdatedVariables);
        var compressedAddedVariables = CompressVariables(applyResult.AddedVariables);

        IList<string> patchWarnings = hasProgramPatch ? ToWarningList(inputParamWarnings) : new List<string>();

        ActionMonitorNotifier.Notify();
        return new QuickerRpcApplyActionPatchResult
        {
            Success = true,
            ActionId = id,
            EditVersion = _actions.GetEditVersion(saved!),
            PresentationUpdated = hasMeta,
            UpdatedStepsJson = compressedUpdatedSteps.ToString(Formatting.None),
            AddedStepsJson = compressedAddedSteps.Count > 0 ? compressedAddedSteps.ToString(Formatting.None) : null,
            UpdatedVariablesJson = compressedUpdatedVariables.ToString(Formatting.None),
            AddedVariablesJson = compressedAddedVariables.Count > 0 ? compressedAddedVariables.ToString(Formatting.None) : null,
            UpdatedUtc = DateTimeOffset.UtcNow.ToString("o"),
            Warnings = patchWarnings,
        };
    }

    public QuickerRpcSearchActionSummariesResult SearchActionSummaries(
        string? query,
        int maxResults,
        string? scope,
        string? sort = null)
    {
        if (_actions is null || !_actions.IsAvailable)
        {
            return new QuickerRpcSearchActionSummariesResult
            {
                Success = false,
                ErrorMessage = "DataService unavailable.",
            };
        }

        if (ProfileManagerAccessor.TryCreate() is null && !string.IsNullOrWhiteSpace(scope))
        {
            return new QuickerRpcSearchActionSummariesResult
            {
                Success = false,
                ErrorMessage = "ProfileManager unavailable (scope filter requires Quicker runtime).",
            };
        }

        var queryValue = (query ?? string.Empty).Trim();
        var scopeValue = string.IsNullOrWhiteSpace(scope) ? null : scope.Trim();
        var limit = ActionSummarySort.ClampLimit(maxResults);
        var sortMode = ActionSummarySort.Resolve(sort, queryValue.Length == 0);
        var queryIsEmpty = queryValue.Length == 0;
        var limitInMatch = !queryIsEmpty && sortMode == ActionSummarySortMode.Relevance;
        // Empty query: library-wide recent edits (composer @-mention, monitor). With query: XAction summaries for agent list/search.
        Func<ActionItem, bool>? actionFilter = queryIsEmpty
            ? null
            : action => _actions!.IsXAction(action);

        var matches = queryIsEmpty
            ? ActionCatalogSearch.ListRecentByLastEdit(
                scopeValue,
                limit,
                actionFilter,
                action => _actions.GetEditVersion(action))
            : ActionCatalogSearch.Match(
                queryValue,
                scopeValue,
                limit,
                actionFilter,
                limitResults: limitInMatch);

        var rows = matches
            .Select(x => (Match: x, EditMs: _actions.GetEditVersion(x.Entry.Action)))
            .Where(x => _actions.GetActionId(x.Match.Entry.Action).Length > 0)
            .ToList();

        var ordered = sortMode switch
        {
            ActionSummarySortMode.LastEditDesc => queryIsEmpty
                ? rows
                : rows
                    .OrderByDescending(x => x.EditMs)
                    .Take(limit),
            ActionSummarySortMode.TitleAsc => rows
                .OrderBy(x => x.Match.Entry.Action.Title, StringComparer.OrdinalIgnoreCase)
                .ThenBy(x => _actions.GetActionId(x.Match.Entry.Action), StringComparer.Ordinal)
                .Take(limit),
            _ => rows.AsEnumerable(),
        };

        var items = ordered.Select(x =>
        {
            var lastEditUtc = FormatUtcFromVersion(x.EditMs);
            return new QuickerRpcActionSummaryItem
            {
                ActionId = _actions!.GetActionId(x.Match.Entry.Action),
                Title = x.Match.Entry.Action.Title ?? string.Empty,
                Description = x.Match.Entry.Action.Description ?? string.Empty,
                Icon = x.Match.Entry.Action.Icon ?? string.Empty,
                LastEditTimeUtc = lastEditUtc,
                LastEditTimeLocal = LocalTimeDisplay.FormatUtcIso(lastEditUtc),
                ProfileId = x.Match.Entry.Profile?.Id,
                ProfileName = x.Match.Entry.Profile?.Name ?? string.Empty,
                ExeFile = x.Match.Entry.Profile?.ExeFile,
            };
        }).ToList();

        return new QuickerRpcSearchActionSummariesResult
        {
            Success = true,
            Query = queryValue,
            Scope = scopeValue,
            Sort = ActionSummarySort.ToApiValue(sortMode),
            MatchCount = items.Count,
            Items = items,
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
                    ControlFieldKey = x.ControlFieldKey,
                    ControlFieldValue = x.ControlFieldValue,
                    ControlFieldName = x.ControlFieldName,
                })
                .ToList(),
        };
    }

    public QuickerRpcStepRunnerDetailResult GetStepRunnerDetail(
        string? stepRunnerKey,
        string? controlFieldValue = null)
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
        var mapped = StepRunnerCatalogMapper.GetDetail(
            catalog,
            stepRunnerKey ?? string.Empty,
            controlFieldValue);
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
            ? DateTimeOffset.FromUnixTimeMilliseconds(editVersionMs).ToUniversalTime().ToString("o")
            : string.Empty;

    private static QuickerRpcGetCompressedActionResult FailGet(string message) =>
        new() { Success = false, ErrorMessage = message };

    private static QuickerRpcApplyXActionResult FailApply(string message) =>
        new() { Success = false, ErrorMessage = message };

    private static QuickerRpcApplyActionPatchResult FailPatch(string message) =>
        new() { Success = false, ErrorMessage = message };

    private static QuickerRpcUpdateActionMetadataResult FailMetadata(string message) =>
        new() { Success = false, ErrorMessage = message };

    private static List<string> ToWarningList(IList<string> warnings) =>
        warnings.Count == 0 ? new List<string>() : warnings.ToList();
}
