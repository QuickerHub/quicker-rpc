using System;
using System.Collections.Generic;
using System.Security.Cryptography;
using System.Text;
using System.Windows;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using Quicker.Domain.Actions.X;
using QuickerRpc.AgentModel.Catalog;
using QuickerRpc.AgentModel.Core;
using QuickerRpc.AgentModel.XAction;
using QuickerRpc.AgentModel.XAction.Compression;
using QuickerRpc.AgentModel.XAction.Patch;
using QuickerRpc.AgentModel.XAction.Project;
using QuickerRpc.Contracts.Rpc;

namespace QuickerRpc.Plugin.Services;

/// <summary>
/// When <c>ActionDesignerWindow</c> is open for an entity, route action/subprogram get+patch
/// through in-memory designer state instead of catalog persistence.
/// </summary>
internal static class ActionDesignerProgramBridge
{
    public const string ReadSourceDesigner = "action-designer";
    public const string ReadSourceCatalog = "catalog";

    public static bool TryGetCompressedAction(
        string actionId,
        XActionGetReturnMode mode,
        out QuickerRpcGetCompressedActionResult result)
    {
        result = new QuickerRpcGetCompressedActionResult();
        if (!QuickerDispatcherInvoke.TryOnUiThreadIfNeeded(
                () => TryGetCompressedActionOnUiThread(actionId, mode),
                QuickerDispatcherInvoke.DesignerUiReadTimeout,
                out var outcome))
        {
            return false;
        }

        result = outcome.Result;
        return outcome.Handled;
    }

    private static (bool Handled, QuickerRpcGetCompressedActionResult Result) TryGetCompressedActionOnUiThread(
        string actionId,
        XActionGetReturnMode mode)
    {
        var result = new QuickerRpcGetCompressedActionResult();
        var designer = ActionDesignerUiSave.TryFindActionDesignerWindow(actionId, isSubProgram: false);
        if (designer is null)
        {
            return (false, result);
        }

        if (!designer.IsLoaded)
        {
            return (false, result);
        }

        if (!ActionDesignerContext.TryExportXActionJson(designer, out var payloadJson, out var error)
            || string.IsNullOrWhiteSpace(payloadJson))
        {
            return (true, FailGet(error ?? "Designer export failed."));
        }

        try
        {
            var body = JObject.Parse(payloadJson);
            var (steps, variables, subPrograms) = ActionProgramContent.ReadBodyArrays(body);
            XActionProgramService.EnsureEphemeralIds(steps, variables);

            var catalog = StepRunnerCatalogFromQuicker.Build();
            var wireMode = XActionGetReturnModeParser.ToWire(mode);
            TryReadDesignerPresentation(designer, out var title, out var description, out var icon, out var contextMenuData);
            var editVersion = ReadActionCatalogEditVersionMs(actionId);

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

            compressedRoot["actionId"] = actionId.Trim();
            compressedRoot["editVersion"] = editVersion;
            compressedRoot["returnMode"] = wireMode;
            compressedRoot["subProgramCount"] = subPrograms.Count;
            compressedRoot["readSource"] = ReadSourceDesigner;
            compressedRoot["designerOpen"] = true;
            if (omitApplied.HasValue)
            {
                compressedRoot["omitDefaultLiteralInputsApplied"] = omitApplied.Value;
            }

            result = new QuickerRpcGetCompressedActionResult
            {
                Success = true,
                ActionId = actionId.Trim(),
                EditVersion = editVersion,
                CompressedJson = JTokenCompat.Compact(compressedRoot),
                OmitDefaultLiteralInputsApplied = omitApplied,
                SubProgramCount = subPrograms.Count,
                ReturnMode = wireMode,
                ReadSource = ReadSourceDesigner,
            };
            return (true, result);
        }
        catch (Exception ex)
        {
            return (true, FailGet(ex.Message));
        }
    }

