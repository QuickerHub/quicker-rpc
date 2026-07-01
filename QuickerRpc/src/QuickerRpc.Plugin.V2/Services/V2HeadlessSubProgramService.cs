using Newtonsoft.Json.Linq;
using QuickerRpc.AgentModel.XAction;
using QuickerRpc.Contracts.Rpc;
using QuickerRpc.Host;
using QuickerRpc.Plugin.V2.Reflection;

namespace QuickerRpc.Plugin.V2.Services;

public sealed class V2HeadlessSubProgramService
{
    private QuickerV2SubProgramAccessor? SubPrograms => QuickerV2SubProgramAccessor.Current;
    private readonly V2HeadlessActionProgramService? _actionPrograms;
    private QuickerV2ActionAccessor? Actions => QuickerV2ActionAccessor.Current;

    public V2HeadlessSubProgramService(V2HeadlessActionProgramService actionPrograms)
    {
        _actionPrograms = actionPrograms;
    }

    public QuickerRpcSubProgramSnapshot? TryLoadSubProgramSnapshot(string? subProgramIdOrName)
    {
        var key = (subProgramIdOrName ?? string.Empty).Trim();
        if (key.Length == 0 || SubPrograms is null)
        {
            return null;
        }

        if (!SubPrograms.TryGetByIdOrName(key, out var subProgram, out _) || subProgram is null)
        {
            return null;
        }

        var body = new JObject
        {
            ["steps"] = SubPrograms.StepsToJArray(subProgram),
            ["variables"] = SubPrograms.VariablesToJArray(subProgram),
        };

        return new QuickerRpcSubProgramSnapshot
        {
            Id = SubPrograms.GetId(subProgram),
            Name = QuickerV2Reflection.ReadString(subProgram, "Name") ?? string.Empty,
            CallIdentifier = SubPrograms.GetCallIdentifier(subProgram),
            Description = QuickerV2Reflection.ReadString(subProgram, "Description"),
            Icon = QuickerV2Reflection.ReadString(subProgram, "Icon"),
            EditVersion = SubPrograms.GetEditVersionMs(subProgram),
            BodyJson = body.ToString(Newtonsoft.Json.Formatting.None),
        };
    }

    public QuickerRpcApplySubProgramPatchResult ApplyProgramToSubProgram(
        string? idOrName,
        string? bodyJson,
        long? expectedEditVersion,
        bool force)
    {
        var key = (idOrName ?? string.Empty).Trim();
        if (key.Length == 0)
        {
            return FailApply("subProgram id or name is required.");
        }

        if (string.IsNullOrWhiteSpace(bodyJson))
        {
            return FailApply("bodyJson is required.");
        }

        if (SubPrograms is null)
        {
            return FailApply("Quicker V2 subprogram accessor unavailable.");
        }

        JObject body;
        try
        {
            body = JObject.Parse(bodyJson);
        }
        catch (Exception ex)
        {
            return FailApply("bodyJson parse failed: " + ex.Message);
        }

        var steps = body["steps"] as JArray ?? new JArray();
        var variables = body["variables"] as JArray ?? new JArray();

        if (!SubPrograms.TryGetByIdOrName(key, out var subProgram, out var loadError) || subProgram is null)
        {
            return FailApply(loadError ?? $"Subprogram not found: {key}");
        }

        var versionBefore = SubPrograms.GetEditVersionMs(subProgram);
        if (!force && expectedEditVersion.HasValue && expectedEditVersion.Value != versionBefore)
        {
            return new QuickerRpcApplySubProgramPatchResult
            {
                Success = false,
                ErrorMessage = "Version conflict: subprogram was modified. Re-read or use force.",
                VersionConflict = true,
                EditVersion = versionBefore,
            };
        }

        if (!SubPrograms.TryApplyBody(subProgram, steps, variables, out var applyError))
        {
            return FailApply(applyError ?? "apply_failed");
        }

        if (!SubPrograms.TrySave(subProgram, out var saveError))
        {
            return FailApply(saveError ?? "save_failed");
        }

        return new QuickerRpcApplySubProgramPatchResult
        {
            Success = true,
            SubProgramId = SubPrograms.GetId(subProgram),
            EditVersion = SubPrograms.GetEditVersionMs(subProgram),
        };
    }

