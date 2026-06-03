using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Text;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

namespace QuickerRpc.AgentModel.Form;

/// <summary>Compiles qkrpc.form.v1 into Quicker sys:form native JSON and step inputParams.</summary>
public static class FormSpecCompiler
{
    private static readonly Newtonsoft.Json.JsonSerializer NativeFieldSerializer =
        Newtonsoft.Json.JsonSerializer.Create(new JsonSerializerSettings
        {
            NullValueHandling = NullValueHandling.Ignore,
            DefaultValueHandling = DefaultValueHandling.Ignore,
        });

    public static FormSpecParseResult TryParse(string json)
    {
        if (string.IsNullOrWhiteSpace(json))
        {
            return FormSpecParseResult.Fail("EMPTY_JSON", "Form spec JSON is empty.");
        }

        try
        {
            var spec = JsonConvert.DeserializeObject<FormSpecDocument>(json, FormSpecJson.ReadWriteSettings);
            if (spec is null)
            {
                return FormSpecParseResult.Fail("INVALID_JSON", "Form spec JSON must be an object.");
            }

            return FormSpecParseResult.Ok(spec);
        }
        catch (JsonException ex)
        {
            return FormSpecParseResult.Fail("INVALID_JSON", ex.Message);
        }
    }

    /// <summary>Parse form spec from a JSON string or embedded object token.</summary>
    public static FormSpecParseResult TryParse(JToken? token)
    {
        if (token is null || token.Type == JTokenType.Null)
        {
            return FormSpecParseResult.Fail("EMPTY_JSON", "Form spec JSON is empty.");
        }

        if (token.Type == JTokenType.String)
        {
            return TryParse(token.Value<string>() ?? string.Empty);
        }

        if (token is JObject)
        {
            return TryParse(token.ToString(Formatting.None));
        }

        return FormSpecParseResult.Fail(
            "INVALID_JSON",
            "Form spec must be a JSON object or a JSON string.");
    }

    public static FormSpecBuildResult Build(FormSpecDocument spec)
    {
        var validation = FormSpecValidator.Validate(spec);
        if (!validation.Success)
        {
            return new FormSpecBuildResult
            {
                Success = false,
                Issues = validation.Issues,
            };
        }

        var mode = spec.Mode.Trim();
        var formParamKey = string.Equals(mode, "dict_dynamic", StringComparison.OrdinalIgnoreCase)
            ? "dynamicFormForDictDef"
            : "formDef";

        var nativeFields = spec.Fields.Select(CompileNativeField).ToList();
        var nativeRoot = new JObject
        {
            ["fields"] = new JArray(nativeFields.Select(f => JObject.FromObject(f, NativeFieldSerializer))),
        };
        var nativeFormJson = nativeRoot.ToString(Formatting.None);

        var inputParams = new JObject
        {
            ["operation"] = new JObject { ["value"] = mode },
            ["title"] = new JObject { ["value"] = spec.Title.Trim() },
            [formParamKey] = new JObject { ["value"] = nativeFormJson },
        };

        if (string.Equals(mode, "dict_dynamic", StringComparison.OrdinalIgnoreCase))
        {
            inputParams["dictVar"] = new JObject { ["varKey"] = spec.DictVar!.Trim() };
        }

        ApplyStepOptions(inputParams, spec.Options);

        var step = new JObject
        {
            ["stepRunnerKey"] = "sys:form",
            ["inputParams"] = inputParams,
        };

        return new FormSpecBuildResult
        {
            Success = true,
            Mode = mode,
            FormParamKey = formParamKey,
            NativeFormJson = nativeFormJson,
            StepJson = step.ToString(Formatting.None),
        };
    }

    public static FormSpecBuildResult BuildFromJson(string json)
    {
        var parse = TryParse(json);
        if (!parse.Success)
        {
            return new FormSpecBuildResult
            {
                Success = false,
                Issues = new List<FormSpecIssue>
                {
                    new() { Path = "", Message = parse.ErrorMessage ?? "Invalid JSON." },
                },
            };
        }

        return Build(parse.Spec!);
    }

    public static FormSpecBuildResult BuildFromToken(JToken? token)
    {
        var parse = TryParse(token);
        if (!parse.Success)
        {
            return new FormSpecBuildResult
            {
                Success = false,
                Issues = new List<FormSpecIssue>
                {
                    new() { Path = "", Message = parse.ErrorMessage ?? "Invalid form spec." },
                },
            };
        }

        return Build(parse.Spec!);
    }

    private static NativeFormField CompileNativeField(FormSpecField field)
    {
        var target = (field.Target ?? field.Key).Trim();
        var native = new NativeFormField
        {
            FieldKey = target,
            Label = field.Label.Trim(),
            InputMethod = MapInputMethod(field.Type),
        };

        if (!string.IsNullOrWhiteSpace(field.Help))
        {
            native.HelpText = field.Help.Trim();
        }

        if (!string.IsNullOrWhiteSpace(field.Group))
        {
            native.Group = field.Group.Trim();
        }

        if (field.Required)
        {
            native.IsRequired = true;
        }

        if (field.OnlyDate)
        {
            native.OnlyDate = true;
        }

        if (field.Min is not null)
        {
            native.MinValue = FormatNumber(field.Min.Value);
        }

        if (field.Max is not null)
        {
            native.MaxValue = FormatNumber(field.Max.Value);
        }

        if (!string.IsNullOrWhiteSpace(field.Pattern))
        {
            native.Pattern = field.Pattern;
        }

        if (field.Options is { Count: > 0 })
        {
            native.SelectionItems = CompileSelectionItems(field.Options);
        }

        if (field.VisibleWhen is not null)
        {
            native.VisibleExpression = CompileVisibleExpression(field.VisibleWhen);
        }

        if (field.Default is not null)
        {
            native.DefaultValue = CompileDefaultValue(field);
        }

        return native;
    }

