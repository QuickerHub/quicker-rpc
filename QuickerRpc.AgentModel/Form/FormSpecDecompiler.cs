using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using QuickerRpc.AgentModel.Core;

namespace QuickerRpc.AgentModel.Form;

/// <summary>Decompiles Quicker native sys:form JSON into <c>qkrpc.form.v1</c>.</summary>
public static class FormSpecDecompiler
{
    private static readonly Regex VisibleEqPattern = new(
        @"^([A-Za-z_][A-Za-z0-9_]{0,63})=='((?:\\'|[^'])*)'$",
        RegexOptions.CultureInvariant | RegexOptions.Compiled);

    private static readonly Regex VisibleNePattern = new(
        @"^([A-Za-z_][A-Za-z0-9_]{0,63})!='((?:\\'|[^'])*)'$",
        RegexOptions.CultureInvariant | RegexOptions.Compiled);

    public sealed class DecompileContext
    {
        public string Mode { get; set; } = "variables";

        public string Title { get; set; } = "填写表单";

        public string? DictVar { get; set; }

        public FormSpecStepOptions? StepOptions { get; set; }
    }

    public sealed class DecompileResult
    {
        public bool Success { get; set; }

        public string? ErrorMessage { get; set; }

        public FormSpecDocument? Spec { get; set; }

        public string? SpecJson { get; set; }

        public IReadOnlyList<string> Warnings { get; set; } = Array.Empty<string>();
    }

    public static bool LooksLikeNativeFormDef(string? json)
    {
        if (string.IsNullOrWhiteSpace(json))
        {
            return false;
        }

        if (FormSpecDocumentShape.LooksLikeFormSpecText(json))
        {
            return false;
        }

        try
        {
            var root = JObject.Parse(json);
            return NativeFormJson.LooksLikeNativeRoot(root);
        }
        catch
        {
            return false;
        }
    }

    public static DecompileResult TryDecompile(string nativeJson, DecompileContext context)
    {
        if (!LooksLikeNativeFormDef(nativeJson))
        {
            return Fail("Input is not native Quicker formDef JSON.");
        }

        try
        {
            var root = JObject.Parse(nativeJson);
            var warnings = new List<string>();
            var fields = new List<FormSpecField>();

            if (NativeFormJson.TryGetFieldsArray(root, out var nativeFields) && nativeFields is not null)
            {
                for (var i = 0; i < nativeFields.Count; i++)
                {
                    if (nativeFields[i] is not JObject nativeField)
                    {
                        continue;
                    }

                    var field = DecompileField(nativeField, i, warnings);
                    if (field is not null)
                    {
                        fields.Add(field);
                    }
                }
            }

            if (fields.Count == 0)
            {
                return Fail("Native formDef has no fields.");
            }

            var spec = new FormSpecDocument
            {
                Schema = FormSpecDocument.SchemaId,
                Mode = string.IsNullOrWhiteSpace(context.Mode) ? "variables" : context.Mode.Trim(),
                Title = string.IsNullOrWhiteSpace(context.Title) ? "填写表单" : context.Title.Trim(),
                DictVar = context.DictVar?.Trim(),
                Fields = fields,
                Options = context.StepOptions,
            };

            var specJson = Serialize(spec);
            return new DecompileResult
            {
                Success = true,
                Spec = spec,
                SpecJson = specJson,
                Warnings = warnings,
            };
        }
        catch (Exception ex)
        {
            return Fail(ex.Message);
        }
    }

    public static string Serialize(FormSpecDocument spec)
    {
        spec.Schema = FormSpecDocument.SchemaId;
        return JsonConvert.SerializeObject(spec, FormSpecJson.ReadWriteSettings);
    }

    /// <summary>
    /// Re-serializes <c>qkrpc.form.v1</c> text so CJK is written literally (not <c>\uXXXX</c>).
    /// Returns the original text when it is not a form spec or cannot be parsed.
    /// </summary>
    public static string NormalizeFormSpecFileContent(string text)
    {
        if (!FormSpecDocumentShape.LooksLikeFormSpecText(text))
        {
            return text;
        }

        var parse = FormSpecCompiler.TryParse(text);
        if (!parse.Success || parse.Spec is null)
        {
            return text;
        }

        return Serialize(parse.Spec);
    }

    public static string NormalizeToSpecFileContent(string value, DecompileContext context, IList<string> warnings)
    {
        if (FormSpecDocumentShape.LooksLikeFormSpecText(value))
        {
            var parse = FormSpecCompiler.TryParse(value);
            if (parse.Success && parse.Spec is not null)
            {
                return Serialize(parse.Spec);
            }
        }

        var decompile = TryDecompile(value, context);
        if (!decompile.Success)
        {
            throw new InvalidOperationException(decompile.ErrorMessage ?? "form decompile failed.");
        }

        foreach (var w in decompile.Warnings)
        {
            warnings.Add(w);
        }
        return decompile.SpecJson!;
    }

