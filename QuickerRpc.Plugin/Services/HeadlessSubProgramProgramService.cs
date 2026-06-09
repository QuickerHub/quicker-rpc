using System;
using System.Collections.Generic;
using System.Linq;
using System.Reflection;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using Quicker.Domain;
using Quicker.Domain.Actions.X;
using Quicker.Utilities;
using QuickerRpc.AgentModel.Core;
using QuickerRpc.AgentModel.Catalog;
using QuickerRpc.AgentModel.Search;
using QuickerRpc.Plugin.Services.Search;
using QuickerRpc.AgentModel.XAction;
using QuickerRpc.AgentModel.XAction.Compression;
using QuickerRpc.AgentModel.XAction.Patch;
using QuickerRpc.AgentModel.XAction.Project;
using QuickerRpc.Contracts.Rpc;
using StorageActionStep = global::Quicker.Domain.Actions.X.Storage.ActionStep;
using StorageActionVariable = global::Quicker.Domain.Actions.X.Storage.ActionVariable;

namespace QuickerRpc.Plugin.Services;

/// <summary>Headless read/write of global (public) subprograms.</summary>
public sealed class HeadlessSubProgramProgramService
{
    private readonly DataServiceSubProgramAccessor? _subPrograms;
    private readonly ActionEditMgrAccessor? _actionEditMgr;
    private readonly AgentSearchHub _searchHub;
    private readonly AgentSearchIndexCoordinator _searchIndex;

    public HeadlessSubProgramProgramService(AgentSearchHub searchHub, AgentSearchIndexCoordinator searchIndex)
    {
        _searchHub = searchHub ?? throw new ArgumentNullException(nameof(searchHub));
        _searchIndex = searchIndex ?? throw new ArgumentNullException(nameof(searchIndex));
        _subPrograms = DataServiceSubProgramAccessor.TryCreate();
        _actionEditMgr = ActionEditMgrAccessor.TryCreate();
    }

