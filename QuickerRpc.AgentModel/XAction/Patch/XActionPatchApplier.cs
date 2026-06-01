using Newtonsoft.Json;

using Newtonsoft.Json.Linq;

using QuickerRpc.AgentModel.XAction.Compression;



namespace QuickerRpc.AgentModel.XAction.Patch;



/// <summary>

/// Applies incremental program patches (add/update/remove/move). Full program write uses top-level <c>"replace": true</c> (same semantics as action replace).

/// </summary>

public static class XActionPatchApplier

{

    private static readonly JsonMergeSettings MergeSettings = new()

    {

        MergeArrayHandling = MergeArrayHandling.Replace,

        MergeNullValueHandling = MergeNullValueHandling.Merge

    };



    private const string OpUpdate = "update";

    private const string OpAdd = "add";

    private const string OpRemove = "remove";

    private const string OpMove = "move";



    public sealed class ApplyResult

    {

        public bool Success { get; set; }

        public string? ErrorMessage { get; set; }

        public List<JObject> UpdatedSteps { get; set; } = new();

        public List<JObject> AddedSteps { get; set; } = new();

        public List<JObject> UpdatedVariables { get; set; } = new();

        public List<JObject> AddedVariables { get; set; } = new();

    }



    private sealed class StepOp

    {

        public string Op { get; set; } = OpAdd;

        public JObject Entry { get; set; } = new();

        public int Order { get; set; }

    }



    private sealed class VariableOp

    {

        public string Op { get; set; } = OpUpdate;

        public JObject Entry { get; set; } = new();

        public int Order { get; set; }

    }



    private sealed class StepAddPlan

    {

        public JArray Container { get; set; } = null!;

        public string ContainerPath { get; set; } = "";

        public int Index { get; set; }

        public JObject Step { get; set; } = new();

        public int Order { get; set; }

    }



    public static ApplyResult Apply(JArray steps, JArray variables, JObject patch)

    {

        var result = new ApplyResult { Success = true };

        var stepsToken = patch["steps"];

        var variablesToken = patch["variables"];



        if (IsProgramReplaceMode(patch))

        {

            return ApplyProgramReplace(steps, variables, patch);

        }



        if (stepsToken is not JArray && variablesToken is not JArray)

        {

            result.Success = false;

            result.ErrorMessage = "patch must contain a steps and/or variables JSON array.";

            return result;

        }



        if (stepsToken is JArray stepsPatch)

        {

            var stepOps = ParseStepOps(stepsPatch);

            if (!ApplyStepPhases(steps, stepOps, result))

            {

                return result;

            }

        }



        if (variablesToken is JArray variablesPatch)

        {

            var variableOps = ParseVariableOps(variablesPatch);

            if (!ApplyVariablePhases(variables, variableOps, result))

            {

                return result;

            }

        }



        XActionCompressor.EnsureEphemeralStepIds(steps);

        XActionCompressor.EnsureEphemeralVariableIds(variables);



        return result;

    }



    /// <summary>Clear existing program body and set <c>steps</c> / <c>variables</c> from patch (same as <c>action replace</c>).</summary>
    private static ApplyResult ApplyProgramReplace(JArray steps, JArray variables, JObject patch)

    {

        var result = new ApplyResult { Success = true };

        if (patch["steps"] is not JArray stepsPatch || patch["variables"] is not JArray variablesPatch)

        {

            result.Success = false;

            result.ErrorMessage = "replace patch requires steps and variables JSON arrays (same as action replace).";

            return result;

        }



        ReplaceProgramArray(steps, stepsPatch);

        ReplaceProgramArray(variables, variablesPatch);

        XActionCompressor.EnsureEphemeralStepIds(steps);

        XActionCompressor.EnsureEphemeralVariableIds(variables);

        return result;

    }



    public static bool IsProgramReplaceMode(JObject patch)

    {

        if (patch["replace"] is JValue { Type: JTokenType.Boolean } flag)

        {

            return flag.Value<bool>();

        }



        return string.Equals(

            patch["mode"]?.Value<string>(),

            "replace",

            StringComparison.OrdinalIgnoreCase);

    }



    private static List<StepOp> ParseStepOps(JArray? entries)

