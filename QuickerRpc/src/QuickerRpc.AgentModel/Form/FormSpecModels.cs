using System.Collections.Generic;
using System.Text.Json.Serialization;
using Newtonsoft.Json;

namespace QuickerRpc.AgentModel.Form;

/// <summary>Agent-facing multi-field form definition (qkrpc.form.v1).</summary>
public sealed class FormSpecDocument
{
    public const string SchemaId = "qkrpc.form.v1";

    [JsonPropertyName("$schema")]
    [JsonProperty("$schema")]
    public string? Schema { get; set; }

    [JsonPropertyName("mode")]
    public string Mode { get; set; } = "variables";

    [JsonPropertyName("title")]
    public string Title { get; set; } = "填写表单";

    /// <summary>Dict variable key; required when <see cref="Mode"/> is dict_dynamic.</summary>
    [JsonPropertyName("dictVar")]
    public string? DictVar { get; set; }

    [JsonPropertyName("fields")]
    public IList<FormSpecField> Fields { get; set; } = new List<FormSpecField>();

    [JsonPropertyName("options")]
    public FormSpecStepOptions? Options { get; set; }
}

public sealed class FormSpecField
{
    [JsonPropertyName("key")]
    public string Key { get; set; } = string.Empty;

    [JsonPropertyName("label")]
    public string Label { get; set; } = string.Empty;

    [JsonPropertyName("type")]
    public string Type { get; set; } = "text";

    /// <summary>Variable or dict entry key; defaults to <see cref="Key"/>.</summary>
    [JsonPropertyName("target")]
    public string? Target { get; set; }

    [JsonPropertyName("required")]
    public bool Required { get; set; }

    [JsonPropertyName("default")]
    [JsonProperty("default")]
    public string? Default { get; set; }

    [JsonPropertyName("help")]
    public string? Help { get; set; }

    [JsonPropertyName("group")]
    public string? Group { get; set; }

    [JsonPropertyName("min")]
    public double? Min { get; set; }

    [JsonPropertyName("max")]
    public double? Max { get; set; }

    [JsonPropertyName("pattern")]
    public string? Pattern { get; set; }

    [JsonPropertyName("onlyDate")]
    public bool OnlyDate { get; set; }

    [JsonPropertyName("options")]
    public IList<FormSpecSelectOption>? Options { get; set; }

    [JsonPropertyName("visibleWhen")]
    public FormSpecVisibleWhen? VisibleWhen { get; set; }
}

public sealed class FormSpecSelectOption
{
    [JsonPropertyName("value")]
    public string Value { get; set; } = string.Empty;

    [JsonPropertyName("label")]
    public string Label { get; set; } = string.Empty;
}

public sealed class FormSpecVisibleWhen
{
    [JsonPropertyName("field")]
    public string Field { get; set; } = string.Empty;

    [JsonPropertyName("eq")]
    public string? Eq { get; set; }

    [JsonPropertyName("ne")]
    public string? Ne { get; set; }
}

public sealed class FormSpecStepOptions
{
    [JsonPropertyName("help")]
    public string? Help { get; set; }

    [JsonPropertyName("markdownHelp")]
    public string? MarkdownHelp { get; set; }

    [JsonPropertyName("windowWidth")]
    public int? WindowWidth { get; set; }

    [JsonPropertyName("windowHeight")]
    public int? WindowHeight { get; set; }

    [JsonPropertyName("titleColumnWidth")]
    public int? TitleColumnWidth { get; set; }

    [JsonPropertyName("defaultInputWidth")]
    public int? DefaultInputWidth { get; set; }

    [JsonPropertyName("restoreFocus")]
    public bool? RestoreFocus { get; set; }

    [JsonPropertyName("topMost")]
    public bool? TopMost { get; set; }

    [JsonPropertyName("stopIfFail")]
    public bool? StopIfFail { get; set; }
}

public sealed class FormSpecIssue
{
    public string Path { get; set; } = string.Empty;

    public string Message { get; set; } = string.Empty;
}

public sealed class FormSpecValidationResult
{
    public bool Success { get; set; }

    public IList<FormSpecIssue> Issues { get; set; } = new List<FormSpecIssue>();
}

public sealed class FormSpecBuildResult
{
    public bool Success { get; set; }

    public IList<FormSpecIssue> Issues { get; set; } = new List<FormSpecIssue>();

    public string? Mode { get; set; }

    public string? FormParamKey { get; set; }

    public string? NativeFormJson { get; set; }

    public string? StepJson { get; set; }
}
