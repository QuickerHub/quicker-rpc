using System;
using System.Collections.Generic;
using System.Linq;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

namespace QuickerRpc.AgentModel.XAction.Project;

/// <summary>
/// Structural schema validation for workspace program wire (data.json steps/variables).
/// Blocks save/patch on unknown or mistyped fields (e.g. <c>stepkey</c> instead of
/// <c>stepRunnerKey</c>) with JSON-path + line positions and spelling suggestions.
/// Does NOT evaluate expressions or scripts — that is diagnostics' job.
/// </summary>
public static class ProgramWireSchemaValidator
{
    public sealed class SchemaIssue
    {
        public string Code { get; set; } = string.Empty;

        /// <summary>JSON path inside data.json, e.g. <c>steps[2].ifSteps[0].stepkey</c>.</summary>
        public string Path { get; set; } = string.Empty;

        public int? Line { get; set; }

        public string Message { get; set; } = string.Empty;

        public override string ToString() =>
            Line is int line ? $"{Path} (line {line}): {Message}" : $"{Path}: {Message}";
    }

    /// <summary>Canonical step wire fields. Accepted spellings: exact camelCase or PascalCase.</summary>
    private static readonly string[] StepFields =
    {
        "stepRunnerKey",
        "stepId",
        "inputParams",
        "outputParams",
        "ifSteps",
        "elseSteps",
        "note",
        "disabled",
        "collapsed",
        "delayMs",
    };

    /// <summary>
    /// Canonical variable wire fields (union of action and subprogram shapes, plus
    /// disk wire keys consumed by <c>VariableDefaultValueWireCoercer</c>).
    /// </summary>
    private static readonly string[] VariableFields =
    {
        "id",
        "key",
        "varType",
        "type",
        "default",
        "default.file",
        "defaultValue",
        "defaultValue.file",
        "defaultValueFile",
        "desc",
        "isLocked",
        "saveState",
        "isInput",
        "isOutput",
        "paramName",
        "group",
        "customType",
        "inputParamInfo",
        "outputParamInfo",
        "tableDef",
    };

    /// <summary>Subprogram IO input param options (variables[].inputParamInfo) — see action-data-schema.</summary>
    private static readonly string[] InputParamInfoFields =
    {
        "inputMethod",
        "selectionItems",
        "onlyUseSelect",
        "isRequired",
        "validationPattern",
        "variableMode",
        "textTools",
        "replaceMode",
        "isAdvanced",
        "allowInput",
        "multiLine",
        "visibleExpression",
        "skipEval",
    };

    private static readonly string[] OutputParamInfoFields =
    {
        "visibleExpression",
    };

    private static readonly HashSet<string> AcceptedStepFields = BuildAcceptedNames(StepFields);

    private static readonly HashSet<string> AcceptedVariableFields = BuildAcceptedNames(VariableFields);

    private static readonly HashSet<string> AcceptedInputParamInfoFields = BuildAcceptedNames(InputParamInfoFields);

    private static readonly HashSet<string> AcceptedOutputParamInfoFields = BuildAcceptedNames(OutputParamInfoFields);

    private const string AllowedVarTypeNames =
        "text, number, integer, boolean, list, dict, enum, dateTime, image, table, object, any";

    public static IList<SchemaIssue> Validate(JObject data)
    {
        var issues = new List<SchemaIssue>();
        if (data["steps"] is JArray steps)
        {
            ValidateSteps(steps, "steps", issues);
        }

        if (data["variables"] is JArray variables)
        {
            ValidateVariables(variables, issues);
        }

        return issues;
    }

    public static string FormatMessage(IList<SchemaIssue> issues)
    {
        var lines = new List<string>
        {
            $"data.json schema error(s) ({issues.Count}) — fix the listed fields and patch again:",
        };
        lines.AddRange(issues.Select(i => "- " + i));
        return string.Join("\n", lines);
    }

    private static void ValidateSteps(JArray steps, string path, IList<SchemaIssue> issues)
    {
        for (var i = 0; i < steps.Count; i++)
        {
            var stepPath = $"{path}[{i}]";
            if (steps[i] is not JObject step)
            {
                Add(issues, "STEP_NOT_OBJECT", stepPath, steps[i],
                    "Step entry must be a JSON object.");
                continue;
            }

            foreach (var prop in step.Properties())
            {
                if (!AcceptedStepFields.Contains(prop.Name))
                {
                    Add(issues, "UNKNOWN_STEP_FIELD", $"{stepPath}.{prop.Name}", prop,
                        $"Unknown step field \"{prop.Name}\".{SuggestText(prop.Name, StepFields)}");
                }
            }

            ValidateStepRunnerKey(step, stepPath, issues);
            ValidateStepFieldTypes(step, stepPath, issues);

            if (ReadField(step, "ifSteps") is JArray ifSteps)
            {
                ValidateSteps(ifSteps, $"{stepPath}.ifSteps", issues);
            }

            if (ReadField(step, "elseSteps") is JArray elseSteps)
            {
                ValidateSteps(elseSteps, $"{stepPath}.elseSteps", issues);
            }
        }
    }

