using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using QuickerRpc.AgentModel.XAction.Project;
using QuickerRpc.AgentModel.XAction.Proto;

namespace QuickerRpc.AgentModel.XAction.Source;

/// <summary>
/// JObject-only V1 native JSON ↔ source wire adapter. The original native snapshot is the
/// lossless baseline: unknown fields, nulls, IDs and default-valued fields survive unrelated edits.
/// No protobuf parser or host types participate in this boundary.
/// </summary>
public static class V1ProgramSourceCodec
{
    private const string ExportIdPrefix = "qkrpc:";
    private static readonly Dictionary<string, string> ProgramFields = Fields(
        "Steps:steps", "Variables:variables", "SubPrograms:subPrograms", "PayloadType:payloadType",
        "LimitSingleInstance:limitSingleInstance", "SummaryExpression:summaryExpression",
        "Id:id", "Name:name", "Icon:icon", "Description:description", "CreateTimeUtc:createTimeUtc",
        "LastEditTimeUtc:lastEditTimeUtc", "IsLocalEdited:isLocalEdited", "TemplateId:templateId",
        "TemplateRevision:templateRevision", "UseServerVersion:useServerVersion", "IsProtected:isProtected",
        "SharedId:sharedId", "ShareTimeUtc:shareTimeUtc");
    private static readonly Dictionary<string, string> StepFields = Fields(
        "StepRunnerKey:key", "InputParams:inputs", "OutputParams:outputs", "IfSteps:ifSteps",
        "ElseSteps:elseSteps", "Note:note", "Disabled:disabled", "Collapsed:collapsed",
        "DelayMs:delayMs", "StepId:stepId");
    private static readonly Dictionary<string, string> VariableFields = Fields(
        "Id:id", "Key:key", "Type:varType", "DefaultValue:default", "Desc:desc",
        "IsLocked:isLocked", "SaveState:saveState", "Group:group", "CustomType:customType",
        "IsInput:isInput", "IsOutput:isOutput", "ParamName:paramName", "InputParamInfo:inputParamInfo",
        "OutputParamInfo:outputParamInfo", "TableDef:tableDef");

    /// <summary>
    /// Export native V1 program JSON to canonical source wire. Steps without IDs receive stable
    /// export-only IDs, so later reorders and edits can match the baseline without positional guesses.
    /// </summary>
    public static JObject FromNative(JObject native)
    {
        if (native is null) throw new ArgumentNullException(nameof(native));
        // Newtonsoft's default reader turns ISO strings into Date tokens. Source is JSON-shaped:
        // normalize them to strings before YAML so unchanged metadata can reuse the original token.
        using var reader = new JsonTextReader(new StringReader(native.ToString(Formatting.None))) { DateParseHandling = DateParseHandling.None, MaxDepth = 256 };
        var caw = CawCanonicalizer.Canonicalize(FromProgram(JObject.Load(reader), "root"));
        RequireUnique(AllSteps(caw), "stepId", "stepId", "step ID", allowEmpty: true);
        return caw;
    }

    /// <summary>
    /// Compile decoded source wire into native V1 JSON. Pass the untouched export snapshot for
    /// lossless updates; without it this creates a new native program. File binds must be resolved first.
    /// </summary>
    public static JObject ToNative(JObject caw, JObject? baselineNative = null, JObject? baselineCaw = null)
    {
        if (caw is null) throw new ArgumentNullException(nameof(caw));
        var baseline = baselineCaw is not null ? CawCanonicalizer.Canonicalize(baselineCaw)
            : baselineNative is null ? null : FromNative(baselineNative);
        var current = NormalizeForSave(caw, baseline);
        if (baselineNative is not null && JToken.DeepEquals(current, baseline)) return (JObject)baselineNative.DeepClone();
        // EmptyBodyJson and some old hosts use native camelCase. Edited output has one native
        // PascalCase spelling per known field, never both "steps" and "Steps".
        var native = baselineNative is null ? null : NormalizeNativeProgram(baselineNative);
        var steps = new Dictionary<string, Tuple<JObject, JObject>>(StringComparer.Ordinal);
        if (native is not null && baseline is not null) CollectBaselineSteps(native, baseline, steps);
        return ToProgram(current, native, baseline, steps);
    }