    {

        var ops = new List<StepOp>();

        if (entries is null)

        {

            return ops;

        }



        for (var i = 0; i < entries.Count; i++)

        {

            if (entries[i] is not JObject entry)

            {

                ops.Add(new StepOp { Op = OpAdd, Entry = new JObject(), Order = i });

                continue;

            }



            ops.Add(new StepOp

            {

                Op = NormalizeStepOp(entry["op"]),

                Entry = entry,

                Order = i

            });

        }



        return ops;

    }



    private static List<VariableOp> ParseVariableOps(JArray? entries)

    {

        var ops = new List<VariableOp>();

        if (entries is null)

        {

            return ops;

        }



        for (var i = 0; i < entries.Count; i++)

        {

            if (entries[i] is not JObject entry)

            {

                ops.Add(new VariableOp { Op = OpUpdate, Entry = new JObject(), Order = i });

                continue;

            }



            ops.Add(new VariableOp

            {

                Op = NormalizeVariableOp(entry["op"]),

                Entry = entry,

                Order = i

            });

        }



        return ops;

    }



    /// <summary>Missing <c>op</c> on a step patch entry defaults to <c>add</c>.</summary>
    private static string NormalizeStepOp(JToken? token)

    {

        if (token?.Type != JTokenType.String)

        {

            return OpAdd;

        }



        var raw = token.Value<string>()?.Trim().ToLowerInvariant();

        return raw switch

        {

            OpAdd => OpAdd,

            OpRemove => OpRemove,

            OpMove => OpMove,

            OpUpdate => OpUpdate,

            _ => OpUpdate

        };

    }



    /// <summary>Missing <c>op</c> on a variable patch entry defaults to <c>update</c>.</summary>
    private static string NormalizeVariableOp(JToken? token)

    {

        if (token?.Type != JTokenType.String)

        {

            return OpUpdate;

        }



        var raw = token.Value<string>()?.Trim().ToLowerInvariant();

        return raw switch

        {

            OpAdd => OpAdd,

            OpRemove => OpRemove,

            OpMove => OpMove,

            OpUpdate => OpUpdate,

            _ => OpUpdate

        };

    }



    private static bool ApplyStepPhases(JArray steps, List<StepOp> ops, ApplyResult result)

    {

        foreach (var op in ops.Where(o => o.Op == OpRemove).OrderBy(o => o.Order))

        {

            if (!TryRemoveStep(steps, op.Entry, out var removed, out var error))

            {

                result.Success = false;

                result.ErrorMessage = error;

                return false;

            }



            if (removed is not null)

            {

                result.UpdatedSteps.Add(removed);

            }

        }



        foreach (var op in ops.Where(o => o.Op == OpMove).OrderBy(o => o.Order))

        {

            if (!TryMoveStep(steps, op.Entry, out var moved, out var error))

            {

                result.Success = false;

                result.ErrorMessage = error;

                return false;

            }



            if (moved is not null)

            {

                result.UpdatedSteps.Add(moved);

            }

        }



        var addPlans = new List<StepAddPlan>();

        foreach (var op in ops.Where(o => o.Op == OpAdd).OrderBy(o => o.Order))

        {

            if (!TryBuildStepAddPlan(steps, op, out var plan, out var error))

            {

                result.Success = false;

                result.ErrorMessage = error;

                return false;

            }



            addPlans.Add(plan!);

        }



        foreach (var plan in addPlans

                     .GroupBy(p => p.ContainerPath)

                     .SelectMany(g => g.OrderByDescending(p => p.Index).ThenByDescending(p => p.Order)))

        {

            plan.Container.Insert(plan.Index, plan.Step);
            result.AddedSteps.Add(plan.Step);

        }



        foreach (var op in ops.Where(o => o.Op == OpUpdate).OrderBy(o => o.Order))

        {

            if (!TryApplyStepPatch(steps, op.Entry, out var updatedStep, out var error))

            {

                result.Success = false;

                result.ErrorMessage = error;

                return false;

            }



            result.UpdatedSteps.Add(updatedStep);

        }



        return true;

    }



    private static bool ApplyVariablePhases(JArray variables, List<VariableOp> ops, ApplyResult result)