    private static void ValidateStepRunnerKey(JObject step, string stepPath, IList<SchemaIssue> issues)
    {
        var token = ReadField(step, "stepRunnerKey");
        if (token is null)
        {
            Add(issues, "MISSING_STEP_RUNNER_KEY", stepPath, step,
                "Step requires \"stepRunnerKey\" (from step-runner search/get — do not guess).");
            return;
        }

        if (token.Type != JTokenType.String || string.IsNullOrWhiteSpace(token.Value<string>()))
        {
            Add(issues, "MISSING_STEP_RUNNER_KEY", $"{stepPath}.stepRunnerKey", token,
                "\"stepRunnerKey\" must be a non-empty string (from step-runner search/get).");
        }
    }

    private static void ValidateStepFieldTypes(JObject step, string stepPath, IList<SchemaIssue> issues)
    {
        RequireType(step, "inputParams", stepPath, issues, JTokenType.Object, "a JSON object");
        RequireType(step, "outputParams", stepPath, issues, JTokenType.Object, "a JSON object");
        RequireType(step, "ifSteps", stepPath, issues, JTokenType.Array, "a JSON array of steps");
        RequireType(step, "elseSteps", stepPath, issues, JTokenType.Array, "a JSON array of steps");
        RequireType(step, "note", stepPath, issues, JTokenType.String, "a string");
        RequireType(step, "stepId", stepPath, issues, JTokenType.String, "a string");
        RequireType(step, "disabled", stepPath, issues, JTokenType.Boolean, "true or false");
        RequireType(step, "collapsed", stepPath, issues, JTokenType.Boolean, "true or false");

        var delay = ReadField(step, "delayMs");
        if (delay is not null
            && delay.Type != JTokenType.Null
            && delay.Type != JTokenType.Integer
            && delay.Type != JTokenType.Float)
        {
            Add(issues, "INVALID_STEP_FIELD_TYPE", $"{stepPath}.delayMs", delay,
                "\"delayMs\" must be a number.");
        }

        if (ReadField(step, "outputParams") is JObject outputParams)
        {
            foreach (var prop in outputParams.Properties())
            {
                if (prop.Value.Type is JTokenType.Object or JTokenType.Array)
                {
                    Add(issues, "INVALID_OUTPUT_PARAM", $"{stepPath}.outputParams.{prop.Name}", prop,
                        "outputParams value must be a target variable key string.");
                }
            }
        }

        if (ReadField(step, "inputParams") is JObject inputParams)
        {
            foreach (var prop in inputParams.Properties())
            {
                var isBindSuffix =
                    prop.Name.EndsWith(".var", StringComparison.OrdinalIgnoreCase)
                    || prop.Name.EndsWith(".file", StringComparison.OrdinalIgnoreCase);
                if (isBindSuffix && prop.Value.Type != JTokenType.String)
                {
                    Add(issues, "INVALID_INPUT_PARAM_BIND", $"{stepPath}.inputParams.{prop.Name}", prop,
                        $"\"{prop.Name}\" must be a plain string (variable key or files/… path).");
                }
            }
        }
    }