    /// <summary>
    /// Assign stable identities for new embedded subprogram declarations before compiling. Keep
    /// this result beside the saved native checkpoint; export-only step IDs must not be re-derived
    /// from native content after an edit or reorder.
    /// </summary>
    public static JObject NormalizeForSave(JObject caw, JObject? baselineCaw = null)
    {
        if (caw is null) throw new ArgumentNullException(nameof(caw));
        var normalized = CawCanonicalizer.Canonicalize(caw);
        ProgramSourceSubProgramIdentity.EnsureIds(normalized, baselineCaw);
        RequireUnique(AllSteps(normalized), "stepId", "stepId", "step ID", allowEmpty: true);
        return normalized;
    }

    private static JObject FromProgram(JObject native, string path)
    {
        var result = Rename(native, ProgramFields);
        if (path == "root") result["$schema"] = ProgramSourceSchemas.ActionV1;
        result["variables"] = FromVariables(result["variables"] as JArray);
        result["steps"] = FromSteps(result["steps"] as JArray, path);
        if (result["subPrograms"] is JArray subs)
        {
            result["subPrograms"] = new JArray(subs.Select((item, i) => item is JObject sub
                ? FromProgram(sub, path + "/sub/" + i) : item.DeepClone()));
        }
        return result;
    }

    private static JArray FromVariables(JArray? variables)
    {
        var result = new JArray();
        if (variables is null) return result;
        RequireUnique(variables.OfType<JObject>(), "Key", "key", "variable key");
        foreach (var item in variables)
        {
            if (item is not JObject variable) throw Invalid("Each native variable must be an object.");
            var mapped = Rename(variable, VariableFields);
            var type = mapped["varType"];
            if (VarTypeCodec.TryParse(type, out var typeNumber))
                mapped["varType"] = TypeName(typeNumber);
            result.Add(mapped);
        }
        return result;
    }

    private static JArray FromSteps(JArray? steps, string path)
    {
        var result = new JArray();
        if (steps is null) return result;
        RequireUnique(steps.OfType<JObject>(), "StepId", "stepId", "step ID", allowEmpty: true);
        for (var i = 0; i < steps.Count; i++)
        {
            if (steps[i] is not JObject step) throw Invalid("Each native step must be an object.");
            var mapped = Rename(step, StepFields);
            if (string.IsNullOrWhiteSpace(mapped.Value<string>("stepId")))
                mapped["stepId"] = ExportId(path + "/step/" + i, step);
            if (mapped["inputs"] is JObject inputs) mapped["inputs"] = FromInputs(DecodeNativeMapKeys(inputs));
            if (mapped["outputs"] is JObject outputs) mapped["outputs"] = DecodeNativeMapKeys(outputs);
            if (mapped["ifSteps"] is JArray thenSteps) mapped["ifSteps"] = FromSteps(thenSteps, path + "/" + i + "/then");
            if (mapped["elseSteps"] is JArray elseSteps) mapped["elseSteps"] = FromSteps(elseSteps, path + "/" + i + "/else");
            result.Add(mapped);
        }
        return result;
    }

    private static JObject FromInputs(JObject inputs)
    {
        var result = new JObject();
        foreach (var property in inputs.Properties())
        {
            if (property.Value is JObject parameter)
            {
                var variable = parameter["VarKey"] ?? parameter["varKey"];
                if (!string.IsNullOrEmpty(variable?.Value<string>()))
                    result[property.Name + ".var"] = variable.DeepClone();
                else
                    result[property.Name] = (parameter["Value"] ?? parameter["value"] ?? JValue.CreateNull()).DeepClone();
            }
            else result[property.Name] = property.Value.DeepClone();
        }
        return result;
    }

