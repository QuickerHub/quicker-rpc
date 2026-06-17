using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using Quicker.Common;
using Quicker.Common.Vm;
using QuickerRpc.AgentModel.Core;
using QuickerRpc.AgentModel.Catalog;
using QuickerRpc.AgentModel.LocalTime;
using QuickerRpc.AgentModel.XAction;
using QuickerRpc.AgentModel.XAction.Compression;
using QuickerRpc.AgentModel.XAction.Patch;
using QuickerRpc.AgentModel.XAction.Project;
using QuickerRpc.Contracts.Rpc;
using QuickerRpc.Plugin.Catalog.Designer;
using QuickerRpc.Plugin.Services.Search;

namespace QuickerRpc.Plugin.Services;

/// <summary>
/// Headless read/write of local XAction programs via Quicker runtime stores (no Action Designer UI).
/// </summary>
public sealed class HeadlessActionProgramService
{
    private static readonly DesignerStepRunnerSearchService DesignerSearch = new();

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

        id = ActionReadOnlyMutationGuard.ResolveMutationActionId(id);

        if (!XActionGetReturnModeParser.TryParse(returnMode, out var mode, out var modeError))
        {
            return FailGet(modeError!);
        }

        if (ActionDesignerProgramBridge.TryGetCompressedAction(id, mode, out var designerResult))
        {
            return designerResult;
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
        var (title, description, icon, contextMenuData) = _actions.GetPresentation(action!);

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
                    contextMenuData: contextMenuData,
                    subProgramCount: subPrograms.Count);
                break;
            case XActionGetReturnMode.Runtime:
                compressedRoot = new JObject
                {
                    ["steps"] = steps,
                    ["variables"] = variables,
                };
                if (subPrograms.Count > 0)
                {
                    compressedRoot["subPrograms"] = subPrograms;
                }