    private static void ValidateVariables(JArray variables, IList<SchemaIssue> issues)
    {
        for (var i = 0; i < variables.Count; i++)
        {
            var varPath = $"variables[{i}]";
            if (variables[i] is not JObject varObj)
            {
                Add(issues, "VARIABLE_NOT_OBJECT", varPath, variables[i],
                    "Variable entry must be a JSON object.");
                continue;
            }

            foreach (var prop in varObj.Properties())
            {
                if (!AcceptedVariableFields.Contains(prop.Name))
                {
                    Add(issues, "UNKNOWN_VARIABLE_FIELD", $"{varPath}.{prop.Name}", prop,
                        $"Unknown variable field \"{prop.Name}\".{SuggestText(prop.Name, VariableFields)}");
                }
            }

            var keyToken = ReadField(varObj, "key");
            if (keyToken is null
                || keyToken.Type != JTokenType.String
                || string.IsNullOrWhiteSpace(keyToken.Value<string>()))
            {
                Add(issues, "MISSING_VARIABLE_KEY", varPath, varObj,
                    "Variable requires a non-empty \"key\" string.");
            }

            var varTypeToken = ReadField(varObj, "varType") ?? ReadField(varObj, "type");
            if (varTypeToken is not null
                && varTypeToken.Type != JTokenType.Null
                && !VarTypeCodec.TryParse(varTypeToken, out _))
            {
                Add(issues, "INVALID_VAR_TYPE", $"{varPath}.varType", varTypeToken,
                    $"Unknown varType \"{varTypeToken}\". Allowed: {AllowedVarTypeNames} (omit for text).");
            }

            RequireType(varObj, "isLocked", varPath, issues, JTokenType.Boolean, "true or false");
            RequireType(varObj, "saveState", varPath, issues, JTokenType.Boolean, "true or false");
            RequireType(varObj, "isInput", varPath, issues, JTokenType.Boolean, "true or false");
            RequireType(varObj, "isOutput", varPath, issues, JTokenType.Boolean, "true or false");
            RequireType(varObj, "desc", varPath, issues, JTokenType.String, "a string");
            RequireType(varObj, "paramName", varPath, issues, JTokenType.String, "a string");
            RequireType(varObj, "group", varPath, issues, JTokenType.String, "a string");
            RequireType(varObj, "customType", varPath, issues, JTokenType.String, "a string");
            RequireType(varObj, "inputParamInfo", varPath, issues, JTokenType.Object, "a JSON object");
            RequireType(varObj, "outputParamInfo", varPath, issues, JTokenType.Object, "a JSON object");
            RequireType(varObj, "tableDef", varPath, issues, JTokenType.Object, "a JSON object");

            if (ReadField(varObj, "inputParamInfo") is JObject inputInfo)
            {
                ValidateInputParamInfo(inputInfo, $"{varPath}.inputParamInfo", issues);
            }

            if (ReadField(varObj, "outputParamInfo") is JObject outputInfo)
            {
                ValidateOutputParamInfo(outputInfo, $"{varPath}.outputParamInfo", issues);
            }
        }
    }

    private static void ValidateInputParamInfo(JObject info, string path, IList<SchemaIssue> issues)
    {
        foreach (var prop in info.Properties())
        {
            if (!AcceptedInputParamInfoFields.Contains(prop.Name))
            {
                Add(issues, "UNKNOWN_INPUT_PARAM_INFO_FIELD", $"{path}.{prop.Name}", prop,
                    $"Unknown inputParamInfo field \"{prop.Name}\".{SuggestText(prop.Name, InputParamInfoFields)}");
            }
        }

        RequireType(info, "selectionItems", path, issues, JTokenType.String, "a string");
        RequireType(info, "validationPattern", path, issues, JTokenType.String, "a string");
        RequireType(info, "textTools", path, issues, JTokenType.String, "a string");
        RequireType(info, "visibleExpression", path, issues, JTokenType.String, "a string");
        RequireType(info, "onlyUseSelect", path, issues, JTokenType.Boolean, "true or false");
        RequireType(info, "isRequired", path, issues, JTokenType.Boolean, "true or false");
        RequireType(info, "isAdvanced", path, issues, JTokenType.Boolean, "true or false");
        RequireType(info, "allowInput", path, issues, JTokenType.Boolean, "true or false");
        RequireType(info, "multiLine", path, issues, JTokenType.Boolean, "true or false");
        RequireType(info, "skipEval", path, issues, JTokenType.Boolean, "true or false");
        RequireNumber(info, "inputMethod", path, issues);
        RequireNumber(info, "variableMode", path, issues);
        RequireNumber(info, "replaceMode", path, issues);
    }

    private static void ValidateOutputParamInfo(JObject info, string path, IList<SchemaIssue> issues)
    {
        foreach (var prop in info.Properties())
        {
            if (!AcceptedOutputParamInfoFields.Contains(prop.Name))
            {
                Add(issues, "UNKNOWN_OUTPUT_PARAM_INFO_FIELD", $"{path}.{prop.Name}", prop,
                    $"Unknown outputParamInfo field \"{prop.Name}\".{SuggestText(prop.Name, OutputParamInfoFields)}");
            }
        }

        RequireType(info, "visibleExpression", path, issues, JTokenType.String, "a string");
    }

    private static void RequireNumber(JObject obj, string canonicalField, string parentPath, IList<SchemaIssue> issues)
    {
        var token = ReadField(obj, canonicalField);
        if (token is null
            || token.Type is JTokenType.Null or JTokenType.Integer or JTokenType.Float)
        {
            return;
        }

        Add(issues, "INVALID_FIELD_TYPE", $"{parentPath}.{canonicalField}", token,
            $"\"{canonicalField}\" must be a number.");
    }

