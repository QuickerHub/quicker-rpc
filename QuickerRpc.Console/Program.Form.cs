using System.Text.Json;
using QuickerRpc.AgentModel.Form;

namespace QuickerRpc.Console;

internal static partial class Program
{
    private static Task<int> RunFormAsync(FormOptions options)
    {
        var verb = (options.Command ?? string.Empty).Trim().ToLowerInvariant();
        return verb switch
        {
            "validate" => RunFormValidateAsync(options),
            "build" => RunFormBuildAsync(options),
            _ => ReportUnknownFormVerbAsync(options),
        };
    }

    private static Task<int> ReportUnknownFormVerbAsync(FormOptions options) =>
        EmitErrorAndFailAsync(options.Json, "UNKNOWN_FORM_VERB",
            "Use: form validate | form build (see qkrpc help --json)");

    private static Task<int> RunFormValidateAsync(FormOptions options) =>
        RunFormCoreAsync(options, build: false);

    private static Task<int> RunFormBuildAsync(FormOptions options) =>
        RunFormCoreAsync(options, build: true);

    private static Task<int> RunFormCoreAsync(FormOptions options, bool build)
    {
        var (ok, text, errorCode, errorMessage) = QkrpcJsonPayload.Resolve(
            options.Spec,
            options.File,
            "spec");
        if (!ok)
        {
            return EmitErrorAndFailAsync(options.Json, errorCode!, errorMessage!);
        }

        var parse = FormSpecCompiler.TryParse(text!);
        if (!parse.Success)
        {
            return EmitErrorAndFailAsync(options.Json, parse.ErrorCode!, parse.ErrorMessage!);
        }

        if (build)
        {
            var result = FormSpecCompiler.Build(parse.Spec!);
            if (options.Json)
            {
                global::System.Console.WriteLine(JsonSerializer.Serialize(
                    new
                    {
                        ok = result.Success,
                        action = "form-build",
                        success = result.Success,
                        mode = result.Mode,
                        formParamKey = result.FormParamKey,
                        nativeFormJson = result.NativeFormJson,
                        step = result.Success && !string.IsNullOrWhiteSpace(result.StepJson)
                            ? JsonSerializer.Deserialize<object>(result.StepJson!)
                            : null,
                        issues = result.Issues.Count > 0 ? result.Issues : null,
                    },
                    QkrpcJson.CliOutput));
            }
            else if (result.Success)
            {
                global::System.Console.WriteLine(result.StepJson);
            }
            else
            {
                WriteFormIssues(result.Issues);
            }

            return Task.FromResult(result.Success ? ExitCodes.Success : ExitCodes.Error);
        }

        var validation = FormSpecValidator.Validate(parse.Spec);
        if (options.Json)
        {
            global::System.Console.WriteLine(JsonSerializer.Serialize(
                new
                {
                    ok = validation.Success,
                    action = "form-validate",
                    success = validation.Success,
                    schema = FormSpecDocument.SchemaId,
                    fieldCount = parse.Spec!.Fields.Count,
                    mode = parse.Spec.Mode,
                    issues = validation.Issues.Count > 0 ? validation.Issues : null,
                },
                QkrpcJson.CliOutput));
        }
        else if (validation.Success)
        {
            global::System.Console.WriteLine("valid");
        }
        else
        {
            WriteFormIssues(validation.Issues);
        }

        return Task.FromResult(validation.Success ? ExitCodes.Success : ExitCodes.Error);
    }

    private static void WriteFormIssues(IList<FormSpecIssue> issues)
    {
        foreach (var issue in issues)
        {
            var prefix = string.IsNullOrWhiteSpace(issue.Path) ? "" : issue.Path + ": ";
            global::System.Console.Error.WriteLine(prefix + issue.Message);
        }
    }
}
