// Ported from Quicker Quicker.Ai.Workspace, revision 574556d76b0b10bd9a8a7951277435649650fab8.
using System;
using System.Collections.Generic;
using System.Linq;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using QuickerRpc.AgentModel.XAction.Proto;

namespace QuickerRpc.AgentModel.XAction.Source;

/// <summary>
/// Canonical Agent Wire (CAW) normalization for bijection with program source.
/// Does not omit-default inputs or auto-externalize files.
/// </summary>
public static class CawCanonicalizer
{
    private static readonly string[] RootKeyOrder =
    [
        "$schema",
        "variables",
        "steps",
        "subPrograms",
    ];

    private static readonly string[] VariableKeyOrder =
    [
        "key",
        "varType",
        "type",
        "default",
        "default.file",
        "desc",
        "isLocked",
        "saveState",
        "group",
        "customType",
        "isInput",
        "isOutput",
        "paramName",
        "inputParamInfo",
        "outputParamInfo",
        "tableDef",
    ];

    private static readonly string[] StepKeyOrder =
    [
        "key",
        "subProgram",
        "subProgram.var",
        "inputs",
        "outputs",
        "ifSteps",
        "elseSteps",
        "note",
        "disabled",
        "collapsed",
        "delayMs",
        "stepId",
    ];

    private static readonly JsonSerializerSettings JsonSettings = new()
    {
        Formatting = Formatting.Indented,
        NullValueHandling = NullValueHandling.Ignore,
    };

    private enum KeyOrderKind
    {
        Root,
        Variable,
        Step,
        MapAlpha,
    }

    /// <summary>Return deep-cloned canonical CAW object.</summary>
    public static JObject Canonicalize(JObject data)
    {
        var root = (JObject)data.DeepClone();
        ProgramEnvelopeDefaults.OmitFrom(root);
        ToShortRecursive(root);
        NormalizeSysRunnerKeysRecursive(root);
        ProgramSourceSubProgramIoFold.MigrateToBareKeysInPlace(root);
        // SourceImplied control fields stay explicit in CAW (same rule as checkout compression).
        ProgramSourceControlImplication.MaterializeStepsRecursive(root);
        CleanupPresentation(root);
        EnsureExplicitTextVarTypes(root["variables"] as JArray);
        EnsureExplicitTextVarTypesInSubPrograms(root["subPrograms"] as JArray);
        OmitNulls(root, CollectInputLiteralRoots(root));
        OmitEmptyContainers(root, structural: true);
        return (JObject)ReorderTree(root, KeyOrderKind.Root);
    }

    /// <summary>Canonical Pretty JSON text (LF, 2-space indent).</summary>
    public static string CanonicalizeToText(JObject data)
    {
        var caw = Canonicalize(data);
        return NormalizeNewlines(JsonConvert.SerializeObject(caw, JsonSettings));
    }

    public static string NormalizeNewlines(string text) =>
        text.Replace("\r\n", "\n", StringComparison.Ordinal).Replace('\r', '\n');

    private static void ToShortRecursive(JObject root)
    {
        if (root["steps"] is JArray steps)
        {
            AgentStepWireAliases.ToShortSteps(steps);
        }

        if (root["subPrograms"] is not JArray subPrograms)
        {
            return;
        }

        foreach (var sp in subPrograms.OfType<JObject>())
        {
            if (sp["steps"] is JArray spSteps)
            {
                AgentStepWireAliases.ToShortSteps(spSteps);
            }

            ToShortRecursive(sp);
        }
    }

    /// <summary>
    /// CAW runner keys use lowercase <c>sys:</c>. Case variants like <c>SYS:</c> are normalized here.
    /// </summary>
    private static void NormalizeSysRunnerKeysRecursive(JObject root)
    {
        NormalizeSysRunnerKeysInSteps(root["steps"] as JArray);
        if (root["subPrograms"] is not JArray subs)
        {
            return;
        }

        foreach (var sp in subs.OfType<JObject>())
        {
            NormalizeSysRunnerKeysRecursive(sp);
        }
    }