    {

        foreach (var op in ops.Where(o => o.Op == OpRemove).OrderBy(o => o.Order))

        {

            if (!TryRemoveVariable(variables, op.Entry, out _, out var error))

            {

                result.Success = false;

                result.ErrorMessage = error;

                return false;

            }

        }



        var addPlans = new List<(int Index, JObject Variable, int Order)>();

        foreach (var op in ops.Where(o => o.Op == OpAdd).OrderBy(o => o.Order))

        {

            if (!TryBuildVariableAddPlan(variables, op.Entry, out var index, out var variable, out var error))

            {

                result.Success = false;

                result.ErrorMessage = error;

                return false;

            }



            addPlans.Add((index, variable, op.Order));

        }



        foreach (var plan in addPlans.OrderByDescending(p => p.Index).ThenByDescending(p => p.Order))

        {

            variables.Insert(plan.Index, plan.Variable);

            result.AddedVariables.Add(plan.Variable);

        }



        foreach (var op in ops.Where(o => o.Op == OpUpdate).OrderBy(o => o.Order))

        {

            if (!TryApplyVariablePatch(variables, op.Entry, out var updatedVariable, out var error))

            {

                result.Success = false;

                result.ErrorMessage = error;

                return false;

            }



            result.UpdatedVariables.Add(updatedVariable);

        }



        return true;

    }



    private static bool TryBuildStepAddPlan(

        JArray rootSteps,

        StepOp op,

        out StepAddPlan? plan,

        out string? error)

    {

        plan = null;

        error = null;



        if (!TryExtractStepBodyFromOpEntry(op.Entry, out var stepBody, out error))

        {

            return false;

        }



        var newStep = (JObject)stepBody.DeepClone();

        StripStepLocatorFields(newStep);

        if (string.IsNullOrEmpty(ReadNonEmptyString(newStep["stepRunnerKey"])))

        {

            error = "add step requires stepRunnerKey.";

            return false;

        }



        if (!StepContainerResolver.TryResolveInsertIndex(

                rootSteps,

                op.Entry,

                out var container,

                out var index,

                out var containerPath,

                out error))

        {

            return false;

        }



        var stepId = ReadNonEmptyString(newStep["stepId"]) ?? ReadNonEmptyString(newStep["id"]);

        if (string.IsNullOrEmpty(stepId))

        {

            stepId = AllocateStepId(rootSteps);

        }



        newStep["stepId"] = stepId;

        newStep.Remove("id");



        plan = new StepAddPlan

        {

            Container = container!,

            ContainerPath = containerPath ?? "",

            Index = index,

            Step = newStep,

            Order = op.Order

        };

        return true;

    }



    private static bool TryRemoveStep(JArray rootSteps, JObject entry, out JObject? removed, out string? error)

    {

        removed = null;

        error = null;

        if (!TryResolveStepLocator(rootSteps, entry, out var parent, out var index, out error))

        {

            return false;

        }



        if (parent![index] is not JObject stepObj)

        {

            error = "Target step is not a JSON object.";

            return false;

        }



        removed = stepObj;

        parent.RemoveAt(index);

        return true;

    }



    private static bool TryMoveStep(JArray rootSteps, JObject entry, out JObject? moved, out string? error)

    {

        moved = null;

        error = null;



        if (!TryResolveStepLocator(rootSteps, entry, out var sourceParent, out var sourceIndex, out error))

        {

            return false;

        }



        if (sourceParent![sourceIndex] is not JObject stepObj)

        {

            error = "Target step is not a JSON object.";

            return false;

        }



        var detached = (JObject)stepObj.DeepClone();

        sourceParent.RemoveAt(sourceIndex);



        if (!StepContainerResolver.TryResolveInsertIndex(

                rootSteps,

                entry,

                out var targetContainer,

                out var targetIndex,

                out _,

                out error))

        {

            sourceParent.Insert(sourceIndex, detached);

            return false;

        }



        if (ReferenceEquals(sourceParent, targetContainer) && targetIndex > sourceIndex)

        {

            targetIndex--;

        }



        targetContainer!.Insert(targetIndex, detached);
        moved = detached;

        return true;

    }



    private static bool TryResolveStepLocator(

        JArray rootSteps,

        JObject entry,

        out JArray? parent,

        out int index,

        out string? error)

    {

        parent = null;

        index = -1;

        error = null;



        var stepId = ReadNonEmptyString(entry["stepId"]) ?? ReadNonEmptyString(entry["id"]);

        var nodePath = ReadNonEmptyString(entry["nodePath"]);

        if (string.IsNullOrEmpty(stepId) && string.IsNullOrEmpty(nodePath))

        {

            error = "Step op requires id, stepId, or nodePath.";

            return false;

        }



        var resolve = StepNodeResolver.ResolveTargetStep(rootSteps, stepId, nodePath);

        if (!resolve.Success)

        {

            error = resolve.ErrorMessage ?? "Target step not found.";

            return false;

        }



        parent = resolve.ParentArray;

        index = resolve.Index;

        return true;

    }