    public QuickerRpcGetCompressedSubProgramResult GetCompressedSubProgram(string? subProgramIdOrName, string? returnMode)
    {
        var key = (subProgramIdOrName ?? string.Empty).Trim();
        if (key.Length == 0)
        {
            return FailGet("subProgram id or name is required.");
        }

        if (!XActionGetReturnModeParser.TryParse(returnMode, out var mode, out var modeError))
        {
            return FailGet(modeError!);
        }

        if (_subPrograms is null)
        {
            return FailGet("DataService unavailable (not running inside Quicker).");
        }

        if (!_subPrograms.TryGetByIdOrName(key, out var subProgram, out var loadError))
        {
            return FailGet(loadError ?? $"Subprogram not found: {key}");
        }

        var steps = SubProgramProgramSerialization.StepsToJArray(subProgram!.Steps);
        var variables = SubProgramProgramSerialization.VariablesToJArray(subProgram.Variables);
        XActionProgramService.EnsureEphemeralIds(steps, variables);

        var catalog = StepRunnerCatalogFromQuicker.Build();
        var wireMode = XActionGetReturnModeParser.ToWire(mode);
        var editVersion = _subPrograms.GetEditVersion(subProgram);
        var callIdentifier = DataServiceSubProgramAccessor.GetCallIdentifier(subProgram);

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
                    title: subProgram.Name ?? string.Empty,
                    description: subProgram.Description ?? string.Empty,
                    icon: subProgram.Icon ?? string.Empty,
                    subProgramCount: 0);
                break;
            default:
                compressedRoot = XActionProgramService.Compress(mode, steps, variables, catalog, omitDefaultLiteralInputs: true);
                omitApplied = true;
                break;
        }

        compressedRoot["subProgramId"] = subProgram.Id;
        compressedRoot["name"] = subProgram.Name ?? string.Empty;
        compressedRoot["callIdentifier"] = callIdentifier;
        compressedRoot["editVersion"] = editVersion;
        compressedRoot["returnMode"] = wireMode;
        if (omitApplied.HasValue)
        {
            compressedRoot["omitDefaultLiteralInputsApplied"] = omitApplied.Value;
        }

        return new QuickerRpcGetCompressedSubProgramResult
        {
            Success = true,
            SubProgramId = subProgram.Id,
            Name = subProgram.Name ?? string.Empty,
            CallIdentifier = callIdentifier,
            EditVersion = editVersion,
            CompressedJson = JTokenCompat.Compact(compressedRoot),
            OmitDefaultLiteralInputsApplied = omitApplied,
            ReturnMode = wireMode,
        };
    }

    public QuickerRpcCreateSubProgramResult CreateSubProgram(string? name, string? description, string? icon)
    {
        if (_subPrograms is null)
        {
            return FailCreate("Not running inside Quicker.");
        }

        var subProgramName = (name ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(subProgramName))
        {
            return FailCreate("name is required.");
        }

        if (!DataServiceSubProgramAccessor.IsValidName(subProgramName))
        {
            return FailCreate($"Invalid subprogram name: {subProgramName}");
        }

        if (_subPrograms.TryGetByIdOrName(subProgramName, out _, out _))
        {
            return FailCreate($"Subprogram already exists: {subProgramName}");
        }

        if (!string.IsNullOrWhiteSpace(icon) && !FontAwesomeIconValidation.TryValidate(icon, allowEmpty: false, out var iconError))
        {
            return FailCreate(iconError ?? "Invalid icon.");
        }

        var now = AppHelper.GetUtcNowForDb();
        var subProgram = new SubProgram
        {
            Id = Guid.NewGuid().ToString(),
            Name = subProgramName,
            Description = description ?? string.Empty,
            Icon = icon ?? string.Empty,
            CreateTimeUtc = now,
            LastEditTimeUtc = now,
            Steps = new List<StorageActionStep>(),
            Variables = new List<StorageActionVariable>(),
            SubPrograms = new List<SubProgram>(),
        };

        if (!_subPrograms.TrySave(subProgram, out var saveError))
        {
            return FailCreate(saveError ?? "SaveGlobalSubProgram failed.");
        }

        ActionSearchIndexInvalidator.InvalidateSubProgram();

        return new QuickerRpcCreateSubProgramResult
        {
            Ok = true,
            Message = "公共子程序已创建。",
            SubProgramId = subProgram.Id,
            Name = subProgram.Name,
            CallIdentifier = DataServiceSubProgramAccessor.GetCallIdentifier(subProgram),
            EditVersion = _subPrograms.GetEditVersion(subProgram),
        };
    }

    public QuickerRpcApplySubProgramPatchResult ApplyPatchToSubProgram(
        string? subProgramIdOrName,
        string? patchJson,
        long? expectedEditVersion,
        bool force)
    {
        var key = (subProgramIdOrName ?? string.Empty).Trim();
        if (key.Length == 0)
        {
            return FailPatch("subProgram id or name is required.");
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

        if (_subPrograms is null)
        {
            return FailPatch("Headless subprogram save unavailable.");
        }

        var metaName = SubProgramPresentationUpdate.ReadOptionalPatchName(patch);
        var metaDescription = ActionPresentationUpdate.ReadOptionalPatchString(patch["description"]);
        var metaIcon = ActionPresentationUpdate.ReadOptionalPatchString(patch["icon"]);
        var programPatch = (JObject)patch.DeepClone();
        programPatch.Remove("title");
        programPatch.Remove("name");
        programPatch.Remove("description");
        programPatch.Remove("icon");
        programPatch.Remove("changeLog");
        programPatch.Remove("changelog");

        var hasMeta = metaName is not null || metaDescription is not null || metaIcon is not null;
        var hasProgramPatch = programPatch["steps"] is JArray || programPatch["variables"] is JArray;
        if (!hasMeta && !hasProgramPatch)
        {
            return FailPatch("patch must contain steps/variables arrays and/or title, name, description, icon.");
        }

        var formPreprocess = XActionProgramService.PreprocessPatch(programPatch, projectDirectory: null);
        if (!formPreprocess.Success)
        {
            return FailPatch(formPreprocess.ErrorMessage ?? "form spec compile failed.");
        }

        if (_subPrograms is null)
        {
            return FailPatch("Headless subprogram save unavailable.");
        }

        if (!_subPrograms.TryGetByIdOrName(key, out var subProgram, out var loadError))
        {
            return FailPatch(loadError ?? $"Subprogram not found: {key}");
        }

        var versionBefore = _subPrograms.GetEditVersion(subProgram!);
        if (!force && expectedEditVersion.HasValue && expectedEditVersion.Value != versionBefore)
        {
            return new QuickerRpcApplySubProgramPatchResult
            {
                Success = false,
                SubProgramId = subProgram!.Id,
                ErrorMessage = "Version conflict: subprogram was modified in Quicker. Re-read with subprogram get or use force.",
                VersionConflict = true,
                EditVersion = versionBefore,
            };
        }

        XActionPatchApplier.ApplyResult applyResult = new() { Success = true };
        IList<string> inputParamWarnings = Array.Empty<string>();
        if (hasProgramPatch)
        {
            var steps = SubProgramProgramSerialization.StepsToJArray(subProgram!.Steps);
            var variables = SubProgramProgramSerialization.VariablesToJArray(subProgram.Variables);
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

            if (!SubProgramProgramPersistence.TrySave(
                    subProgram.Id!,
                    stepsClone,
                    normalizedVariables,
                    metaName,
                    metaDescription,
                    metaIcon,
                    out var saveError))
            {
                return FailPatch(saveError ?? "save_failed");
            }
        }
        else if (!SubProgramProgramPersistence.TryUpdatePresentation(
                     subProgram!.Id!,
                     metaName,
                     metaDescription,
                     metaIcon,
                     out var metaSaveError))
        {
            return FailPatch(metaSaveError ?? "save_failed");
        }

        if (!_subPrograms.TryGetByIdOrName(subProgram!.Id!, out var saved, out _))
        {
            return FailPatch("save finished but subprogram could not be reloaded.");
        }

        var catalogForCompress = StepRunnerCatalogFromQuicker.Build();
        var compressedUpdatedSteps = CompressSteps(applyResult.UpdatedSteps, catalogForCompress, omitDefaultLiteralInputs: false);
        var compressedAddedSteps = CompressSteps(applyResult.AddedSteps, catalogForCompress, omitDefaultLiteralInputs: false);
        var compressedUpdatedVariables = CompressVariables(applyResult.UpdatedVariables);
        var compressedAddedVariables = CompressVariables(applyResult.AddedVariables);

        return new QuickerRpcApplySubProgramPatchResult
        {
            Success = true,
            SubProgramId = saved!.Id,
            CallIdentifier = DataServiceSubProgramAccessor.GetCallIdentifier(saved),
            EditVersion = _subPrograms.GetEditVersion(saved),
            UpdatedStepsJson = JTokenCompat.Compact(compressedUpdatedSteps),
            AddedStepsJson = compressedAddedSteps.Count > 0 ? JTokenCompat.Compact(compressedAddedSteps) : null,
            UpdatedVariablesJson = JTokenCompat.Compact(compressedUpdatedVariables),
            AddedVariablesJson = compressedAddedVariables.Count > 0 ? JTokenCompat.Compact(compressedAddedVariables) : null,
            UpdatedUtc = DateTimeOffset.UtcNow.ToString("o"),
            Warnings = inputParamWarnings.Count > 0 ? new List<string>(inputParamWarnings) : null,
        };
    }

    public QuickerRpcApplySubProgramPatchResult ApplyProgramToSubProgram(
        string? subProgramIdOrName,
        string? programJson,
        long? expectedEditVersion,
        bool force)
    {
        var key = (subProgramIdOrName ?? string.Empty).Trim();
        if (key.Length == 0)
        {
            return FailPatch("subProgram id or name is required.");
        }

        if (string.IsNullOrWhiteSpace(programJson))
        {
            return FailPatch("programJson is required.");
        }

        JObject body;
        try
        {
            body = JObject.Parse(programJson);
        }
        catch (Exception ex)
        {
            return FailPatch("programJson parse failed: " + ex.Message);
        }

        var stepsToken = body["steps"];
        var variablesToken = body["variables"];
        if (stepsToken is not JArray steps || variablesToken is not JArray variables)
        {
            return FailPatch("program must contain steps and variables JSON arrays.");
        }

        var formCompile = XActionFormSpecCompiler.Compile(body, projectDirectory: null);
        if (!formCompile.Success)
        {
            return FailPatch(formCompile.ErrorMessage ?? "form spec compile failed.");
        }

        if (_subPrograms is null)
        {
            return FailPatch("Headless subprogram save unavailable.");
        }

        if (!_subPrograms.TryGetByIdOrName(key, out var subProgram, out var loadError))
        {
            return FailPatch(loadError ?? $"Subprogram not found: {key}");
        }

        var versionBefore = _subPrograms.GetEditVersion(subProgram!);
        if (!force && expectedEditVersion.HasValue && expectedEditVersion.Value != versionBefore)
        {
            return new QuickerRpcApplySubProgramPatchResult
            {
                Success = false,
                SubProgramId = subProgram!.Id,
                ErrorMessage = "Version conflict: subprogram was modified in Quicker. Re-read with subprogram get or use force.",
                VersionConflict = true,
                EditVersion = versionBefore,
            };
        }

        var catalog = StepRunnerCatalogFromQuicker.Build();
        var normalizedVariables = XActionProgramService.NormalizeVariablesForSave(variables);
        XActionProgramService.NormalizeStepsInputParamKeys(steps, catalog);
        var inputParamWarnings = XActionProgramService.CollectStepsInputParamsWarnings(steps, catalog);

        if (!SubProgramProgramPersistence.TrySave(
                subProgram!.Id!,
                steps,
                normalizedVariables,
                out var saveError))
        {
            return FailPatch(saveError ?? "save_failed");
        }

        if (!_subPrograms.TryGetByIdOrName(subProgram.Id!, out var saved, out _))
        {
            return FailPatch("save finished but subprogram could not be reloaded.");
        }

        ActionSearchIndexInvalidator.InvalidateSubProgram();

        return new QuickerRpcApplySubProgramPatchResult
        {
            Success = true,
            SubProgramId = saved!.Id,
            CallIdentifier = DataServiceSubProgramAccessor.GetCallIdentifier(saved),
            EditVersion = _subPrograms.GetEditVersion(saved),
            UpdatedUtc = DateTimeOffset.UtcNow.ToString("o"),
            Warnings = inputParamWarnings.Count > 0 ? new List<string>(inputParamWarnings) : null,
        };
    }

    public QuickerRpcActionUpdateResult DeleteSubProgram(string? subProgramIdOrName, bool skipConfirm)
    {
        _ = skipConfirm;
        var key = (subProgramIdOrName ?? string.Empty).Trim();
        if (key.Length == 0)
        {
            return new QuickerRpcActionUpdateResult { Ok = false, Message = "subProgram id or name is required." };
        }

        if (_subPrograms is null)
        {
            return new QuickerRpcActionUpdateResult { Ok = false, Message = "Not running inside Quicker." };
        }

        if (!_subPrograms.TryGetByIdOrName(key, out var subProgram, out var loadError))
        {
            return new QuickerRpcActionUpdateResult { Ok = false, Message = loadError ?? $"Subprogram not found: {key}" };
        }

        if (!_subPrograms.TryDelete(subProgram!, out var deleteError))
        {
            return new QuickerRpcActionUpdateResult
            {
                Ok = false,
                ActionId = subProgram!.Id,
                Message = deleteError ?? "DeleteGlobalSubProgram failed.",
            };
        }

        ActionSearchIndexInvalidator.InvalidateSubProgram();

        return new QuickerRpcActionUpdateResult
        {
            Ok = true,
            ActionId = subProgram!.Id,
            Message = $"公共子程序已删除：{subProgram.Name}",
        };
    }

    public QuickerRpcActionUpdateResult EditSubProgram(string? subProgramIdOrName)
    {
        var key = (subProgramIdOrName ?? string.Empty).Trim();
        if (key.Length == 0)
        {
            return new QuickerRpcActionUpdateResult { Ok = false, Message = "subProgram id or name is required." };
        }

        if (_subPrograms is null || _actionEditMgr?.CreateOrEditGlobalSubProgram is null)
        {
            return new QuickerRpcActionUpdateResult
            {
                Ok = false,
                Message = "ActionEditMgr.CreateOrEditGlobalSubProgram unavailable.",
            };
        }

        if (!_subPrograms.TryGetByIdOrName(key, out var subProgram, out var loadError))
        {
            return new QuickerRpcActionUpdateResult { Ok = false, Message = loadError ?? $"Subprogram not found: {key}" };
        }

        try
        {
            _actionEditMgr.CreateOrEditGlobalSubProgram.Invoke(_actionEditMgr.Instance, new object[] { subProgram! });
            return new QuickerRpcActionUpdateResult
            {
                Ok = true,
                ActionId = subProgram!.Id,
                Message = "公共子程序编辑窗口已打开。",
            };
        }
        catch (Exception ex) when (ex is TargetInvocationException tie && tie.InnerException is not null)
        {
            return new QuickerRpcActionUpdateResult { Ok = false, ActionId = subProgram!.Id, Message = tie.InnerException!.Message };
        }
        catch (Exception ex)
        {
            return new QuickerRpcActionUpdateResult { Ok = false, ActionId = subProgram!.Id, Message = ex.Message };
        }
    }

    public QuickerRpcSubProgramSearchResult ListSubPrograms(string? query, int maxCount)
    {
        if (_subPrograms is null)
        {
            return new QuickerRpcSubProgramSearchResult
            {
                Ok = false,
                Message = "Not running inside Quicker.",
            };
        }

        var keyword = (query ?? string.Empty).Trim();
        var limit = NormalizeMaxCount(maxCount);
        _searchIndex.ScheduleBuild(SearchRegion.SubProgram);
        var hits = _searchIndex.IsReady(SearchRegion.SubProgram)
            ? _searchHub.Search(
                new SearchRequest
                {
                    Regions = new[] { SearchRegion.SubProgram },
                    Query = keyword.Length == 0 ? null : keyword,
                    Limit = limit,
                })
            : SubProgramSearchLinear.Search(_subPrograms.EnumerateAll(), keyword, limit);

        var items = hits
            .Select(SubProgramSearchLinear.MapHit)
            .ToList();

        return new QuickerRpcSubProgramSearchResult
        {
            Ok = true,
            Message = items.Count == 0 ? "No matching global subprograms." : string.Empty,
            Items = items,
        };
    }

    private static string? NullIfEmpty(string? value) =>
        string.IsNullOrWhiteSpace(value) ? null : value.Trim();

    private static int NormalizeMaxCount(int maxCount)
    {
        if (maxCount < 1)
        {
            return 1;
        }

        return maxCount > 100 ? 100 : maxCount;
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

    private static QuickerRpcGetCompressedSubProgramResult FailGet(string message) =>
        new() { Success = false, ErrorMessage = message };

    private static QuickerRpcCreateSubProgramResult FailCreate(string message) =>
        new() { Ok = false, Message = message };

    private static QuickerRpcApplySubProgramPatchResult FailPatch(string message) =>
        new() { Success = false, ErrorMessage = message };
}