    private static JObject ToProgram(JObject current, JObject? oldNative, JObject? oldCaw,
        Dictionary<string, Tuple<JObject, JObject>> baselineSteps)
    {
        if (oldNative is not null && JToken.DeepEquals(current, oldCaw)) return (JObject)oldNative.DeepClone();
        var result = MergeFields(current, oldNative, oldCaw, ProgramFields, "steps", "variables", "subPrograms");
        if (oldNative is null || !JToken.DeepEquals(current["steps"], oldCaw?["steps"]))
            result["Steps"] = ToSteps(current["steps"] as JArray, baselineSteps);
        if (oldNative is null || !JToken.DeepEquals(current["variables"], oldCaw?["variables"]))
            result["Variables"] = ToVariables(current["variables"] as JArray, oldNative?["Variables"] as JArray, oldCaw?["variables"] as JArray);
        if (JToken.DeepEquals(current["subPrograms"], oldCaw?["subPrograms"])) return result;
        if (current["subPrograms"] is JArray subs)
        {
            RequireUnique(subs.OfType<JObject>(), "id", "id", "subprogram ID", allowEmpty: true);
            var nativeSubs = oldNative?["SubPrograms"] as JArray;
            var cawSubs = oldCaw?["subPrograms"] as JArray;
            result["SubPrograms"] = new JArray(subs.OfType<JObject>().Select(sub =>
            {
                var key = sub.Value<string>("id");
                return ToProgram(sub, Find(nativeSubs, "Id", key), Find(cawSubs, "id", key), baselineSteps);
            }));
        }
        else result.Remove("SubPrograms");
        return result;
    }

    private static JArray ToSteps(JArray? steps, Dictionary<string, Tuple<JObject, JObject>> baselineSteps)
    {
        var result = new JArray();
        if (steps is null) return result;
        RequireUnique(steps.OfType<JObject>(), "stepId", "stepId", "step ID", allowEmpty: true);
        foreach (var token in steps)
        {
            if (token is not JObject step) throw Invalid("Each step must be an object.");
            var id = step.Value<string>("stepId");
            var match = id is not null && baselineSteps.TryGetValue(id, out var found) ? found : null;
            var old = match?.Item1;
            var oldCaw = match?.Item2;
            if (old is not null && JToken.DeepEquals(step, oldCaw)) { result.Add(old.DeepClone()); continue; }
            var expanded = (JObject)step.DeepClone();
            ExpandSubProgram(expanded);
            var oldExpanded = oldCaw is null ? null : (JObject)oldCaw.DeepClone();
            if (oldExpanded is not null)
            {
                ExpandSubProgram(oldExpanded);
            }
            var mapped = MergeFields(expanded, old, oldExpanded, StepFields,
                "inputs", "outputs", "ifSteps", "elseSteps", "subProgram", "subProgram.var");
            if (old is null || !JToken.DeepEquals(expanded["inputs"], oldExpanded?["inputs"]))
                mapped["InputParams"] = ToInputs(expanded["inputs"] as JObject, old?["InputParams"] as JObject, oldExpanded?["inputs"] as JObject);
            SetOutputs(mapped, expanded["outputs"], old?["OutputParams"] as JObject, oldExpanded?["outputs"]);
            SetSteps(mapped, "IfSteps", step["ifSteps"] as JArray, oldCaw?["ifSteps"] as JArray, baselineSteps);
            SetSteps(mapped, "ElseSteps", step["elseSteps"] as JArray, oldCaw?["elseSteps"] as JArray, baselineSteps);
            if (id?.StartsWith(ExportIdPrefix, StringComparison.Ordinal) == true)
            {
                if (old?["StepId"] is { } oldId) mapped["StepId"] = oldId.DeepClone();
                else mapped.Remove("StepId");
            }
            result.Add(mapped);
        }
        return result;
    }

