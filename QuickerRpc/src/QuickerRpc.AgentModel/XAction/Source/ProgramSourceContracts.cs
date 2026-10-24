// Ported from Quicker Quicker.Ai.Workspace, revision 574556d76b0b10bd9a8a7951277435649650fab8.
using System;
using System.Collections.Generic;
using System.Linq;
using Newtonsoft.Json.Linq;

namespace QuickerRpc.AgentModel.XAction.Source;

/// <summary>Stable error codes for program source codec (see program-source-roundtrip.md §3.3).</summary>
public sealed class ProgramSourceException : Exception
{
    public ProgramSourceException(string code, string message)
        : base(message)
    {
        Code = code;
    }

    public string Code { get; }
}

/// <summary>1-based source line/column captured while parsing program.source.yaml.</summary>
public sealed class ProgramSourceLocation
{
    public ProgramSourceLocation(
        int lineNumber,
        string? lineText,
        int column = 1,
        int contentColumn = 0)
    {
        LineNumber = lineNumber;
        LineText = lineText;
        Column = column < 1 ? 1 : column;
        ContentColumn = contentColumn;
    }

    public int LineNumber { get; }

    /// <summary>1-based column of the first character of this token's value.</summary>
    public int Column { get; }

    /// <summary>
    /// 1-based column where later block-scalar lines start; 0 means unused (same as <see cref="Column"/>).
    /// </summary>
    public int ContentColumn { get; }

    public string? LineText { get; }
}

/// <summary>Attach / format YAML source locations on parsed tokens.</summary>
internal static class ProgramSourceLocations
{
    public static void Annotate(
        JToken token,
        int lineNumber,
        string? rawLine,
        int column = 1,
        int contentColumn = 0)
    {
        if (lineNumber <= 0)
        {
            return;
        }

        token.RemoveAnnotations<ProgramSourceLocation>();
        token.AddAnnotation(
            new ProgramSourceLocation(lineNumber, CompactLine(rawLine), column, contentColumn));
    }

    public static void AnnotateIfAbsent(
        JToken token,
        int lineNumber,
        string? rawLine,
        int column = 1,
        int contentColumn = 0)
    {
        if (token.Annotation<ProgramSourceLocation>() is not null)
        {
            return;
        }

        Annotate(token, lineNumber, rawLine, column, contentColumn);
    }

    public static ProgramSourceLocation? TryGet(JToken token) =>
        token.Annotation<ProgramSourceLocation>();

    /// <summary>
    /// Append path / line / original line / present keys for decode diagnostics.
    /// </summary>
    public static string FormatStepContext(JToken step, string path)
    {
        var parts = new System.Collections.Generic.List<string>();
        if (!string.IsNullOrWhiteSpace(path))
        {
            parts.Add($"path {path}");
        }

        var loc = TryGet(step);
        if (loc is not null)
        {
            parts.Add($"line {loc.LineNumber}");
            if (!string.IsNullOrWhiteSpace(loc.LineText))
            {
                parts.Add($"source `{loc.LineText}`");
            }
        }

        if (step is JObject obj)
        {
            var keys = obj.Properties().Select(p => p.Name).ToArray();
            parts.Add(keys.Length == 0
                ? "keys (none)"
                : "keys [" + string.Join(", ", keys) + "]");
        }

        return parts.Count == 0 ? string.Empty : " (" + string.Join("; ", parts) + ")";
    }

    private static string? CompactLine(string? rawLine)
    {
        if (string.IsNullOrEmpty(rawLine))
        {
            return rawLine;
        }

        var trimmed = rawLine.TrimEnd('\r');
        const int max = 160;
        if (trimmed.Length <= max)
        {
            return trimmed;
        }

        return trimmed.Substring(0, max - 1) + "…";
    }
}

public static class ProgramSourceCodes
{
    public const string RoundtripMismatch = "source_roundtrip_mismatch";
    public const string YamlAliasForbidden = "yaml_alias_forbidden";
    public const string MixedBind = "mixed_bind";
    /// <summary>A var/file/expr/interp/lit form nested inside an object snapshot. It is not evaluated.</summary>
    public const string NestedBind = "nested_bind";
    public const string LitDollarPrefix = "lit_dollar_prefix";
    public const string UnknownSugar = "unknown_sugar";
    /// <summary>Omitted control field, but the bound params belong to different branches.</summary>
    public const string BranchConflict = "branch_conflict";
    /// <summary>
    /// <c>>></c> on a catalog-known runner that does not declare the primary output key
    /// (no <c># >></c> on its card): the binding would never be written.
    /// </summary>
    public const string NoPrimaryOutput = "no_primary_output";
    public const string CawInvalid = "caw_invalid";
    public const string SchemaUnsupported = "schema_unsupported";
    public const string YamlParseError = "yaml_parse_error";
    /// <summary>Agent must edit program.source.yaml; data.json is derived.</summary>
    public const string UseProgramSourceYaml = "use_program_source_yaml";
}

public static class ProgramSourceSchemas
{
    public const string SourceV1 = "quicker.program.source.v1";
    public const string ActionV1 = "quicker.action.v1";

    /// <summary>Explicit input formats accepted by this codec, independent of native host capabilities.</summary>
    public static IReadOnlyList<string> SupportedFormats { get; } =
        Array.AsReadOnly(new[] { SourceV1, ActionV1 });
}