    public static bool TryApplyActionPatch(
        string actionId,
        JObject patch,
        long? expectedEditVersion,
        bool force,
        out QuickerRpcApplyActionPatchResult result)
    {
        result = new QuickerRpcApplyActionPatchResult();
        actionId = ActionReadOnlyMutationGuard.ResolveMutationActionId(actionId);
        if (LegacyActionProgramAccessor.TryCreate() is { } actions
            && actions.TryGetById(actionId, out var action, out _)
            && ActionReadOnlyMutationGuard.TryBuildPatchFailure(action, actionId, out var readOnlyPatch))
        {
            result = readOnlyPatch;
            return true;
        }

        if (ActionReadOnlyMutationGuard.TryBuildPatchFailure(null, actionId, out readOnlyPatch))
        {
            result = readOnlyPatch;
            return true;
        }

        var export = ActionProgramPatchUiGate.TryExportProgramJson(actionId, isSubProgram: false);
        if (export is null || !export.DesignerFound)
        {
            return false;
        }

        if (export.DesignerNotLoaded)
        {
            result = FailPatch("Action Designer is not loaded.");
            return true;
        }

        if (!string.IsNullOrWhiteSpace(export.Error))
        {
            result = FailPatch(export.Error);
            return true;
        }

        var payloadJson = export.PayloadJson;
        var metaTitle = ActionPresentationUpdate.ReadOptionalPatchString(patch["title"]);
        var metaDescription = ActionPresentationUpdate.ReadOptionalPatchString(patch["description"]);
        var metaIcon = ActionPresentationUpdate.ReadOptionalPatchString(patch["icon"]);
        var metaContextMenuData = ActionPresentationUpdate.ReadOptionalPatchString(patch["contextMenuData"]);
        var programPatch = (JObject)patch.DeepClone();
        programPatch.Remove("title");
        programPatch.Remove("description");
        programPatch.Remove("icon");
        programPatch.Remove("contextMenuData");

        var hasMeta = metaTitle is not null
                      || metaDescription is not null
                      || metaIcon is not null
                      || metaContextMenuData is not null;
        var hasProgramPatch = programPatch["steps"] is JArray || programPatch["variables"] is JArray;
        if (!hasMeta && !hasProgramPatch)
        {
            result = FailPatch("patch must contain steps/variables arrays and/or title, description, icon, contextMenuData.");
            return true;
        }

        if (hasProgramPatch)
        {
            var formPreprocess = XActionProgramService.PreprocessPatch(programPatch, projectDirectory: null);
            if (!formPreprocess.Success)
            {
                result = FailPatch(formPreprocess.ErrorMessage ?? "form spec compile failed.");
                return true;
            }
        }

        if (string.IsNullOrWhiteSpace(payloadJson))
        {
            result = FailPatch("Designer export failed.");
            return true;
        }

        try
        {
            var body = JObject.Parse(payloadJson);
            var (steps, variables, _) = ActionProgramContent.ReadBodyArrays(body);
            var stepsClone = (JArray)steps.DeepClone();
            var variablesClone = (JArray)variables.DeepClone();
            XActionProgramService.EnsureEphemeralIds(stepsClone, variablesClone);

            var revisionBefore = ComputeBodyRevision(stepsClone, variablesClone);
            if (!force && expectedEditVersion.HasValue && expectedEditVersion.Value != revisionBefore)
            {
                result = new QuickerRpcApplyActionPatchResult
                {
                    Success = false,
                    ActionId = actionId.Trim(),
                    ErrorMessage =
                        "Version conflict: action was modified in Action Designer. Re-read with action get or use force.",
                    VersionConflict = true,
                    EditVersion = revisionBefore,
                    ReadSource = ReadSourceDesigner,
                    AppliedToDesigner = true,
                    Persisted = false,
                };
                return true;
            }

            var applyResult = new XActionPatchApplier.ApplyResult { Success = true };
            var catalog = StepRunnerCatalogFromQuicker.Build();
            IList<string> inputParamWarnings = Array.Empty<string>();
            XAction? xActionForDesigner = null;
            if (hasProgramPatch)
            {
                applyResult = XActionProgramService.ApplyPatch(stepsClone, variablesClone, programPatch);
                if (!applyResult.Success)
                {
                    result = FailPatch(applyResult.ErrorMessage ?? "patch apply failed.");
                    return true;
                }

                var normalizedVariables = XActionProgramService.NormalizeVariablesForSave(variablesClone);
                XActionProgramService.NormalizeStepsInputParamKeys(stepsClone, catalog);
                var subProgramsJson = ReadSubProgramsJson(body, programPatch["subPrograms"]);
                var inputParamContext = SubProgramStepInputParamsValidation.CreateContext(subProgramsJson);
                inputParamWarnings = XActionProgramService.CollectStepsInputParamsWarnings(stepsClone, catalog, inputParamContext);

                var mergedBody = XActionProgramBodyWriter.MergeAndSerialize(
                    payloadJson,
                    stepsClone,
                    normalizedVariables,
                    subProgramsJson);
                xActionForDesigner = XActionProgramBodyWriter.DeserializeXAction(mergedBody);
            }

            if (hasProgramPatch || hasMeta)
            {
                var applyUi = ActionProgramPatchUiGate.ApplyProgramToOpenDesigner(
                    actionId,
                    isSubProgram: false,
                    xActionForDesigner,
                    metaTitle,
                    metaDescription,
                    metaIcon,
                    metaContextMenuData);
                if (!applyUi.Success)
                {
                    result = FailPatch(applyUi.Error ?? "Failed to apply patch to open Action Designer.");
                    return true;
                }
            }

            var revisionAfter = ComputeBodyRevision(stepsClone, variablesClone);
            var warnings = ToWarnings(inputParamWarnings);
            warnings.Add("applied_to_action_designer_memory; save in Quicker to persist to catalog");

            result = new QuickerRpcApplyActionPatchResult
            {
                Success = true,
                ActionId = actionId.Trim(),
                EditVersion = revisionAfter,
                PresentationUpdated = hasMeta,
                UpdatedStepsJson = JTokenCompat.Compact(CompressSteps(applyResult.UpdatedSteps, catalog, omitDefaultLiteralInputs: false)),
                AddedStepsJson = applyResult.AddedSteps.Count > 0
                    ? JTokenCompat.Compact(CompressSteps(applyResult.AddedSteps, catalog, omitDefaultLiteralInputs: false))
                    : null,
                UpdatedVariablesJson = JTokenCompat.Compact(CompressVariables(applyResult.UpdatedVariables)),
                AddedVariablesJson = applyResult.AddedVariables.Count > 0
                    ? JTokenCompat.Compact(CompressVariables(applyResult.AddedVariables))
                    : null,
                UpdatedUtc = DateTimeOffset.UtcNow.ToString("o"),
                Warnings = warnings,
                ReadSource = ReadSourceDesigner,
                AppliedToDesigner = true,
                Persisted = false,
            };
            return true;
        }
        catch (Exception ex)
        {
            result = FailPatch(ex.Message);
            return true;
        }
    }