                break;
            default:
                compressedRoot = XActionProgramService.Compress(mode, steps, variables, catalog, omitDefaultLiteralInputs: true);
                omitApplied = true;
                if (subPrograms.Count > 0)
                {
                    compressedRoot["subPrograms"] = ActionEmbeddedSubProgramWire.CompressFromNative(
                        subPrograms,
                        catalog,
                        omitDefaultLiteralInputs: true);
                }
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
            CompressedJson = JTokenCompat.Compact(compressedRoot),
            OmitDefaultLiteralInputsApplied = omitApplied,
            SubProgramCount = subPrograms.Count,
            ReturnMode = wireMode,
            ReadSource = ActionDesignerProgramBridge.ReadSourceCatalog,
        };
    }

    public QuickerRpcGetCompressedSharedActionResult GetCompressedSharedAction(string? sharedActionId, string? returnMode)
    {
        var idText = (sharedActionId ?? string.Empty).Trim();
        if (idText.Length == 0)
        {
            return FailSharedGet("sharedActionId is required.");
        }

        if (!Guid.TryParse(idText, out var sharedId) || sharedId == Guid.Empty)
        {
            return FailSharedGet($"Invalid sharedActionId: {idText}", "INVALID_SHARED_ACTION_ID");
        }

        if (!XActionGetReturnModeParser.TryParse(returnMode, out var mode, out var modeError))
        {
            return FailSharedGet(modeError!);
        }

        if (!QuickerHost.IsRunningInQuicker())
        {
            return FailSharedGet("Not running inside Quicker.");
        }

        SharedActionDto? loadedDto = null;
        string? payloadJson = null;
        foreach (var rev in DataServiceSharedActionLoader.EnumerateRevisionCandidates(sharedId, 0))
        {
            var dto = DataServiceSharedActionLoader.TryLoad(sharedId, rev);
            if (SharedActionBodyResolver.TryGetBodyJson(dto) is { } json)
            {
                loadedDto = dto;
                payloadJson = json;
                break;
            }
        }

        if (loadedDto is null || string.IsNullOrWhiteSpace(payloadJson))
        {
            return FailSharedGet(
                $"Shared action program not found (cache/SQL/network): {sharedId:D}",
                "SHARED_ACTION_NOT_FOUND");
        }

        var body = JObject.Parse(payloadJson);
        var (steps, variables, subPrograms) = ActionProgramContent.ReadBodyArrays(body);
        XActionProgramService.EnsureEphemeralIds(steps, variables);

        var catalog = StepRunnerCatalogFromQuicker.Build();
        var wireMode = XActionGetReturnModeParser.ToWire(mode);
        var title = loadedDto.Title ?? string.Empty;
        var description = loadedDto.Description ?? string.Empty;
        var icon = loadedDto.Icon ?? string.Empty;

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
                    contextMenuData: string.Empty,
                    subProgramCount: subPrograms.Count);
                break;
            case XActionGetReturnMode.Runtime:
                compressedRoot = new JObject
                {
                    ["steps"] = steps,
                    ["variables"] = variables,
                };
                if (subPrograms.Count > 0)
                {
                    compressedRoot["subPrograms"] = subPrograms;
                }

                break;
            default:
                compressedRoot = XActionProgramService.Compress(mode, steps, variables, catalog, omitDefaultLiteralInputs: true);
                omitApplied = true;
                if (subPrograms.Count > 0)
                {
                    compressedRoot["subPrograms"] = ActionEmbeddedSubProgramWire.CompressFromNative(
                        subPrograms,
                        catalog,
                        omitDefaultLiteralInputs: true);
                }

                break;
        }

        compressedRoot["sharedActionId"] = sharedId.ToString("D");
        compressedRoot["returnMode"] = wireMode;
        compressedRoot["subProgramCount"] = subPrograms.Count;
        if (omitApplied.HasValue)
        {
            compressedRoot["omitDefaultLiteralInputsApplied"] = omitApplied.Value;
        }

        var localActionId = ActionReadOnlyMutationGuard.TryFindLocalActionIdBySharedId(sharedId);
        return new QuickerRpcGetCompressedSharedActionResult
        {
            Success = true,
            SharedActionId = sharedId.ToString("D"),
            ReadOnly = true,
            ReadOnlyReason = "SHARED_ACTION_LEARNING",
            PatchAllowed = false,
            InstalledLocally = localActionId is not null,
            LocalActionId = localActionId,
            CompressedJson = JTokenCompat.Compact(compressedRoot),
            OmitDefaultLiteralInputsApplied = omitApplied,
            SubProgramCount = subPrograms.Count,
            ReturnMode = wireMode,
            ReadSource = "shared-action",
        };
    }

    public static async Task<QuickerRpcSearchActionLibraryResult> SearchActionLibraryOnlineAsync(
        string keyword,
        int page,
        int? days,
        int maxResults,
        CancellationToken cancellationToken = default) =>
        await ActionLibrarySearchService.SearchAsync(keyword, page, days, maxResults, cancellationToken)
            .ConfigureAwait(false);

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

        id = ActionReadOnlyMutationGuard.ResolveMutationActionId(id);

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

        var formCompile = XActionFormSpecCompiler.Compile(xAction, projectDirectory: null);
        if (!formCompile.Success)
        {
            return FailApply(formCompile.ErrorMessage ?? "form spec compile failed.");
        }

        if (_actions is null || !_actions.IsAvailable)
        {
            return FailApply("Headless action save unavailable.");
        }

        _actions.TryGetById(id, out var action, out _);
        if (ActionReadOnlyMutationGuard.TryBuildReplaceFailure(action, id, out var readOnlyApply))
        {
            return readOnlyApply;
        }

        var designerSavedFirst = false;
        if (action is null
            && !TryMaterializeActionFromOpenDesigner(id, out action, ref designerSavedFirst, out var resolveError))
        {
            return FailApply(resolveError ?? $"Action not found: {id}");
        }

        if (!_actions.IsXAction(action!))
        {
            return FailApply($"Action {id} is not an XAction program.");
        }

        var versionBefore = _actions.GetEditVersion(action!);
        var skipVersionCheck = designerSavedFirst
            && expectedEditVersion is null or <= 0;
        if (!force && !skipVersionCheck && expectedEditVersion.HasValue && expectedEditVersion.Value != versionBefore)
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
        var inputParamContext = SubProgramStepInputParamsValidation.CreateContext(xAction["subPrograms"]);
        var inputParamWarnings = XActionProgramService.CollectStepsInputParamsWarnings(steps, catalog, inputParamContext);

        var subProgramsJson = SerializeSubProgramsJson(_actions.GetPayloadJson(action!, out _), xAction["subPrograms"]);

        if (!_actions.TryApplyPayloadAndSave(action!, steps, normalizedVariables, subProgramsJson, _actionEditMgr, out var saveError))
        {
            return FailApply(saveError ?? "save_failed");
        }

        if (!_actions.TryGetById(id, out var saved, out _))
        {
            return FailApply("save finished but action could not be reloaded.");
        }

        try
        {
            ActionProgramPatchUiGate.TryRefreshOpenDesignerProgram(
                id,
                isSubProgram: false,
                steps,
                normalizedVariables,
                subProgramsJson);
        }
        catch
        {
            // Best-effort: catalog save already succeeded.
        }

        var warnings = ToWarningList(inputParamWarnings);
        if (designerSavedFirst)
        {
            warnings = warnings
                .Concat(new[] { "Persisted unsaved Action Designer window before workspace apply." })
                .ToList();
        }

        return new QuickerRpcApplyXActionResult
        {
            Success = true,
            ActionId = id,
            EditVersion = _actions.GetEditVersion(saved!),
            UpdatedUtc = DateTimeOffset.UtcNow.ToString("o"),
            Warnings = warnings,
        };
    }

    public QuickerRpcUpdateActionMetadataResult UpdateActionMetadata(
        string? actionId,
        string? title,
        string? description,
        string? icon,
        string? contextMenuData,
        long? expectedEditVersion,
        bool force)
    {
        var id = (actionId ?? string.Empty).Trim();
        if (id.Length == 0)
        {
            return FailMetadata("actionId is required.");
        }

        id = ActionReadOnlyMutationGuard.ResolveMutationActionId(id);

        if (_actions is null || !_actions.IsAvailable)
        {
            return FailMetadata("Headless action save unavailable.");
        }

        _actions.TryGetById(id, out var action, out _);
        if (ActionReadOnlyMutationGuard.TryBuildMetadataFailure(action, id, out var readOnlyMetadata))
        {
            return readOnlyMetadata;
        }

        if (action is null)
        {
            return FailMetadata($"Action not found: {id}");
        }

        var versionBefore = _actions.GetEditVersion(action);
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

        if (!ActionProgramPersistence.TryUpdatePresentation(
                id,
                title,
                description,
                icon,
                contextMenuData,
                out var saveError))
        {
            return FailMetadata(saveError ?? "save_failed");
        }

        if (!_actions.TryGetById(id, out var saved, out _))
        {
            return FailMetadata("save finished but action could not be reloaded.");
        }

        var (savedTitle, savedDescription, savedIcon, savedContextMenuData) = _actions.GetPresentation(saved!);
        return new QuickerRpcUpdateActionMetadataResult
        {
            Success = true,
            ActionId = id,
            EditVersion = _actions.GetEditVersion(saved!),
            Title = savedTitle,
            Description = savedDescription,
            Icon = savedIcon,
            ContextMenuData = savedContextMenuData,
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

        id = ActionReadOnlyMutationGuard.ResolveMutationActionId(id);

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
        var metaContextMenuData = ActionPresentationUpdate.ReadOptionalPatchString(patch["contextMenuData"]);
        var programPatch = (JObject)patch.DeepClone();
        programPatch.Remove("title");
        programPatch.Remove("description");
        programPatch.Remove("icon");
        programPatch.Remove("contextMenuData");

        var isProgramReplace = XActionPatchApplier.IsProgramReplaceMode(patch);
        if (isProgramReplace
            && (programPatch["steps"] is not JArray || programPatch["variables"] is not JArray))
        {
            return FailPatch("replace patch requires steps and variables JSON arrays (same as action replace).");
        }

        var hasMeta = metaTitle is not null
                      || metaDescription is not null
                      || metaIcon is not null
                      || metaContextMenuData is not null;
        var hasProgramPatch = programPatch["steps"] is JArray || programPatch["variables"] is JArray;
        if (!hasMeta && !hasProgramPatch)
        {
            return FailPatch("patch must contain steps/variables arrays and/or title, description, icon, contextMenuData.");
        }

        var formPreprocess = XActionProgramService.PreprocessPatch(programPatch, projectDirectory: null);
        if (!formPreprocess.Success)
        {
            return FailPatch(formPreprocess.ErrorMessage ?? "form spec compile failed.");
        }

        if (_actions is null || !_actions.IsAvailable)
        {
            return FailPatch("Headless action save unavailable.");
        }

        _actions.TryGetById(id, out var action, out _);
        if (ActionReadOnlyMutationGuard.TryBuildPatchFailure(action, id, out var readOnlyPatch))
        {
            return readOnlyPatch;
        }

        if (ActionDesignerProgramBridge.TryApplyActionPatch(id, patch, expectedEditVersion, force, out var designerPatch))
        {
            return designerPatch;
        }

        var designerSavedFirst = false;
        if (action is null
            && !TryMaterializeActionFromOpenDesigner(id, out action, ref designerSavedFirst, out var resolveError))
        {
            return FailPatch(resolveError ?? $"Action not found: {id}");
        }

        if (hasProgramPatch && !_actions.IsXAction(action!))
        {
            return FailPatch($"Action {id} is not an XAction program.");
        }

        var versionBefore = _actions.GetEditVersion(action!);
        var skipVersionCheck = designerSavedFirst
            && expectedEditVersion is null or <= 0;
        if (!force && !skipVersionCheck && expectedEditVersion.HasValue && expectedEditVersion.Value != versionBefore)
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
            var payloadJson = _actions.GetPayloadJson(action, out var hydrateError);
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
            var subProgramsJson = SerializeSubProgramsJson(payloadJson, programPatch["subPrograms"]);
            var inputParamContext = SubProgramStepInputParamsValidation.CreateContext(JArray.Parse(subProgramsJson));
            inputParamWarnings = XActionProgramService.CollectStepsInputParamsWarnings(stepsClone, catalog, inputParamContext);

            if (!_actions.TryApplyPayloadAndSave(
                    action!,
                    stepsClone,
                    normalizedVariables,
                    subProgramsJson,
                    metaTitle,
                    metaDescription,
                    metaIcon,
                    metaContextMenuData,
                    _actionEditMgr,
                    out var saveError))
            {
                return FailPatch(saveError ?? "save_failed");
            }
        }
        else if (!ActionProgramPersistence.TryUpdatePresentation(
                     id,
                     metaTitle,
                     metaDescription,
                     metaIcon,
                     metaContextMenuData,
                     out var metaSaveError))
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

        ActionSearchIndexInvalidator.InvalidateAction();

        return new QuickerRpcApplyActionPatchResult
        {
            Success = true,
            ActionId = id,
            EditVersion = _actions.GetEditVersion(saved!),
            PresentationUpdated = hasMeta,
            UpdatedStepsJson = JTokenCompat.Compact(compressedUpdatedSteps),
            AddedStepsJson = compressedAddedSteps.Count > 0 ? JTokenCompat.Compact(compressedAddedSteps) : null,
            UpdatedVariablesJson = JTokenCompat.Compact(compressedUpdatedVariables),
            AddedVariablesJson = compressedAddedVariables.Count > 0 ? JTokenCompat.Compact(compressedAddedVariables) : null,
            UpdatedUtc = DateTimeOffset.UtcNow.ToString("o"),
            Warnings = patchWarnings,
            ReadSource = ActionDesignerProgramBridge.ReadSourceCatalog,
            AppliedToDesigner = false,
            Persisted = true,
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

        if (!ActionSearchQuerySpec.TryParse(queryValue, out var spec, out var parseError))
        {
            return new QuickerRpcSearchActionSummariesResult
            {
                Success = false,
                ErrorMessage = parseError ?? "Invalid action query.",
            };
        }

        IReadOnlyList<string>? projectedFields = null;
        if (spec.Fields.Count > 0)
        {
            if (!ActionSummaryFieldCatalog.TryNormalize(spec.Fields, out var normalizedFields, out var fieldError))
            {
                return new QuickerRpcSearchActionSummariesResult
                {
                    Success = false,
                    ErrorMessage = fieldError ?? "Invalid fields.",
                };
            }

            projectedFields = normalizedFields;
        }

        if (spec.SubProgramSearch is { } subProgramSearch
            && !ActionSubProgramCallScanner.TryResolveSubProgram(
                subProgramSearch.SubProgramRef,
                out _,
                out _,
                out var resolveError))
        {
            return new QuickerRpcSearchActionSummariesResult
            {
                Success = false,
                ErrorMessage = resolveError ?? $"Subprogram not found: {subProgramSearch.SubProgramRef}",
            };
        }

        if (spec.SourceFilter is { Kind: ActionSourceFilterKind.SharedId } sharedFilter
            && !Guid.TryParse((sharedFilter.SharedId ?? string.Empty).Trim(), out _))
        {
            return new QuickerRpcSearchActionSummariesResult
            {
                Success = false,
                ErrorMessage = $"Invalid shared action id: {sharedFilter.SharedId}",
            };
        }

        var queryIsEmpty = spec.IsEmpty;
        var sortMode = spec.HasSortScript
            ? ActionSummarySortMode.Relevance
            : ActionSummarySort.Resolve(sort, queryIsEmpty);
        var limitInMatch = !queryIsEmpty
            && (spec.HasSortScript || sortMode == ActionSummarySortMode.Relevance);
        Func<ActionItem, bool>? actionFilter = spec.ApplyXActionCatalogFilter
            ? action => _actions!.IsXAction(action)
            : null;

        if (!ActionCatalogSearch.TryMatchSpec(
                spec,
                scopeValue,
                limit,
                actionFilter,
                action => _actions!.GetEditVersion(action),
                limitResults: limitInMatch,
                out var matches,
                out var matchError))
        {
            return new QuickerRpcSearchActionSummariesResult
            {
                Success = false,
                ErrorMessage = matchError ?? "Action search failed.",
            };
        }

        var rows = matches
            .Select(x => (Match: x, EditMs: _actions!.GetEditVersion(x.Entry.Action)))
            .Where(x => _actions.GetActionId(x.Match.Entry.Action).Length > 0)
            .ToList();

        var ordered = spec.HasSortScript
            ? rows.AsEnumerable()
            : sortMode switch
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
            var action = x.Match.Entry.Action;
            var lastEditUtc = FormatUtcFromVersion(x.EditMs);
            return new QuickerRpcActionSummaryItem
            {
                ActionId = _actions!.GetActionId(action),
                Title = action.Title ?? string.Empty,
                Description = action.Description ?? string.Empty,
                Icon = action.Icon ?? string.Empty,
                LastEditTimeUtc = lastEditUtc,
                LastEditTimeLocal = LocalTimeDisplay.FormatUtcIso(lastEditUtc),
                ProfileId = x.Match.Entry.Profile?.Id,
                ProfileName = x.Match.Entry.Profile?.Name ?? string.Empty,
                ExeFile = x.Match.Entry.Profile?.ExeFile,
                TemplateId = ActionItemSourceHelper.GetTemplateId(action),
                SharedActionId = ActionItemSourceHelper.GetSharedActionId(action),
                Source = ActionItemSourceHelper.ResolveKindToken(action),
                Score = x.Match.Score > 0 ? x.Match.Score : null,
            };
        }).ToList();

        return new QuickerRpcSearchActionSummariesResult
        {
            Success = true,
            Query = queryValue,
            Scope = scopeValue,
            Sort = ActionSummarySort.ToApiValue(sortMode),
            MatchCount = items.Count,
            Fields = projectedFields is null ? null : projectedFields.ToList(),
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
                    Snippet = x.Snippet,
                    ControlField = MapSearchControlField(x.ControlField),
                    ControlFields = MapSearchControlFields(x.ControlFields),
                    Icon = x.Icon,
                })
                .ToList(),
        };
    }

    public QuickerRpcSearchStepRunnersResult ListStepRunners(int? maxResults)
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
        var mapped = StepRunnerCatalogMapper.ListCatalog(catalog, maxResults);
        return new QuickerRpcSearchStepRunnersResult
        {
            Success = mapped.Success,
            ErrorMessage = mapped.ErrorMessage,
            MatchCount = mapped.MatchCount,
            Items = mapped.Items
                .Select(x => new QuickerRpcStepRunnerSearchItem
                {
                    Key = x.Key,
                    Name = x.Name,
                    Description = x.Description,
                    Snippet = x.Snippet,
                    Icon = x.Icon,
                })
                .ToList(),
        };
    }

    private static QuickerRpcStepRunnerSearchControlField? MapSearchControlField(
        StepRunnerControlFieldMatch? match) =>
        match is null
            ? null
            : new QuickerRpcStepRunnerSearchControlField
            {
                Key = match.Key,
                Value = match.Value,
                Name = string.IsNullOrWhiteSpace(match.Name) ? null : match.Name,
            };

    private static IList<QuickerRpcStepRunnerSearchControlField>? MapSearchControlFields(
        IList<StepRunnerControlFieldMatch>? matches)
    {
        if (matches is null || matches.Count <= 1)
        {
            return null;
        }

        return matches
            .Select(m => new QuickerRpcStepRunnerSearchControlField
            {
                Key = m.Key,
                Value = m.Value,
                Name = string.IsNullOrWhiteSpace(m.Name) ? null : m.Name,
            })
            .ToList();
    }

    public QuickerRpcStepRunnerDetailResult GetStepRunnerDetail(
        string? stepRunnerKey,
        string? controlFieldValue = null) =>
        GetStepRunnerDetailCore(stepRunnerKey, controlFieldValue, forAgent: true);

    public QuickerRpcStepRunnerDetailResult GetStepRunnerUiDetail(
        string? stepRunnerKey,
        string? controlFieldValue = null) =>
        GetStepRunnerDetailCore(stepRunnerKey, controlFieldValue, forAgent: false);

    private static QuickerRpcStepRunnerDetailResult GetStepRunnerDetailCore(
        string? stepRunnerKey,
        string? controlFieldValue,
        bool forAgent)
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
                : forAgent
                    ? StepRunnerAgentSchemaJson.Serialize(mapped.Schema)
                    : StepRunnerUiSchemaJson.Serialize(mapped.Schema),
        };
    }

    public QuickerRpcDesignerSearchPageResult SearchStepQuickInsert(
        string? keyword,
        int skip,
        IList<QuickerRpcQuickInsertSubProgramInput>? subPrograms) =>
        DesignerSearch.SearchQuickInsert(keyword, skip, subPrograms);

    public QuickerRpcDesignerSearchPageResult SearchToolboxModules(string? keyword, int skip) =>
        DesignerSearch.SearchToolbox(keyword, skip);

    private static string SerializeSubProgramsJson(string? existingPayloadJson, JToken? subProgramsOverride)
    {
        if (subProgramsOverride is JArray subProgramsArray)
        {
            return JTokenCompat.Compact(subProgramsArray);
        }

        if (string.IsNullOrWhiteSpace(existingPayloadJson))
        {
            return "[]";
        }

        var token = JObject.Parse(existingPayloadJson)["subPrograms"] as JArray;
        return token is null || token.Count == 0 ? "[]" : JTokenCompat.Compact(token);
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

    private bool TryMaterializeActionFromOpenDesigner(
        string id,
        out ActionItem? action,
        ref bool designerSavedFirst,
        out string? error)
    {
        action = null;
        error = null;
        if (_actions is null || !_actions.IsAvailable)
        {
            error = "Headless action save unavailable.";
            return false;
        }

        if (ActionDesignerContext.TryCatalogSaveOpenDesigner(id, isSubProgram: false, out var designerError))
        {
            designerSavedFirst = true;
            if (_actions.TryGetById(id, out action, out _) && action is not null)
            {
                return true;
            }

            error = designerError ?? "Action Designer saved but action could not be reloaded.";
            return false;
        }

        if (designerError is not null)
        {
            error = designerError;
            return false;
        }

        error = $"Action not found: {id}";
        return false;
    }

    private static QuickerRpcGetCompressedActionResult FailGet(string message) =>
        new() { Success = false, ErrorMessage = message };

    private static QuickerRpcGetCompressedSharedActionResult FailSharedGet(
        string message,
        string? errorCode = null) =>
        new() { Success = false, ErrorMessage = message, ErrorCode = errorCode };

    private static QuickerRpcApplyXActionResult FailApply(string message) =>
        new() { Success = false, ErrorMessage = message };

    private static QuickerRpcApplyActionPatchResult FailPatch(string message) =>
        new() { Success = false, ErrorMessage = message };

    private static QuickerRpcUpdateActionMetadataResult FailMetadata(string message) =>
        new() { Success = false, ErrorMessage = message };

    private static List<string> ToWarningList(IList<string> warnings) =>
        warnings.Count == 0 ? new List<string>() : warnings.ToList();
}