    public static DecompileContext ReadContextFromStep(JObject step)
    {
        var ctx = new DecompileContext();
        if (step["inputParams"] is not JObject inputParams)
        {
            return ctx;
        }

        ctx.Mode = ReadLiteral(inputParams, "operation") ?? "variables";
        ctx.Title = ReadLiteral(inputParams, "title") ?? ctx.Title;
        ctx.DictVar = ReadVarKey(inputParams, "dictVar");
        ctx.StepOptions = ReadStepOptions(inputParams);
        return ctx;
    }

    private static FormSpecField? DecompileField(JObject native, int index, List<string> warnings)
    {
        var fieldKey = ReadString(native, "FieldKey", "fieldKey");
        if (string.IsNullOrWhiteSpace(fieldKey))
        {
            warnings.Add($"fields[{index}]: missing FieldKey, skipped.");
            return null;
        }

        var label = ReadString(native, "Label", "label") ?? fieldKey;
        var inputMethod = NativeFormJson.InputMethodNameFromToken(native["InputMethod"] ?? native["inputMethod"]);
        var isMultiline = ReadBool(native, "IsMultiline", "isMultiline", "MultiLine", "multiLine");
        var type = MapNativeType(inputMethod, isMultiline);

        var agentKey = ToAgentFieldKey(fieldKey);
        var field = new FormSpecField
        {
            Key = agentKey,
            Label = label,
            Type = type,
            Required = ReadBool(native, "IsRequired", "isRequired"),
            Help = ReadString(native, "HelpText", "helpText"),
            Group = ReadString(native, "Group", "group"),
            OnlyDate = ReadBool(native, "OnlyDate", "onlyDate"),
            Pattern = ReadString(native, "Pattern", "pattern"),
        };

        if (!string.Equals(agentKey, fieldKey, StringComparison.Ordinal))
        {
            field.Target = fieldKey;
        }

        var min = ReadString(native, "MinValue", "minValue");
        var max = ReadString(native, "MaxValue", "maxValue");
        if (double.TryParse(min, NumberStyles.Float, CultureInfo.InvariantCulture, out var minN))
        {
            field.Min = minN;
        }

        if (double.TryParse(max, NumberStyles.Float, CultureInfo.InvariantCulture, out var maxN))
        {
            field.Max = maxN;
        }

        var selection = ReadString(native, "SelectionItems", "selectionItems");
        if (!string.IsNullOrWhiteSpace(selection))
        {
            field.Options = ParseSelectionItems(selection);
        }

        var visible = ReadString(native, "VisibleExpression", "visibleExpression");
        if (!string.IsNullOrWhiteSpace(visible))
        {
            var when = ParseVisibleExpression(visible, index, warnings);
            if (when is not null)
            {
                field.VisibleWhen = when;
            }
        }

        var defaultValue = native["DefaultValue"] ?? native["defaultValue"];
        if (defaultValue is not null && defaultValue.Type != JTokenType.Null)
        {
            field.Default = defaultValue.Type switch
            {
                JTokenType.Boolean => defaultValue.Value<bool>() ? "true" : "false",
                JTokenType.Integer or JTokenType.Float => JTokenCompat.Compact(defaultValue),
                _ => defaultValue.Value<string>() ?? JTokenCompat.Compact(defaultValue),
            };
        }

        return field;
    }

    private static string ToAgentFieldKey(string fieldKey)
    {
        if (Regex.IsMatch(fieldKey, @"^[A-Za-z_][A-Za-z0-9_]{0,63}$"))
        {
            return fieldKey;
        }

        var chars = fieldKey.Where(c => char.IsLetterOrDigit(c) || c is '_').ToArray();
        var sanitized = new string(chars);
        if (sanitized.Length == 0 || char.IsDigit(sanitized[0]))
        {
            sanitized = "f_" + sanitized;
        }

        return sanitized.Length > 64 ? sanitized.Substring(0, 64) : sanitized;
    }

    private static string MapNativeType(string inputMethod, bool isMultiline)
    {
        var m = inputMethod.Trim();
        if (string.Equals(m, "TextEditor", StringComparison.OrdinalIgnoreCase)
            || (string.Equals(m, "TextBox", StringComparison.OrdinalIgnoreCase) && isMultiline))
        {
            return "textarea";
        }

        if (string.Equals(m, "NumberBox", StringComparison.OrdinalIgnoreCase))
        {
            return "number";
        }

        if (string.Equals(m, "CheckBox", StringComparison.OrdinalIgnoreCase))
        {
            return "boolean";
        }

        if (string.Equals(m, "DropDown", StringComparison.OrdinalIgnoreCase))
        {
            return "select";
        }

        if (string.Equals(m, "DatePicker", StringComparison.OrdinalIgnoreCase))
        {
            return "dateTime";
        }

        if (string.Equals(m, "PasswordBox", StringComparison.OrdinalIgnoreCase))
        {
            return "password";
        }

        return "text";
    }