    public static bool TryGetCompressedSubProgram(
        string subProgramKey,
        XActionGetReturnMode mode,
        out QuickerRpcGetCompressedSubProgramResult result)
    {
        result = new QuickerRpcGetCompressedSubProgramResult();
        if (!QuickerDispatcherInvoke.TryOnUiThreadIfNeeded(
                () => TryGetCompressedSubProgramOnUiThread(subProgramKey, mode),
                QuickerDispatcherInvoke.DesignerUiReadTimeout,
                out var outcome))
        {
            return false;
        }

        result = outcome.Result;
        return outcome.Handled;
    }

    private static (bool Handled, QuickerRpcGetCompressedSubProgramResult Result) TryGetCompressedSubProgramOnUiThread(
        string subProgramKey,
        XActionGetReturnMode mode)
    {
        var result = new QuickerRpcGetCompressedSubProgramResult();
        Window? designer = null;
        foreach (var isSubProgram in new[] { true, false })
        {
            designer = ActionDesignerUiSave.TryFindActionDesignerWindow(subProgramKey, isSubProgram);
            if (designer is not null)
            {
                break;
            }
        }

        if (designer is null)
        {
            return (false, result);
        }

        if (!designer.IsLoaded)
        {
            return (false, result);
        }

        if (!ActionDesignerContext.TryExportXActionJson(designer, out var payloadJson, out var error)
            || string.IsNullOrWhiteSpace(payloadJson))
        {
            return (true, FailSubProgramGet(error ?? "Designer export failed."));
        }

        try
        {
            var body = JObject.Parse(payloadJson);
            var (steps, variables, _) = ActionProgramContent.ReadBodyArrays(body);
            XActionProgramService.EnsureEphemeralIds(steps, variables);

            var catalog = StepRunnerCatalogFromQuicker.Build();
            var wireMode = XActionGetReturnModeParser.ToWire(mode);
            var entityId = ActionDesignerContext.TryReadDesignerEntityId(designer) ?? subProgramKey.Trim();
            var editVersion = ReadSubProgramCatalogEditVersionMs(entityId);

            JObject compressedRoot;
            bool? omitApplied = null;
            switch (mode)
            {
                case XActionGetReturnMode.Structure:
                    compressedRoot = XActionProgramService.Compress(mode, steps, variables, catalog);
                    break;
                case XActionGetReturnMode.Metadata:
                    TryReadDesignerPresentation(designer, out var title, out var description, out var icon, out _);
                    compressedRoot = XActionProgramService.Compress(
                        mode,
                        steps,
                        variables,
                        catalog,
                        title: title,
                        description: description,
                        icon: icon);
                    break;
                default:
                    compressedRoot = XActionProgramService.Compress(mode, steps, variables, catalog, omitDefaultLiteralInputs: true);
                    omitApplied = true;
                    break;
            }

            compressedRoot["subProgramId"] = entityId;
            compressedRoot["editVersion"] = editVersion;
            compressedRoot["returnMode"] = wireMode;
            compressedRoot["readSource"] = ReadSourceDesigner;
            compressedRoot["designerOpen"] = true;
            if (omitApplied.HasValue)
            {
                compressedRoot["omitDefaultLiteralInputsApplied"] = omitApplied.Value;
            }

            result = new QuickerRpcGetCompressedSubProgramResult
            {
                Success = true,
                SubProgramId = entityId,
                Name = designer.Title,
                EditVersion = editVersion,
                CompressedJson = JTokenCompat.Compact(compressedRoot),
                OmitDefaultLiteralInputsApplied = omitApplied,
                ReturnMode = wireMode,
                ReadSource = ReadSourceDesigner,
            };
            return (true, result);
        }
        catch (Exception ex)
        {
            return (true, FailSubProgramGet(ex.Message));
        }
    }