    private static object? CompileDefaultValue(FormSpecField field)
    {
        var def = field.Default ?? string.Empty;
        if (string.Equals(field.Type, "boolean", StringComparison.OrdinalIgnoreCase))
        {
            return bool.TryParse(def, out var b) ? b : def;
        }

        return def;
    }

    private static string CompileSelectionItems(IList<FormSpecSelectOption> options)
    {
        var sb = new StringBuilder();
        for (var i = 0; i < options.Count; i++)
        {
            if (i > 0)
            {
                sb.Append('\n');
            }

            var value = (options[i].Value ?? string.Empty).Trim();
            var label = (options[i].Label ?? string.Empty).Trim();
            sb.Append(value).Append('|').Append(label);
        }

        return sb.ToString();
    }

    private static string CompileVisibleExpression(FormSpecVisibleWhen visibleWhen)
    {
        var field = visibleWhen.Field.Trim();
        if (!string.IsNullOrWhiteSpace(visibleWhen.Eq))
        {
            return field + "=='" + EscapeExpressionLiteral(visibleWhen.Eq.Trim()) + "'";
        }

        return field + "!='" + EscapeExpressionLiteral(visibleWhen.Ne!.Trim()) + "'";
    }

    private static string EscapeExpressionLiteral(string value) =>
        value.Replace("'", "\\'");

    private static string MapInputMethod(string type)
    {
        var t = (type ?? string.Empty).Trim();
        if (string.Equals(t, "textarea", StringComparison.OrdinalIgnoreCase))
        {
            return "TextEditor";
        }

        if (string.Equals(t, "number", StringComparison.OrdinalIgnoreCase)
            || string.Equals(t, "integer", StringComparison.OrdinalIgnoreCase))
        {
            return "NumberBox";
        }

        if (string.Equals(t, "boolean", StringComparison.OrdinalIgnoreCase))
        {
            return "CheckBox";
        }

        if (string.Equals(t, "select", StringComparison.OrdinalIgnoreCase))
        {
            return "DropDown";
        }

        if (string.Equals(t, "dateTime", StringComparison.OrdinalIgnoreCase))
        {
            return "DatePicker";
        }

        if (string.Equals(t, "password", StringComparison.OrdinalIgnoreCase))
        {
            return "PasswordBox";
        }

        return "TextBox";
    }

    private static string FormatNumber(double value) =>
        value.ToString(CultureInfo.InvariantCulture);

    private static void ApplyStepOptions(JObject inputParams, FormSpecStepOptions? options)
    {
        if (options is null)
        {
            return;
        }

        SetLiteral(inputParams, "help", options.Help);
        SetLiteral(inputParams, "markdownhelp", options.MarkdownHelp);
        SetLiteral(inputParams, "windowWidth", options.WindowWidth);
        SetLiteral(inputParams, "windowHeight", options.WindowHeight);
        SetLiteral(inputParams, "titleColumnWidth", options.TitleColumnWidth);
        SetLiteral(inputParams, "defaultInputWidth", options.DefaultInputWidth);
        SetLiteral(inputParams, "restoreFocus", options.RestoreFocus);
        SetLiteral(inputParams, "topMost", options.TopMost);
        SetLiteral(inputParams, "stopIfFail", options.StopIfFail);
    }

    private static void SetLiteral(JObject inputParams, string key, string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return;
        }

        inputParams[key] = new JObject { ["value"] = value.Trim() };
    }

    private static void SetLiteral(JObject inputParams, string key, int? value)
    {
        if (value is null)
        {
            return;
        }

        inputParams[key] = new JObject
        {
            ["value"] = value.Value.ToString(CultureInfo.InvariantCulture),
        };
    }

    private static void SetLiteral(JObject inputParams, string key, bool? value)
    {
        if (value is null)
        {
            return;
        }

        inputParams[key] = new JObject
        {
            ["value"] = value.Value ? "true" : "false",
        };
    }

    private sealed class NativeFormField
    {
        public string FieldKey { get; set; } = string.Empty;

        public string Label { get; set; } = string.Empty;

        public string InputMethod { get; set; } = string.Empty;

        public string? HelpText { get; set; }

        public string? Group { get; set; }

        public bool IsRequired { get; set; }

        public bool OnlyDate { get; set; }

        public string? MinValue { get; set; }

        public string? MaxValue { get; set; }

        public string? Pattern { get; set; }

        public string? SelectionItems { get; set; }

        public string? VisibleExpression { get; set; }

        public object? DefaultValue { get; set; }
    }
}

public sealed class FormSpecParseResult
{
    public bool Success { get; set; }

    public string? ErrorCode { get; set; }

    public string? ErrorMessage { get; set; }

    public FormSpecDocument? Spec { get; set; }

    public static FormSpecParseResult Ok(FormSpecDocument spec) =>
        new() { Success = true, Spec = spec };

    public static FormSpecParseResult Fail(string code, string message) =>
        new() { Success = false, ErrorCode = code, ErrorMessage = message };
}