    private static bool TryApplyStepPatch(

        JArray steps,

        JObject stepPatch,

        out JObject updatedStep,

        out string? error)

    {

        updatedStep = new JObject();

        error = null;



        var stepId = ReadNonEmptyString(stepPatch["stepId"]) ?? ReadNonEmptyString(stepPatch["id"]);

        var nodePath = ReadNonEmptyString(stepPatch["nodePath"]);



        if (string.IsNullOrEmpty(stepId) && string.IsNullOrEmpty(nodePath))

        {

            error = "update step requires id, stepId, or nodePath.";

            return false;

        }



        var resolveResult = StepNodeResolver.ResolveTargetStep(steps, stepId, nodePath);

        if (!resolveResult.Success)

        {

            error = resolveResult.ErrorMessage ?? "Target step not found.";

            return false;

        }



        var targetToken = resolveResult.ParentArray![resolveResult.Index];

        if (targetToken is not JObject targetStepObj)

        {

            error = "Target step is not a JSON object.";

            return false;

        }



        var mergePatch = (JObject)stepPatch.DeepClone();

        StripStepLocatorFields(mergePatch);

        if (mergePatch["step"] is JObject nestedStep)

        {

            mergePatch.Remove("step");

            nestedStep.Remove("stepId");

            nestedStep.Remove("id");

            ApplyInputParamsPatchFromMerge(targetStepObj, nestedStep);

            targetStepObj.Merge(nestedStep, MergeSettings);

        }

        else

        {

            ApplyInputParamsPatchFromMerge(targetStepObj, mergePatch);

            targetStepObj.Merge(mergePatch, MergeSettings);

        }



        if (targetStepObj["stepRunnerKey"]?.Type != JTokenType.String)

        {

            error = "Patched step must keep stepRunnerKey.";

            return false;

        }



        updatedStep = targetStepObj;

        return true;

    }



    /// <summary>
    /// Merges <c>inputParams</c> using case-insensitive key match so <c>maxLines</c> replaces <c>MaxLines</c>.
    /// </summary>
    private static void ApplyInputParamsPatchFromMerge(JObject targetStepObj, JObject mergePatch)
    {
        if (mergePatch["inputParams"] is not JObject inputParamsPatch)
        {
            return;
        }

        mergePatch.Remove("inputParams");

        var targetInput = targetStepObj["inputParams"] as JObject;
        if (targetInput is null)
        {
            targetInput = new JObject();
            targetStepObj["inputParams"] = targetInput;
        }

        MergeInputParamsPatch(targetInput, inputParamsPatch);
    }

    private static void MergeInputParamsPatch(JObject targetInput, JObject inputParamsPatch)
    {
        foreach (var prop in inputParamsPatch.Properties())
        {
            if (prop.Value is null || prop.Value.Type == JTokenType.Null)
            {
                RemoveInputParamKeysCaseInsensitive(targetInput, prop.Name);
                continue;
            }

            if (prop.Value is not JObject paramPatch)
            {
                continue;
            }

            RemoveInputParamKeysCaseInsensitive(targetInput, prop.Name);

            if (targetInput[prop.Name] is JObject existing)
            {
                existing.Merge(paramPatch, MergeSettings);
            }
            else
            {
                targetInput[prop.Name] = (JObject)paramPatch.DeepClone();
            }
        }
    }

    private static void RemoveInputParamKeysCaseInsensitive(JObject inputParams, string key)
    {
        foreach (var prop in inputParams.Properties().ToList())
        {
            if (string.Equals(prop.Name, key, StringComparison.OrdinalIgnoreCase))
            {
                inputParams.Remove(prop.Name);
            }
        }
    }

    private static bool TryBuildVariableAddPlan(

        JArray variables,

        JObject entry,

        out int index,

        out JObject variable,

        out string? error)