    private static IList<FormSpecSelectOption> ParseSelectionItems(string raw)
    {
        var normalized = raw.Replace("`n", "\n");
        var lines = normalized.Split('\n');
        var options = new List<FormSpecSelectOption>();
        foreach (var line in lines)
        {
            var trimmed = line.Trim();
            if (trimmed.Length == 0)
            {
                continue;
            }

            var pipe = trimmed.IndexOf('|');
            if (pipe < 0)
            {
                options.Add(new FormSpecSelectOption { Value = trimmed, Label = trimmed });
                continue;
            }

            options.Add(new FormSpecSelectOption
            {
                Value = trimmed.Substring(0, pipe).Trim(),
                Label = trimmed.Substring(pipe + 1).Trim(),
            });
        }

        return options;
    }

    private static FormSpecVisibleWhen? ParseVisibleExpression(
        string expression,
        int fieldIndex,
        List<string> warnings)
    {
        var eq = VisibleEqPattern.Match(expression);
        if (eq.Success)
        {
            return new FormSpecVisibleWhen
            {
                Field = eq.Groups[1].Value,
                Eq = UnescapeLiteral(eq.Groups[2].Value),
            };
        }

        var ne = VisibleNePattern.Match(expression);
        if (ne.Success)
        {
            return new FormSpecVisibleWhen
            {
                Field = ne.Groups[1].Value,
                Ne = UnescapeLiteral(ne.Groups[2].Value),
            };
        }

        warnings.Add($"fields[{fieldIndex}].visibleWhen: unsupported VisibleExpression, omitted.");
        return null;
    }

    private static string UnescapeLiteral(string value) =>
        value.Replace("\\'", "'");

    private static FormSpecStepOptions? ReadStepOptions(JObject inputParams)
    {
        var options = new FormSpecStepOptions();
        var any = false;

        any |= TryAssignStringOption(inputParams, "help", v => options.Help = v);
        any |= TryAssignStringOption(inputParams, "markdownhelp", v => options.MarkdownHelp = v);
        any |= TryAssignIntOption(inputParams, "windowWidth", v => options.WindowWidth = v);
        any |= TryAssignIntOption(inputParams, "windowHeight", v => options.WindowHeight = v);
        any |= TryAssignIntOption(inputParams, "titleColumnWidth", v => options.TitleColumnWidth = v);
        any |= TryAssignIntOption(inputParams, "defaultInputWidth", v => options.DefaultInputWidth = v);
        any |= TryAssignBoolOption(inputParams, "restoreFocus", v => options.RestoreFocus = v);
        any |= TryAssignBoolOption(inputParams, "topMost", v => options.TopMost = v);
        any |= TryAssignBoolOption(inputParams, "stopIfFail", v => options.StopIfFail = v);

        return any ? options : null;
    }

    private static bool TryAssignStringOption(JObject inputParams, string key, Action<string> assign)
    {
        var v = ReadLiteral(inputParams, key);
        if (string.IsNullOrWhiteSpace(v))
        {
            return false;
        }

        assign(v);
        return true;
    }

    private static bool TryAssignIntOption(JObject inputParams, string key, Action<int> assign)
    {
        var v = ReadLiteral(inputParams, key);
        if (!int.TryParse(v, NumberStyles.Integer, CultureInfo.InvariantCulture, out var n))
        {
            return false;
        }

        assign(n);
        return true;
    }

    private static bool TryAssignBoolOption(JObject inputParams, string key, Action<bool> assign)
    {
        var v = ReadLiteral(inputParams, key);
        if (!bool.TryParse(v, out var b))
        {
            return false;
        }

        assign(b);
        return true;
    }

    private static string? ReadLiteral(JObject inputParams, string key)
    {
        if (inputParams[key] is not JObject obj)
        {
            return null;
        }

        return obj.Value<string>("value")?.Trim();
    }

    private static string? ReadVarKey(JObject inputParams, string key)
    {
        if (inputParams[key] is not JObject obj)
        {
            return null;
        }

        return obj.Value<string>("varKey")?.Trim();
    }

    private static string? ReadString(JObject obj, params string[] names)
    {
        foreach (var name in names)
        {
            var token = obj[name];
            if (token is null || token.Type == JTokenType.Null)
            {
                continue;
            }

            return token.Type == JTokenType.String
                ? token.Value<string>()?.Trim()
                : JTokenCompat.Compact(token);
        }

        return null;
    }

    private static bool ReadBool(JObject obj, params string[] names)
    {
        foreach (var name in names)
        {
            var token = obj[name];
            if (token is null || token.Type == JTokenType.Null)
            {
                continue;
            }

            return token.Type switch
            {
                JTokenType.Boolean => token.Value<bool>(),
                JTokenType.String => bool.TryParse(token.Value<string>(), out var b) && b,
                JTokenType.Integer => token.Value<int>() != 0,
                _ => false,
            };
        }

        return false;
    }

    private static DecompileResult Fail(string message) =>
        new() { Success = false, ErrorMessage = message };
}
