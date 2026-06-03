using System;
using System.IO;
using System.Text;
using Newtonsoft.Json.Linq;
using QuickerRpc.AgentModel.XAction.Project;

namespace QuickerRpc.AgentModel.Form;

/// <summary>Reads qkrpc.form.v1 from <c>inputParams</c> param objects (formDef, dynamicFormForDictDef, or legacy formSpec).</summary>
public static class FormSpecParamReader
{
    /// <summary>
    /// Returns <see langword="false"/> with no error when the param is not an agent form spec (e.g. native formDef value).
    /// </summary>
    public static bool TryParseFormSpecParam(
        JObject paramObj,
        string paramRef,
        string? projectDirectory,
        out FormSpecDocument? spec,
        out string? errorMessage)
    {
        spec = null;
        errorMessage = null;

        if (paramObj["varKey"] is not null && paramObj["varKey"]!.Type != JTokenType.Null)
        {
            errorMessage = $"{paramRef}: agent form spec does not support varKey.";
            return false;
        }

        var hasFile = TryReadNonEmptyString(paramObj["file"], out var filePath);
        var valueToken = paramObj["value"];
        var hasValue = valueToken is not null && valueToken.Type != JTokenType.Null;

        if (hasFile && hasValue)
        {
            errorMessage = $"{paramRef}: 'file' and 'value' are mutually exclusive.";
            return false;
        }

        if (hasFile)
        {
            return TryParseFromFile(filePath!, paramRef, projectDirectory, out spec, out errorMessage);
        }

        if (hasValue)
        {
            if (!TokenLooksLikeFormSpec(valueToken))
            {
                return false;
            }

            var parse = FormSpecCompiler.TryParse(valueToken);
            if (!parse.Success)
            {
                errorMessage = $"{paramRef}: {parse.ErrorMessage}";
                return false;
            }

            spec = parse.Spec;
            return true;
        }

        if (FormSpecDocumentShape.IsInlineDocument(paramObj))
        {
            var parse = FormSpecCompiler.TryParse(paramObj);
            if (!parse.Success)
            {
                errorMessage = $"{paramRef}: {parse.ErrorMessage}";
                return false;
            }

            spec = parse.Spec;
            return true;
        }

        return false;
    }

    public static FormSpecParseResult TryParseParam(
        JObject paramObj,
        string paramRef,
        string? projectDirectory)
    {
        if (!TryParseFormSpecParam(paramObj, paramRef, projectDirectory, out var spec, out var errorMessage))
        {
            if (errorMessage is not null)
            {
                return FormSpecParseResult.Fail("INVALID_FORM_SPEC", errorMessage);
            }

            return FormSpecParseResult.Fail(
                "INVALID_FORM_SPEC",
                $"{paramRef}: provide .value (object or JSON string), .file (qkrpc.form.v1), or inline form spec object.");
        }

        return FormSpecParseResult.Ok(spec!);
    }

    private static bool TryParseFromFile(
        string filePath,
        string paramRef,
        string? projectDirectory,
        out FormSpecDocument? spec,
        out string? errorMessage)
    {
        spec = null;
        errorMessage = null;

        if (string.IsNullOrWhiteSpace(projectDirectory))
        {
            errorMessage =
                $"{paramRef}: form spec .file requires a project directory (use action apply/export project, or patch-file with resolvable base path).";
            return false;
        }

        try
        {
            var projectDir = QuickerProjectLayout.ResolveProjectDirectory(projectDirectory);
            var fullPath = XActionFileRefPath.ResolveFullPath(projectDir, filePath);
            if (!File.Exists(fullPath))
            {
                errorMessage = $"{paramRef}: file not found: {filePath}";
                return false;
            }

            var text = File.ReadAllText(fullPath, Encoding.UTF8);
            if (!FormSpecDocumentShape.LooksLikeFormSpecText(text)
                && !FormSpecDocumentShape.LooksLikeFormSpecFile(filePath))
            {
                return false;
            }

            var parse = FormSpecCompiler.TryParse(text);
            if (!parse.Success)
            {
                errorMessage = $"{paramRef}: {parse.ErrorMessage}";
                return false;
            }

            spec = parse.Spec;
            return true;
        }
        catch (Exception ex)
        {
            errorMessage = $"{paramRef}: {ex.Message}";
            return false;
        }
    }

    private static bool TokenLooksLikeFormSpec(JToken valueToken)
    {
        if (valueToken.Type == JTokenType.String)
        {
            return FormSpecDocumentShape.LooksLikeFormSpecText(valueToken.Value<string>());
        }

        return valueToken is JObject obj && FormSpecDocumentShape.IsInlineDocument(obj);
    }

    private static bool TryReadNonEmptyString(JToken? token, out string? value)
    {
        value = token?.Type == JTokenType.String ? token.Value<string>()?.Trim() : null;
        return !string.IsNullOrEmpty(value);
    }
}