    {

        index = -1;

        variable = new JObject();

        error = null;



        var body = entry["variable"] as JObject ?? entry;

        var clone = (JObject)body.DeepClone();

        clone.Remove("op");

        clone.Remove("afterKey");

        clone.Remove("beforeKey");

        clone.Remove("index");

        clone.Remove("newKey");



        var key = ReadNonEmptyString(clone["key"]);

        if (string.IsNullOrEmpty(key))

        {

            error = "add variable requires key.";

            return false;

        }



        if (VariableResolver.ResolveTargetVariable(variables, null, key).Success)

        {

            error = $"variable key already exists: {key}";

            return false;

        }



        if (entry["index"] is JValue { Type: JTokenType.Integer } indexToken)

        {

            index = indexToken.Value<int>();

            if (index < 0 || index > variables.Count)

            {

                error = $"variable index {index} is out of range.";

                return false;

            }

        }

        else if (!TryResolveVariableInsertIndex(variables, entry, out index, out error))

        {

            return false;

        }



        var variableId = ReadNonEmptyString(clone["id"]);

        if (string.IsNullOrEmpty(variableId))

        {

            variableId = AllocateVariableId(variables);

        }



        clone["id"] = variableId;

        clone["key"] = key;

        variable = clone;

        return true;

    }



    private static bool TryResolveVariableInsertIndex(

        JArray variables,

        JObject entry,

        out int index,

        out string? error)

    {

        index = -1;

        error = null;



        var afterKey = ReadNonEmptyString(entry["afterKey"]);

        if (!string.IsNullOrEmpty(afterKey))

        {

            var resolve = VariableResolver.ResolveTargetVariable(variables, null, afterKey);

            if (!resolve.Success)

            {

                error = resolve.ErrorMessage ?? $"afterKey not found: {afterKey}";

                return false;

            }



            index = resolve.Index + 1;

            return true;

        }



        var beforeKey = ReadNonEmptyString(entry["beforeKey"]);

        if (!string.IsNullOrEmpty(beforeKey))

        {

            var resolve = VariableResolver.ResolveTargetVariable(variables, null, beforeKey);

            if (!resolve.Success)

            {

                error = resolve.ErrorMessage ?? $"beforeKey not found: {beforeKey}";

                return false;

            }



            index = resolve.Index;

            return true;

        }



        index = variables.Count;

        return true;

    }



    private static bool TryRemoveVariable(

        JArray variables,

        JObject entry,

        out JObject? removed,

        out string? error)

    {

        removed = null;

        error = null;



        var variableId = ReadNonEmptyString(entry["id"]);

        var variableKey = ReadNonEmptyString(entry["key"]);

        if (string.IsNullOrEmpty(variableId) && string.IsNullOrEmpty(variableKey))

        {

            error = "remove variable requires id or key.";

            return false;

        }



        var resolve = VariableResolver.ResolveTargetVariable(variables, variableId, variableKey);

        if (!resolve.Success)

        {

            error = resolve.ErrorMessage ?? "Target variable not found.";

            return false;

        }



        if (resolve.ParentArray![resolve.Index] is not JObject variableObj)

        {

            error = "Target variable is not a JSON object.";

            return false;

        }



        removed = variableObj;

        resolve.ParentArray.RemoveAt(resolve.Index);

        return true;

    }



    private static bool TryApplyVariablePatch(

        JArray variables,

        JObject variablePatch,

        out JObject updatedVariable,

        out string? error)

    {

        updatedVariable = new JObject();

        error = null;



        var patch = (JObject)variablePatch.DeepClone();

        patch.Remove("op");

        patch.Remove("afterKey");

        patch.Remove("beforeKey");

        patch.Remove("index");

        if (patch["variable"] is JObject nested)

        {

            patch = nested;

        }



        var variableId = ReadNonEmptyString(patch["id"]);

        var variableKey = ReadNonEmptyString(patch["key"]);

        var newKey = ReadNonEmptyString(patch["newKey"]);



        if (string.IsNullOrEmpty(variableId) && string.IsNullOrEmpty(variableKey))

        {

            error = "update variable requires id or key.";

            return false;

        }



        if (!string.IsNullOrEmpty(variableKey) && !string.IsNullOrEmpty(newKey))

        {

            var resolveByKey = VariableResolver.ResolveTargetVariable(variables, null, variableKey);

            if (!resolveByKey.Success)

            {

                error = resolveByKey.ErrorMessage ?? "Target variable not found.";

                return false;

            }



            var targetByKey = (JObject)resolveByKey.ParentArray![resolveByKey.Index];

            var mergeByKey = (JObject)patch.DeepClone();

            mergeByKey.Remove("newKey");

            mergeByKey.Remove("key");

            targetByKey.Merge(mergeByKey, MergeSettings);

            targetByKey["key"] = newKey;



            if (string.IsNullOrWhiteSpace(targetByKey["key"]?.Value<string>()))

            {

                error = "Patched variable must keep a non-empty key.";

                return false;

            }



            updatedVariable = targetByKey;

            return true;

        }



        var resolveResult = VariableResolver.ResolveTargetVariable(variables, variableId, variableKey);

        if (!resolveResult.Success)

        {

            error = resolveResult.ErrorMessage ?? "Target variable not found.";

            return false;

        }



        var targetVariableObj = (JObject)resolveResult.ParentArray![resolveResult.Index];

        var mergePatch = (JObject)patch.DeepClone();

        mergePatch.Remove("newKey");



        targetVariableObj.Merge(mergePatch, MergeSettings);



        if (targetVariableObj["key"]?.Type != JTokenType.String

            || string.IsNullOrWhiteSpace(targetVariableObj["key"]!.Value<string>()))

        {

            error = "Patched variable must keep a non-empty key.";

            return false;

        }



        updatedVariable = targetVariableObj;

        return true;

    }