    private static JObject ToInputs(JObject? inputs, JObject? nativeInputs, JObject? oldInputs)
    {
        if (JToken.DeepEquals(inputs, oldInputs)) return nativeInputs is null ? new JObject() : (JObject)nativeInputs.DeepClone();
        var result = nativeInputs is null ? new JObject() : (JObject)nativeInputs.DeepClone();
        var current = inputs ?? new JObject();
        var old = oldInputs ?? new JObject();
        var bases = current.Properties().Select(p => InputBase(p.Name)).Concat(old.Properties().Select(p => InputBase(p.Name))).Distinct(StringComparer.Ordinal);
        foreach (var key in bases)
        {
            var currentBinding = Binding(current, key);
            var oldBinding = Binding(old, key);
            if (JToken.DeepEquals(currentBinding, oldBinding)) continue;
            var nativeKey = NativeMapKey(nativeInputs, key);
            if (currentBinding.Count == 0) { result.Remove(nativeKey); continue; }
            if (current[key + ".file"] is not null) throw new ProgramSourceException("source_file_unresolved", "Resolve file binding before compiling: " + key);
            var parameter = result[nativeKey] is JObject existing ? (JObject)existing.DeepClone() : new JObject();
            parameter.Remove("varKey"); parameter.Remove("value");
            if (current[key + ".var"] is { } variableBinding)
            {
                parameter["VarKey"] = variableBinding.DeepClone();
                if (old[key + ".var"] is null) parameter["Value"] = string.Empty;
            }
            else
            {
                if (old[key + ".var"] is not null) parameter["VarKey"] = string.Empty;
                parameter["Value"] = current[key]?.DeepClone() ?? new JValue(string.Empty);
            }
            if (parameter["Value"]?.Type is not JTokenType.String and not JTokenType.Null)
                parameter["Value"] = parameter["Value"]!.ToString(Formatting.None);
            result[nativeKey] = parameter;
        }
        return result;
    }

    private static JArray ToVariables(JArray? variables, JArray? nativeVariables, JArray? cawVariables)
    {
        var result = new JArray();
        if (variables is null) return result;
        RequireUnique(variables.OfType<JObject>(), "key", "key", "variable key");
        foreach (var token in variables)
        {
            if (token is not JObject variable) throw Invalid("Each variable must be an object.");
            var key = variable.Value<string>("key");
            var old = Find(nativeVariables, "Key", key);
            var oldCaw = Find(cawVariables, "key", key);
            if (old is not null && JToken.DeepEquals(variable, oldCaw)) { result.Add(old.DeepClone()); continue; }
            var mapped = MergeFields(variable, old, oldCaw, VariableFields);
            if (!JToken.DeepEquals(variable["varType"], oldCaw?["varType"]) || old is null)
            {
                if (!VarTypeCodec.TryParse(variable["varType"] ?? variable["type"], out var type)) throw Invalid("Unknown variable type for " + key);
                mapped["Type"] = type;
                mapped.Remove("type");
            }
            result.Add(mapped);
        }
        return result;
    }

    private static JObject MergeFields(JObject current, JObject? oldNative, JObject? oldCaw,
        Dictionary<string, string> names, params string[] special)
    {
        var result = oldNative is null ? new JObject() : (JObject)oldNative.DeepClone();
        var ignored = new HashSet<string>(special, StringComparer.Ordinal) { "$schema" };
        foreach (var key in current.Properties().Select(p => p.Name).Concat(oldCaw?.Properties().Select(p => p.Name) ?? Enumerable.Empty<string>()).Distinct(StringComparer.Ordinal))
        {
            if (ignored.Contains(key) || JToken.DeepEquals(current[key], oldCaw?[key])) continue;
            var nativeKey = names.FirstOrDefault(pair => pair.Value == key).Key ?? key;
            if (current[key] is { } value) result[nativeKey] = value.DeepClone();
            else result.Remove(nativeKey);
        }
        result.Remove("$schema");
        return result;
    }