    private static void NormalizeSysRunnerKeysInSteps(JArray? steps)
    {
        if (steps is null)
        {
            return;
        }

        foreach (var step in steps.OfType<JObject>())
        {
            var key = AgentStepWireAliases.ReadRunnerKey(step);
            if (SysRunnerKey.TryNormalizePrefix(key, out var normalized))
            {
                step["key"] = normalized;
            }

            NormalizeSysRunnerKeysInSteps(step["ifSteps"] as JArray);
            NormalizeSysRunnerKeysInSteps(step["elseSteps"] as JArray);
        }
    }

    private static void CleanupPresentation(JObject root)
    {
        CleanupSteps(root["steps"] as JArray);
        CleanupVariables(root["variables"] as JArray);
        if (root["subPrograms"] is not JArray subs)
        {
            return;
        }

        foreach (var sp in subs.OfType<JObject>())
        {
            CleanupSteps(sp["steps"] as JArray);
            CleanupVariables(sp["variables"] as JArray);
            CleanupPresentation(sp);
        }
    }

    private static void CleanupSteps(JArray? steps)
    {
        if (steps is null)
        {
            return;
        }

        foreach (var step in steps.OfType<JObject>())
        {
            OmitBoolIfFalse(step, "disabled");
            OmitBoolIfFalse(step, "collapsed");
            if (IsZeroNumber(step["delayMs"]))
            {
                step.Remove("delayMs");
            }

            OmitStringIfEmpty(step, "note");
            CleanupSteps(step["ifSteps"] as JArray);
            CleanupSteps(step["elseSteps"] as JArray);
        }
    }

    private static void CleanupVariables(JArray? variables)
    {
        if (variables is null)
        {
            return;
        }

        RequireUniqueVariableIds(variables);
        foreach (var variable in variables.OfType<JObject>())
        {
            // These can be real native identities. Editor-only identities must be
            // removed by the editor projection, never guessed from their spelling here.
            OmitBoolIfFalse(variable, "isLocked");
            OmitBoolIfFalse(variable, "saveState");
            OmitBoolIfFalse(variable, "isInput");
            OmitBoolIfFalse(variable, "isOutput");
            OmitStringIfEmpty(variable, "desc");
            OmitStringIfEmpty(variable, "paramName");
            OmitStringIfEmpty(variable, "group");
            OmitStringIfEmpty(variable, "customType");
            // Keep empty-string default when present (fixture uses default: "").
        }
    }

    internal static string? ReadVariableId(JObject variable)
    {
        var camel = variable.Property("id");
        var pascal = variable.Property("Id");
        if (camel is not null && pascal is not null)
            throw new ProgramSourceException(ProgramSourceCodes.CawInvalid, "Ambiguous variable id/Id aliases.");
        var token = (camel ?? pascal)?.Value;
        if (token is null || token.Type is JTokenType.Null or JTokenType.Undefined) return null;
        if (token.Type != JTokenType.String)
            throw new ProgramSourceException(ProgramSourceCodes.CawInvalid, "Variable identity must be a string.");
        var id = token.Value<string>();
        return string.IsNullOrWhiteSpace(id) ? null : id;
    }

    internal static void RequireUniqueVariableIds(JArray? variables)
    {
        if (variables is null) return;
        var ids = new HashSet<string>(StringComparer.Ordinal);
        foreach (var variable in variables.OfType<JObject>())
        {
            var id = ReadVariableId(variable);
            if (id is not null && !ids.Add(id))
                throw new ProgramSourceException(ProgramSourceCodes.CawInvalid, "Duplicate variable ID: " + id);
        }
    }