    private static void ReplaceProgramArray(JArray target, JArray source)

    {

        target.Clear();

        foreach (var item in source)

        {

            if (item is JObject obj)

            {

                target.Add((JObject)obj.DeepClone());

            }

        }

    }



    /// <summary>
    /// Step fields live at the same level as <c>op</c> (stepRunnerKey, inputParams, …).
    /// Legacy nested <c>step</c> / <c>stepPatch</c> objects are still accepted.
    /// </summary>
    private static bool TryExtractStepBodyFromOpEntry(JObject entry, out JObject? stepBody, out string? error)

    {

        stepBody = null;

        error = null;



        if (entry["step"] is JObject nestedStep)

        {

            stepBody = (JObject)nestedStep.DeepClone();

            return true;

        }



        if (entry["stepPatch"] is JObject nestedPatch)

        {

            stepBody = (JObject)nestedPatch.DeepClone();

            return true;

        }



        var flat = (JObject)entry.DeepClone();

        StripStepLocatorFields(flat);

        if (string.IsNullOrEmpty(ReadNonEmptyString(flat["stepRunnerKey"])))

        {

            error = "add step requires stepRunnerKey at the op level (or inside legacy 'step' / 'stepPatch').";

            return false;

        }



        stepBody = flat;

        return true;

    }



    private static void StripStepLocatorFields(JObject obj)

    {

        obj.Remove("op");

        obj.Remove("id");

        obj.Remove("nodePath");

        obj.Remove("containerPath");

        obj.Remove("index");

        obj.Remove("after");

        obj.Remove("before");

        obj.Remove("step");

        obj.Remove("stepPatch");

    }



    private static string AllocateStepId(JArray rootSteps)

    {

        var used = new HashSet<string>(StringComparer.Ordinal);

        CollectStepIds(rootSteps, used);

        var seq = 0;

        while (true)

        {

            seq++;

            var candidate = $"s-{seq}";

            if (!used.Contains(candidate))

            {

                return candidate;

            }

        }

    }



    private static void CollectStepIds(JArray steps, HashSet<string> used)

    {

        foreach (var token in steps)

        {

            if (token is not JObject stepObj)

            {

                continue;

            }



            var id = ReadNonEmptyString(stepObj["stepId"]) ?? ReadNonEmptyString(stepObj["id"]);

            if (!string.IsNullOrEmpty(id))

            {

                used.Add(id!);

            }



            if (stepObj["ifSteps"] is JArray ifSteps)

            {

                CollectStepIds(ifSteps, used);

            }



            if (stepObj["elseSteps"] is JArray elseSteps)

            {

                CollectStepIds(elseSteps, used);

            }

        }

    }



    private static string AllocateVariableId(JArray variables)

    {

        var used = new HashSet<string>(StringComparer.Ordinal);

        foreach (var token in variables)

        {

            if (token is JObject obj)

            {

                var id = ReadNonEmptyString(obj["id"]);

                if (!string.IsNullOrEmpty(id))

                {

                    used.Add(id!);

                }

            }

        }



        var seq = 0;

        while (true)

        {

            seq++;

            var candidate = $"v-{seq}";

            if (!used.Contains(candidate))

            {

                return candidate;

            }

        }

    }



    private static string? ReadNonEmptyString(JToken? token)

    {

        if (token?.Type != JTokenType.String)

        {

            return null;

        }



        var value = token.Value<string>()?.Trim();

        return string.IsNullOrEmpty(value) ? null : value;

    }

}