    public static bool TryApplySubProgramPatch(
        string subProgramKey,
        JObject patch,
        long? expectedEditVersion,
        bool force,
        out QuickerRpcApplySubProgramPatchResult result)
    {
        result = new QuickerRpcApplySubProgramPatchResult();
        var export = ActionProgramPatchUiGate.TryExportSubProgramJson(subProgramKey);
        if (export is null || !export.DesignerFound)
        {
            return false;
        }

        if (export.DesignerNotLoaded)
        {
            result = FailSubProgramPatch("Action Designer is not loaded.");
            return true;
        }

        if (!string.IsNullOrWhiteSpace(export.Error))
        {
            result = FailSubProgramPatch(export.Error);
            return true;
        }

        var payloadJson = export.PayloadJson;
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
            result = FailSubProgramPatch("patch must contain steps/variables arrays and/or name, description, icon.");
            return true;
        }

        if (hasProgramPatch)
        {
            var formPreprocess = XActionProgramService.PreprocessPatch(programPatch, projectDirectory: null);
            if (!formPreprocess.Success)
            {
                result = FailSubProgramPatch(formPreprocess.ErrorMessage ?? "form spec compile failed.");
                return true;
            }
        }

        if (string.IsNullOrWhiteSpace(payloadJson))
        {
            result = FailSubProgramPatch("Designer export failed.");
            return true;
        }