    private static void RequireType(
        JObject obj,
        string canonicalField,
        string parentPath,
        IList<SchemaIssue> issues,
        JTokenType expected,
        string expectedText)
    {
        var token = ReadField(obj, canonicalField);
        if (token is null || token.Type == JTokenType.Null || token.Type == expected)
        {
            return;
        }

        Add(issues, "INVALID_FIELD_TYPE", $"{parentPath}.{canonicalField}", token,
            $"\"{canonicalField}\" must be {expectedText}.");
    }

    /// <summary>Reads camelCase or PascalCase spelling of a canonical field.</summary>
    private static JToken? ReadField(JObject obj, string canonicalField) =>
        obj[canonicalField] ?? obj[ToPascalCase(canonicalField)];

    private static HashSet<string> BuildAcceptedNames(IEnumerable<string> canonicalFields)
    {
        var set = new HashSet<string>(StringComparer.Ordinal);
        foreach (var field in canonicalFields)
        {
            set.Add(field);
            set.Add(ToPascalCase(field));
        }

        return set;
    }

    private static string ToPascalCase(string camel) =>
        camel.Length == 0 ? camel : char.ToUpperInvariant(camel[0]) + camel.Substring(1);

    private static string SuggestText(string unknownField, string[] canonicalFields)
    {
        var suggestions = Suggest(unknownField, canonicalFields);
        if (suggestions.Count == 0)
        {
            return " The field will be ignored on save — remove it or use a documented field (see action-data-schema).";
        }

        var quoted = string.Join(" or ", suggestions.Select(s => $"\"{s}\""));
        return $" Did you mean {quoted}?";
    }

    private static IReadOnlyList<string> Suggest(string unknownField, string[] canonicalFields)
    {
        var normalizedUnknown = NormalizeForMatch(unknownField);

        // Exact match ignoring case / separators (e.g. step_runner_key, STEPRUNNERKEY).
        var relaxed = canonicalFields
            .Where(f => NormalizeForMatch(f) == normalizedUnknown)
            .ToList();
        if (relaxed.Count > 0)
        {
            return relaxed;
        }

        var ranked = canonicalFields
            .Select(f => (Field: f, Distance: Levenshtein(normalizedUnknown, NormalizeForMatch(f))))
            .Where(x => x.Distance <= MaxDistance(normalizedUnknown.Length))
            .OrderBy(x => x.Distance)
            .Select(x => x.Field)
            .Take(2)
            .ToList();
        if (ranked.Count > 0)
        {
            return ranked;
        }

        // Containment heuristic: "runnerKey" -> stepRunnerKey.
        return canonicalFields
            .Where(f =>
                normalizedUnknown.Length >= 4
                && (NormalizeForMatch(f).Contains(normalizedUnknown)
                    || normalizedUnknown.Contains(NormalizeForMatch(f))))
            .Take(2)
            .ToList();
    }

    private static int MaxDistance(int length) => length >= 8 ? 3 : 2;

    private static string NormalizeForMatch(string name) =>
        new(name.Where(c => c != '_' && c != '-' && c != '.').Select(char.ToLowerInvariant).ToArray());

    private static int Levenshtein(string a, string b)
    {
        if (a.Length == 0)
        {
            return b.Length;
        }

        if (b.Length == 0)
        {
            return a.Length;
        }

        var prev = new int[b.Length + 1];
        var curr = new int[b.Length + 1];
        for (var j = 0; j <= b.Length; j++)
        {
            prev[j] = j;
        }

        for (var i = 1; i <= a.Length; i++)
        {
            curr[0] = i;
            for (var j = 1; j <= b.Length; j++)
            {
                var cost = a[i - 1] == b[j - 1] ? 0 : 1;
                curr[j] = Math.Min(Math.Min(curr[j - 1] + 1, prev[j] + 1), prev[j - 1] + cost);
            }

            (prev, curr) = (curr, prev);
        }

        return prev[b.Length];
    }

    private static void Add(
        IList<SchemaIssue> issues,
        string code,
        string path,
        JToken? positionToken,
        string message)
    {
        int? line = null;
        if (positionToken is IJsonLineInfo info && info.HasLineInfo())
        {
            line = info.LineNumber;
        }

        issues.Add(new SchemaIssue
        {
            Code = code,
            Path = path,
            Line = line,
            Message = message,
        });
    }
}