    private static void EnsureExplicitTextVarTypes(JArray? variables)
    {
        if (variables is null)
        {
            return;
        }

        foreach (var variable in variables.OfType<JObject>())
        {
            var varType = variable["varType"]?.Type == JTokenType.String
                ? variable.Value<string>("varType")
                : null;
            var type = variable["type"];
            if (string.IsNullOrWhiteSpace(varType) && type is null)
            {
                variable["varType"] = "text";
            }
            else if (string.Equals(varType, "text", StringComparison.OrdinalIgnoreCase))
            {
                variable.Remove("type");
                variable["varType"] = "text";
            }
            else if (string.IsNullOrWhiteSpace(varType)
                     && type is { Type: JTokenType.Integer } && type.Value<int>() == 0)
            {
                // Legacy type:0 only when varType is absent — do not override number/etc.
                variable.Remove("type");
                variable["varType"] = "text";
            }
        }
    }

    private static void EnsureExplicitTextVarTypesInSubPrograms(JArray? subPrograms)
    {
        if (subPrograms is null)
        {
            return;
        }

        foreach (var sp in subPrograms.OfType<JObject>())
        {
            EnsureExplicitTextVarTypes(sp["variables"] as JArray);
            EnsureExplicitTextVarTypesInSubPrograms(sp["subPrograms"] as JArray);
        }
    }

    private static void OmitEmptyContainers(JToken token, bool structural)
    {
        if (!structural || token is not JObject root) return;
        VisitStructuralOwners(root, (owner, kind) =>
        {
            foreach (var property in owner.Properties().ToArray())
            {
                var knownMap = kind == KeyOrderKind.Step && property.Name is "inputs" or "outputs"
                    || kind == KeyOrderKind.Variable && property.Name is "inputParamInfo" or "outputParamInfo" or "tableDef";
                if (knownMap && property.Value is JObject { Count: 0 }
                    || kind == KeyOrderKind.Step && IsOmittableEmptyArray(property.Name) && property.Value is JArray { Count: 0 })
                    property.Remove();
            }
        });
    }

    private static bool IsOmittableEmptyMap(string name) =>
        name is "inputs" or "outputs" or "inputParamInfo" or "outputParamInfo" or "tableDef";

    private static bool IsOmittableEmptyArray(string name) =>
        name is "ifSteps" or "elseSteps";

    /// <summary>源码规范化与 data.json 落盘共用：只保护真实步骤输入中的对象/数组数据。</summary>
    internal static HashSet<JToken> CollectInputLiteralRoots(JObject root)
    {
        var literals = new HashSet<JToken>(SourceReferenceEqualityComparer.Instance);
        CollectProgram(root);
        return literals;

        void CollectProgram(JObject program)
        {
            CollectSteps(program["steps"] as JArray);
            if (program["subPrograms"] is JArray subPrograms)
            {
                foreach (var subProgram in subPrograms.OfType<JObject>())
                {
                    CollectProgram(subProgram);
                }
            }
        }

        void CollectSteps(JArray? steps)
        {
            if (steps is null)
            {
                return;
            }

            foreach (var step in steps.OfType<JObject>())
            {
                if (AgentStepWireAliases.ReadInputMap(step) is { } inputs)
                {
                    foreach (var input in inputs.Properties())
                    {
                        if (input.Value is JObject or JArray)
                        {
                            literals.Add(input.Value);
                        }
                    }
                }

                CollectSteps(step["ifSteps"] as JArray);
                CollectSteps(step["elseSteps"] as JArray);
            }
        }
    }

    private static void OmitNulls(JToken token, HashSet<JToken> inputLiterals)
    {
        if (token is not JObject root) return;
        VisitStructuralOwners(root, (owner, kind) =>
        {
            foreach (var property in owner.Properties().ToArray())
            {
                // Only optional structural containers use null as absence. Literal,
                // metadata and extension nulls are data, including names such as
                // future.outputs; never recurse into opaque extension objects.
                var container = kind == KeyOrderKind.Root && property.Name is "steps" or "variables" or "subPrograms"
                    || kind == KeyOrderKind.Step && property.Name is "inputs" or "outputs" or "ifSteps" or "elseSteps";
                if (container && property.Value.Type is JTokenType.Null or JTokenType.Undefined) property.Remove();
            }
        });
    }