        try
        {
            var body = JObject.Parse(payloadJson);
            var (steps, variables, _) = ActionProgramContent.ReadBodyArrays(body);
            var stepsClone = (JArray)steps.DeepClone();
            var variablesClone = (JArray)variables.DeepClone();
            XActionProgramService.EnsureEphemeralIds(stepsClone, variablesClone);

            var revisionBefore = ComputeBodyRevision(stepsClone, variablesClone);
            if (!force && expectedEditVersion.HasValue && expectedEditVersion.Value != revisionBefore)
            {
                result = new QuickerRpcApplySubProgramPatchResult
                {
                    Success = false,
                    SubProgramId = subProgramKey.Trim(),
                    ErrorMessage =
                        "Version conflict: subprogram was modified in Action Designer. Re-read with subprogram get or use force.",
                    VersionConflict = true,
                    EditVersion = revisionBefore,
                    ReadSource = ReadSourceDesigner,
                    AppliedToDesigner = true,
                    Persisted = false,
                };
                return true;
            }

            var applyResult = new XActionPatchApplier.ApplyResult { Success = true };
            var catalog = StepRunnerCatalogFromQuicker.Build();
            IList<string> inputParamWarnings = Array.Empty<string>();
            XAction? xActionForDesigner = null;
            if (hasProgramPatch)
            {
                applyResult = XActionProgramService.ApplyPatch(stepsClone, variablesClone, programPatch);
                if (!applyResult.Success)
                {
                    result = FailSubProgramPatch(applyResult.ErrorMessage ?? "patch apply failed.");
                    return true;
                }

                var normalizedVariables = XActionProgramService.NormalizeVariablesForSave(variablesClone);
                XActionProgramService.NormalizeStepsInputParamKeys(stepsClone, catalog);
                var inputParamContext = SubProgramStepInputParamsValidation.CreateContext(
                    ReadSubProgramsJson(body, programPatch["subPrograms"]));
                inputParamWarnings = XActionProgramService.CollectStepsInputParamsWarnings(
                    stepsClone,
                    catalog,
                    inputParamContext);

                var mergedBody = XActionProgramBodyWriter.MergeAndSerialize(
                    payloadJson,
                    stepsClone,
                    normalizedVariables,
                    ReadSubProgramsJson(body, programPatch["subPrograms"]));
                xActionForDesigner = XActionProgramBodyWriter.DeserializeXAction(mergedBody);
            }

            string entityIdAfter = subProgramKey.Trim();
            if (hasProgramPatch || hasMeta)
            {
                var applyUi = ActionProgramPatchUiGate.ApplyProgramToOpenSubProgramDesigner(
                    subProgramKey,
                    xActionForDesigner,
                    metaName,
                    metaDescription,
                    metaIcon);
                if (!applyUi.Success)
                {
                    result = FailSubProgramPatch(applyUi.Error ?? "Failed to apply patch to open Action Designer.");
                    return true;
                }

                if (!string.IsNullOrWhiteSpace(applyUi.EntityId))
                {
                    entityIdAfter = applyUi.EntityId;
                }
            }

            var revisionAfter = ComputeBodyRevision(stepsClone, variablesClone);
            var warnings = ToWarnings(inputParamWarnings);
            warnings.Add("applied_to_action_designer_memory; save in Quicker to persist to catalog");

            result = new QuickerRpcApplySubProgramPatchResult
            {
                Success = true,
                SubProgramId = entityIdAfter,
                EditVersion = revisionAfter,
                UpdatedStepsJson = JTokenCompat.Compact(CompressSteps(applyResult.UpdatedSteps, catalog, omitDefaultLiteralInputs: false)),
                AddedStepsJson = applyResult.AddedSteps.Count > 0
                    ? JTokenCompat.Compact(CompressSteps(applyResult.AddedSteps, catalog, omitDefaultLiteralInputs: false))
                    : null,
                UpdatedVariablesJson = JTokenCompat.Compact(CompressVariables(applyResult.UpdatedVariables)),
                AddedVariablesJson = applyResult.AddedVariables.Count > 0
                    ? JTokenCompat.Compact(CompressVariables(applyResult.AddedVariables))
                    : null,
                UpdatedUtc = DateTimeOffset.UtcNow.ToString("o"),
                Warnings = warnings,
                ReadSource = ReadSourceDesigner,
                AppliedToDesigner = true,
                Persisted = false,
            };
            return true;
        }
        catch (Exception ex)
        {
            result = FailSubProgramPatch(ex.Message);
            return true;
        }
    }

    /// <summary>Stable revision token for designer in-memory body (used as editVersion).</summary>
    internal static long ComputeBodyRevision(JArray steps, JArray variables)
    {
        var payload = new JObject
        {
            ["steps"] = steps,
            ["variables"] = variables,
        }.ToString(Formatting.None);
        using var sha = SHA256.Create();
        var hash = sha.ComputeHash(Encoding.UTF8.GetBytes(payload));
        return Math.Abs(BitConverter.ToInt64(hash, 0));
    }

    private static long ReadActionCatalogEditVersionMs(string actionId) =>
        ActionDesignerProgramAccess.ReadEditVersionMs(actionId);

    private static long ReadSubProgramCatalogEditVersionMs(string subProgramKey)
    {
        if (DataServiceSubProgramAccessor.TryCreate() is not { } accessor)
        {
            return 0;
        }

        return accessor.TryGetByIdOrName(subProgramKey.Trim(), out var subProgram, out _)
               && subProgram is not null
            ? accessor.GetEditVersion(subProgram)
            : 0;
    }

    private static void TryReadDesignerPresentation(
        Window designer,
        out string? title,
        out string? description,
        out string? icon,
        out string? contextMenuData)
    {
        title = null;
        description = null;
        icon = null;
        contextMenuData = null;
        try
        {
            var winType = designer.GetType();
            var flags = System.Reflection.BindingFlags.Public
                          | System.Reflection.BindingFlags.NonPublic
                          | System.Reflection.BindingFlags.Instance;
            var editing = winType.GetProperty("EditingActionItem2", flags)?.GetValue(designer)
                ?? winType.GetProperty("EditingActionItem", flags)?.GetValue(designer);
            if (editing is null)
            {
                title = designer.Title;
                return;
            }

            var editingType = editing.GetType();
            title = editingType.GetProperty("Title", flags)?.GetValue(editing) as string ?? designer.Title;
            description = editingType.GetProperty("Description", flags)?.GetValue(editing) as string;
            icon = editingType.GetProperty("Icon", flags)?.GetValue(editing) as string;
            contextMenuData = editingType.GetProperty("ContextMenuData", flags)?.GetValue(editing) as string;
        }
        catch
        {
            title = designer.Title;
        }
    }

    private static string ReadSubProgramsJson(JObject existingBody, JToken? patchSubPrograms)
    {
        if (patchSubPrograms is JArray)
        {
            return JTokenCompat.Compact(patchSubPrograms);
        }

        var token = existingBody["subPrograms"] as JArray;
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

    private static List<string> ToWarnings(IList<string> warnings) =>
        warnings.Count == 0 ? new List<string>() : new List<string>(warnings);

    private static QuickerRpcGetCompressedActionResult FailGet(string message) =>
        new() { Success = false, ErrorMessage = message, ReadSource = ReadSourceDesigner };

    private static QuickerRpcApplyActionPatchResult FailPatch(string message) =>
        new()
        {
            Success = false,
            ErrorMessage = message,
            ReadSource = ReadSourceDesigner,
            AppliedToDesigner = true,
            Persisted = false,
        };

    private static QuickerRpcGetCompressedSubProgramResult FailSubProgramGet(string message) =>
        new() { Success = false, ErrorMessage = message, ReadSource = ReadSourceDesigner };

    private static QuickerRpcApplySubProgramPatchResult FailSubProgramPatch(string message) =>
        new()
        {
            Success = false,
            ErrorMessage = message,
            ReadSource = ReadSourceDesigner,
            AppliedToDesigner = true,
            Persisted = false,
        };
}