    public QuickerRpcApplySubProgramPatchResult ApplyPatchToSubProgram(
        string? idOrName,
        string? patchJson,
        long? expectedEditVersion,
        bool force)
    {
        var snapshot = TryLoadSubProgramSnapshot(idOrName);
        if (snapshot is null)
        {
            return FailPatch("Subprogram not found or unavailable.");
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

        var body = JObject.Parse(snapshot.BodyJson);
        var steps = body["steps"] as JArray ?? new JArray();
        var variables = body["variables"] as JArray ?? new JArray();
        var stepsClone = (JArray)steps.DeepClone();
        var variablesClone = (JArray)variables.DeepClone();
        XActionProgramService.EnsureEphemeralIds(stepsClone, variablesClone);
        var applyResult = XActionProgramService.ApplyPatch(stepsClone, variablesClone, patch);
        if (!applyResult.Success)
        {
            return FailPatch(applyResult.ErrorMessage ?? "patch apply failed.");
        }

        body["steps"] = stepsClone;
        body["variables"] = variablesClone;
        var apply = ApplyProgramToSubProgram(idOrName, body.ToString(), expectedEditVersion, force);
        if (!apply.Success)
        {
            return FailPatch(apply.ErrorMessage ?? "patch apply failed.", apply.VersionConflict, apply.EditVersion);
        }

        return new QuickerRpcApplySubProgramPatchResult
        {
            Success = true,
            SubProgramId = apply.SubProgramId,
            EditVersion = apply.EditVersion,
        };
    }

    public QuickerRpcSubProgramVariableEditResult EditVariable(
        string? idOrName,
        string? variableKey,
        string? defaultValue)
    {
        var key = (idOrName ?? string.Empty).Trim();
        var varKey = (variableKey ?? string.Empty).Trim();
        var value = defaultValue ?? string.Empty;
        if (key.Length == 0)
        {
            return FailVariable(null, varKey, value, "target id or name is required.");
        }

        if (varKey.Length == 0)
        {
            return FailVariable(key, varKey, value, "variableKey is required.");
        }

        if (SubPrograms is not null && SubPrograms.TryGetByIdOrName(key, out var subProgram, out _) && subProgram is not null)
        {
            return EditSubProgramVariable(key, varKey, value);
        }

        if (Actions is not null && Actions.TryGetById(key, out var action, out _) && action is not null && Actions.IsXAction(action))
        {
            return EditActionVariable(key, varKey, value);
        }

        return FailVariable(key, varKey, value, $"Target not found: {key}");
    }

    private QuickerRpcSubProgramVariableEditResult EditSubProgramVariable(
        string idOrName,
        string variableKey,
        string defaultValue)
    {
        var snapshot = TryLoadSubProgramSnapshot(idOrName);
        if (snapshot is null)
        {
            return FailVariable(idOrName, variableKey, defaultValue, $"Subprogram not found: {idOrName}");
        }

        var body = JObject.Parse(snapshot.BodyJson);
        var variables = body["variables"] as JArray ?? new JArray();
        if (!TryFindVariable(variables, variableKey, out var oldValue))
        {
            return FailVariable(idOrName, variableKey, defaultValue, $"Variable '{variableKey}' not found.");
        }

        var patch = BuildVariablePatch(variableKey, defaultValue);
        var apply = ApplyPatchToSubProgram(idOrName, patch, expectedEditVersion: null, force: true);
        if (!apply.Success)
        {
            return FailVariable(idOrName, variableKey, defaultValue, apply.ErrorMessage ?? "save_failed");
        }

        return Success(idOrName, "subprogram", variableKey, oldValue, defaultValue);
    }

    private QuickerRpcSubProgramVariableEditResult EditActionVariable(
        string actionId,
        string variableKey,
        string defaultValue)
    {
        if (_actionPrograms is null)
        {
            return FailVariable(actionId, variableKey, defaultValue, "Action program service unavailable.");
        }

        var snapshot = _actionPrograms.TryLoadProgramSnapshot(actionId);
        if (snapshot is null)
        {
            return FailVariable(actionId, variableKey, defaultValue, $"Action not found: {actionId}");
        }

        var body = JObject.Parse(snapshot.BodyJson);
        var (_, variables, _) = ActionProgramContent.ReadBodyArrays(body);
        if (!TryFindVariable(variables, variableKey, out var oldValue))
        {
            return FailVariable(actionId, variableKey, defaultValue, $"Variable '{variableKey}' not found.");
        }

        var patch = BuildVariablePatch(variableKey, defaultValue);
        var apply = _actionPrograms.ApplyActionPatchToAction(actionId, patch, expectedEditVersion: null, force: true);
        if (!apply.Success)
        {
            return FailVariable(actionId, variableKey, defaultValue, apply.ErrorMessage ?? "save_failed");
        }

        return Success(actionId, "action", variableKey, oldValue, defaultValue);
    }

    private static bool TryFindVariable(JArray variables, string variableKey, out string oldValue)
    {
        oldValue = string.Empty;
        foreach (var token in variables)
        {
            if (token is not JObject variable)
            {
                continue;
            }

            var key = variable["key"]?.Value<string>() ?? variable["Key"]?.Value<string>();
            if (!string.Equals(key, variableKey, StringComparison.Ordinal))
            {
                continue;
            }

            oldValue = variable["defaultValue"]?.Value<string>()
                ?? variable["DefaultValue"]?.Value<string>()
                ?? string.Empty;
            return true;
        }

        return false;
    }

    private static string BuildVariablePatch(string variableKey, string defaultValue) =>
        new JObject
        {
            ["variables"] = new JArray
            {
                new JObject
                {
                    ["key"] = variableKey,
                    ["defaultValue"] = defaultValue,
                },
            },
        }.ToString(Newtonsoft.Json.Formatting.None);

    private static QuickerRpcSubProgramVariableEditResult Success(
        string target,
        string targetKind,
        string variableKey,
        string? oldValue,
        string newValue) =>
        new()
        {
            Ok = true,
            TargetKind = targetKind,
            SubProgramIdOrName = target,
            VariableKey = variableKey,
            OldValue = oldValue,
            NewValue = newValue,
            Message = string.IsNullOrWhiteSpace(oldValue)
                ? $"变量 {variableKey} 已设为 {newValue}"
                : $"变量 {variableKey} 变更 {oldValue} => {newValue}",
        };

    private static QuickerRpcSubProgramVariableEditResult FailVariable(
        string? target,
        string? variableKey,
        string? newValue,
        string message) =>
        new()
        {
            Ok = false,
            SubProgramIdOrName = target,
            VariableKey = variableKey,
            NewValue = newValue,
            Message = message,
        };

    private static QuickerRpcApplySubProgramPatchResult FailApply(string message) =>
        new() { Success = false, ErrorMessage = message };

    private static QuickerRpcApplySubProgramPatchResult FailPatch(
        string message,
        bool? versionConflict = null,
        long? editVersion = null) =>
        new()
        {
            Success = false,
            ErrorMessage = message,
            VersionConflict = versionConflict,
            EditVersion = editVersion,
        };
}