    private static void SetSteps(JObject target, string key, JArray? current, JArray? old,
        Dictionary<string, Tuple<JObject, JObject>> baselineSteps)
    {
        if (JToken.DeepEquals(current, old)) return;
        if (current is null) target.Remove(key);
        else target[key] = ToSteps(current, baselineSteps);
    }
    private static void ExpandSubProgram(JObject step)
    {
        if (!ProgramSourceSubProgramIoFold.IsSubProgramStep(step)) return;
        ProgramSourceSubProgramIoFold.ExpandBareKeysToVarPrefixInPlace(step);
        ProgramSourceSubProgramStepSugar.InjectModuleTargetIntoInputParams(step);
    }
    private static void SetOutputs(JObject target, JToken? current, JObject? native, JToken? old)
    {
        if (JToken.DeepEquals(current, old)) return;
        if (current is null) target.Remove("OutputParams");
        else if (current is JObject outputs)
            target["OutputParams"] = new JObject(outputs.Properties().Select(property =>
                new JProperty(NativeMapKey(native, property.Name), property.Value.DeepClone())));
        else target["OutputParams"] = current.DeepClone();
    }
    // Old V1/protobuf exports can escape ':' in parameter map keys as U+001F. Source always
    // uses readable keys, while edits retain each existing native spelling and binding metadata.
    private static JObject DecodeNativeMapKeys(JObject map)
    {
        var result = new JObject();
        foreach (var property in map.Properties())
        {
            var key = ProtoMapKeyEscaping.Decode(property.Name);
            if (result.ContainsKey(key)) throw Invalid("Ambiguous native parameter aliases for " + key);
            result[key] = property.Value.DeepClone();
        }
        return result;
    }
    private static string NativeMapKey(JObject? map, string key)
    {
        var matches = map?.Properties().Where(property => ProtoMapKeyEscaping.Decode(property.Name) == key).ToArray();
        if (matches?.Length > 1) throw Invalid("Ambiguous native parameter aliases for " + key);
        return matches?.FirstOrDefault()?.Name ?? key;
    }
    private static JObject Binding(JObject inputs, string key)
    {
        var result = new JObject();
        foreach (var suffix in new[] { "", ".var", ".file" }) if (inputs[key + suffix] is { } value) result[key + suffix] = value.DeepClone();
        return result;
    }
    private static string InputBase(string key) => key.EndsWith(".var", StringComparison.Ordinal) ? key.Substring(0, key.Length - 4)
        : key.EndsWith(".file", StringComparison.Ordinal) ? key.Substring(0, key.Length - 5) : key;
    private static JObject Rename(JObject value, Dictionary<string, string> names)
    {
        var result = new JObject();
        foreach (var property in value.Properties())
        {
            var known = NativeField(property.Name, names);
            var key = known.Key is null ? property.Name : known.Value;
            if (result.ContainsKey(key)) throw Invalid("Ambiguous native aliases for " + key);
            result[key] = property.Value.DeepClone();
        }
        return result;
    }
    private static KeyValuePair<string, string> NativeField(string name, Dictionary<string, string> names) =>
        names.FirstOrDefault(pair => name == pair.Key || name == pair.Value
            || name == char.ToLowerInvariant(pair.Key[0]) + pair.Key.Substring(1));
    private static JObject ToPascal(JObject value, Dictionary<string, string> names)
    {
        var result = new JObject();
        foreach (var property in value.Properties())
        {
            var known = NativeField(property.Name, names);
            var key = known.Key ?? property.Name;
            if (result.ContainsKey(key)) throw Invalid("Ambiguous native aliases for " + key);
            result[key] = property.Value.DeepClone();
        }
        return result;
    }
    private static JObject NormalizeNativeProgram(JObject value)
    {
        var result = ToPascal(value, ProgramFields);
        if (result["Steps"] is JArray steps) result["Steps"] = NormalizeSteps(steps);
        if (result["Variables"] is JArray variables)
            result["Variables"] = new JArray(variables.Select(variable => variable is JObject obj ? ToPascal(obj, VariableFields) : variable.DeepClone()));
        if (result["SubPrograms"] is JArray subs)
            result["SubPrograms"] = new JArray(subs.Select(sub => sub is JObject obj ? NormalizeNativeProgram(obj) : sub.DeepClone()));
        return result;

        static JArray NormalizeSteps(JArray items)
        {
            return new JArray(items.Select(item =>
            {
                if (item is not JObject step) return item.DeepClone();
                var mapped = ToPascal(step, StepFields);
                if (mapped["IfSteps"] is JArray thenSteps) mapped["IfSteps"] = NormalizeSteps(thenSteps);
                if (mapped["ElseSteps"] is JArray elseSteps) mapped["ElseSteps"] = NormalizeSteps(elseSteps);
                if (mapped["InputParams"] is JObject inputs)
                    foreach (var property in inputs.Properties())
                        if (property.Value is JObject parameter)
                        {
                            if (parameter["varKey"] is { } varKey && parameter["VarKey"] is null) parameter["VarKey"] = varKey.DeepClone();
                            if (parameter["value"] is { } literal && parameter["Value"] is null) parameter["Value"] = literal.DeepClone();
                            parameter.Remove("varKey"); parameter.Remove("value");
                        }
                return mapped;
            }));
        }
    }
    private static Dictionary<string, string> Fields(params string[] fields) => fields.Select(field => field.Split(':')).ToDictionary(parts => parts[0], parts => parts[1], StringComparer.Ordinal);
    private static JObject? Find(JArray? items, string key, string? value) => string.IsNullOrWhiteSpace(value) ? null
        : items?.OfType<JObject>().SingleOrDefault(item => string.Equals(item.Value<string>(key), value, StringComparison.Ordinal));
    private static IEnumerable<JObject> AllSteps(JObject program)
    {
        foreach (var step in Walk(program["steps"] as JArray)) yield return step;
        if (program["subPrograms"] is JArray subs)
            foreach (var sub in subs.OfType<JObject>()) foreach (var step in AllSteps(sub)) yield return step;

        static IEnumerable<JObject> Walk(JArray? steps)
        {
            if (steps is null) yield break;
            foreach (var step in steps.OfType<JObject>())
            {
                yield return step;
                foreach (var child in Walk(step["ifSteps"] as JArray)) yield return child;
                foreach (var child in Walk(step["elseSteps"] as JArray)) yield return child;
            }
        }
    }
    private static void CollectBaselineSteps(JObject native, JObject caw, Dictionary<string, Tuple<JObject, JObject>> index)
    {
        Collect(native["Steps"] as JArray, caw["steps"] as JArray);
        var nativeSubs = native["SubPrograms"] as JArray;
        if (caw["subPrograms"] is JArray subs && nativeSubs is not null)
            for (var i = 0; i < subs.Count && i < nativeSubs.Count; i++)
                if (subs[i] is JObject sub && nativeSubs[i] is JObject nativeSub) CollectBaselineSteps(nativeSub, sub, index);

        void Collect(JArray? originals, JArray? exported)
        {
            if (originals is null || exported is null) return;
            for (var i = 0; i < exported.Count && i < originals.Count; i++)
            {
                if (originals[i] is not JObject original || exported[i] is not JObject source) continue;
                var id = source.Value<string>("stepId");
                if (!string.IsNullOrWhiteSpace(id))
                {
                    if (index.ContainsKey(id!)) throw Invalid("Duplicate baseline step ID: " + id);
                    index.Add(id!, Tuple.Create(original, source));
                }
                Collect(original["IfSteps"] as JArray, source["ifSteps"] as JArray);
                Collect(original["ElseSteps"] as JArray, source["elseSteps"] as JArray);
            }
        }
    }
    private static void RequireUnique(IEnumerable<JObject> items, string nativeKey, string sourceKey, string label, bool allowEmpty = false)
    {
        var keys = new HashSet<string>(StringComparer.Ordinal);
        foreach (var item in items)
        {
            var key = item.Value<string>(nativeKey) ?? item.Value<string>(sourceKey);
            if (string.IsNullOrWhiteSpace(key)) { if (allowEmpty) continue; throw Invalid("Missing " + label + "."); }
            if (!keys.Add(key!)) throw Invalid("Duplicate " + label + ": " + key);
        }
    }
    private static string ExportId(string path, JObject step)
    {
        using var hash = SHA256.Create();
        return ExportIdPrefix + BitConverter.ToString(hash.ComputeHash(Encoding.UTF8.GetBytes(path + "\n" + step.ToString(Formatting.None)))).Replace("-", string.Empty).Substring(0, 24).ToLowerInvariant();
    }
    private static JToken TypeName(int type) => type switch
    {
        0 => new JValue("text"), 1 => new JValue("number"), 2 => new JValue("boolean"), 3 => new JValue("image"),
        4 => new JValue("list"), 6 => new JValue("datetime"), 9 => new JValue("enum"), 10 => new JValue("dict"),
        12 => new JValue("integer"), 13 => new JValue("table"), 98 => new JValue("object"), 99 => new JValue("any"),
        _ => new JValue(type),
    };
    private static ProgramSourceException Invalid(string message) => new(ProgramSourceCodes.CawInvalid, message);
}