    private static void VisitStructuralOwners(JObject program, Action<JObject, KeyOrderKind> visit)
    {
        visit(program, KeyOrderKind.Root);
        if (program["variables"] is JArray variables)
            foreach (var variable in variables.OfType<JObject>()) visit(variable, KeyOrderKind.Variable);
        if (program["steps"] is JArray steps) VisitSteps(steps);
        if (program["subPrograms"] is JArray subs)
            foreach (var sub in subs.OfType<JObject>()) VisitStructuralOwners(sub, visit);
        void VisitSteps(JArray rows)
        {
            foreach (var step in rows.OfType<JObject>())
            {
                visit(step, KeyOrderKind.Step);
                if (step["ifSteps"] is JArray thenSteps) VisitSteps(thenSteps);
                if (step["elseSteps"] is JArray elseSteps) VisitSteps(elseSteps);
            }
        }
    }

    private static JToken ReorderTree(JToken token, KeyOrderKind kind)
    {
        if (token is JObject obj)
        {
            var dst = new JObject();
            foreach (var key in OrderedKeys(obj, kind))
            {
                var value = obj[key]!;
                if (value is JArray arr)
                {
                    var elementKind = key switch
                    {
                        "variables" => KeyOrderKind.Variable,
                        "steps" or "ifSteps" or "elseSteps" => KeyOrderKind.Step,
                        "subPrograms" => KeyOrderKind.Root,
                        _ => KeyOrderKind.MapAlpha,
                    };
                    var dstArr = new JArray();
                    foreach (var child in arr)
                    {
                        dstArr.Add(ReorderTree(child, elementKind));
                    }

                    dst[key] = dstArr;
                }
                else
                {
                    var childKind = kind switch
                    {
                        KeyOrderKind.Root => key switch
                        {
                            "variables" => KeyOrderKind.Variable,
                            "steps" => KeyOrderKind.Step,
                            "subPrograms" => KeyOrderKind.Root,
                            _ => KeyOrderKind.MapAlpha,
                        },
                        KeyOrderKind.Step => key is "inputs" or "outputs"
                            ? KeyOrderKind.MapAlpha
                            : KeyOrderKind.MapAlpha,
                        _ => KeyOrderKind.MapAlpha,
                    };
                    dst[key] = ReorderTree(value, childKind);
                }
            }

            return dst;
        }

        return token.DeepClone();
    }

    private static IEnumerable<string> OrderedKeys(JObject obj, KeyOrderKind kind)
    {
        var preferred = kind switch
        {
            KeyOrderKind.Root => RootKeyOrder,
            KeyOrderKind.Variable => VariableKeyOrder,
            KeyOrderKind.Step => StepKeyOrder,
            _ => Array.Empty<string>(),
        };

        var remaining = new SortedSet<string>(obj.Properties().Select(p => p.Name), StringComparer.Ordinal);
        foreach (var key in preferred)
        {
            if (remaining.Remove(key))
            {
                yield return key;
            }
        }

        foreach (var key in remaining)
        {
            yield return key;
        }
    }

    private static void OmitBoolIfFalse(JObject obj, string name)
    {
        var token = obj[name];
        if (token is null)
        {
            return;
        }

        if (token.Type == JTokenType.Boolean && !token.Value<bool>())
        {
            obj.Remove(name);
        }
        else if (token.Type == JTokenType.Integer && token.Value<int>() == 0)
        {
            obj.Remove(name);
        }
    }

    private static void OmitStringIfEmpty(JObject obj, string name)
    {
        if (obj[name]?.Type == JTokenType.String
            && string.IsNullOrEmpty(obj.Value<string>(name)))
        {
            obj.Remove(name);
        }
    }

    private static bool IsZeroNumber(JToken? token)
    {
        if (token is null)
        {
            return false;
        }

        return token.Type switch
        {
            JTokenType.Integer => token.Value<long>() == 0,
            JTokenType.Float => Math.Abs(token.Value<double>()) < double.Epsilon,
            _ => false,
        };
    }
}
